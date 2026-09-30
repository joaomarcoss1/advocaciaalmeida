/** Implementação com Supabase (projeto novo do escritório). O schema está em supabase/migrations. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mesclarConfig } from '@/lib/config';
import type { Config, Escala, Folha, FuncionarioBasico, Usuario } from '@/lib/types';
import type { Crud, Db, FolhasRepo, PontoResp, Sessao } from './db';

function falha(e: { message?: string } | null): never {
  const m = e?.message ?? 'Erro inesperado';
  const traduz: Record<string, string> = {
    SEM_PERMISSAO: 'Você não tem permissão para esta ação.',
    MOTIVO_OBRIGATORIO: 'Informe o motivo da rejeição.',
    PIN_FORMATO: 'O PIN deve ter de 4 a 8 números.',
    NAO_ENCONTRADO: 'Registro não encontrado.',
    EMAIL_EXISTE: 'Já existe um usuário com esse e-mail.',
    EMAIL_INVALIDO: 'Informe um e-mail válido.',
    SENHA_CURTA: 'A senha deve ter pelo menos 8 caracteres.',
    PAPEL_INVALIDO: 'Papel inválido.',
    NOME_OBRIGATORIO: 'Informe o nome.',
    ULTIMO_ADMIN: 'Precisa existir pelo menos um administrador ativo.',
    NAO_REMOVER_A_SI: 'Você não pode remover o seu próprio acesso.',
  };
  throw new Error(traduz[m] ?? m);
}

export function criarDbSupabase(url: string, key: string): Db {
  const sb: SupabaseClient = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });

  function crud<T extends { id: string }>(tabela: string, ordem?: string): Crud<T> {
    return {
      async list() {
        // Pagina de 1000 em 1000 (limite padrão do PostgREST)
        const out: T[] = [];
        for (let de = 0; ; de += 1000) {
          let q = sb.from(tabela).select('*').range(de, de + 999);
          if (ordem) q = q.order(ordem);
          const { data, error } = await q;
          if (error) falha(error);
          out.push(...((data ?? []) as T[]));
          if (!data || data.length < 1000) break;
        }
        return out;
      },
      async insert(row) {
        const { id: _id, ...resto } = row as Record<string, unknown>;
        const { data, error } = await sb.from(tabela).insert(resto).select().single();
        if (error) falha(error);
        return data as T;
      },
      async update(id, patch) {
        const { id: _id, ...resto } = patch as Record<string, unknown>;
        const { data, error } = await sb.from(tabela).update(resto).eq('id', id).select().single();
        if (error) falha(error);
        return data as T;
      },
      async remove(id) {
        const { error } = await sb.from(tabela).delete().eq('id', id);
        if (error) falha(error);
      },
    };
  }

  const folhas: FolhasRepo = {
    ...crud<Folha>('folhas'),
    async upsertMany(rows) {
      if (!rows.length) return;
      const { error } = await sb.from('folhas').upsert(
        rows.map(r => ({ ...r, updated_at: new Date().toISOString() })),
        { onConflict: 'funcionario_id,periodo_inicio,periodo_fim' },
      );
      if (error) falha(error);
    },
  };

  const usuarios = {
    async list() {
      const { data, error } = await sb.from('perfis').select('id,nome,email,papel,ativo').order('nome');
      if (error) falha(error);
      return (data ?? []) as Usuario[];
    },
  };

  async function sessaoAtual(): Promise<Sessao | null> {
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    const { data: perfil } = await sb.from('perfis').select('id,nome,email,papel,ativo').eq('id', u.id).maybeSingle();
    if (!perfil || !perfil.ativo) return null;
    return { id: u.id, email: perfil.email, nome: perfil.nome, papel: perfil.papel };
  }

  async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(nome, args);
    if (error) falha(error);
    return data as T;
  }

  const db: Db = {
    modo: 'supabase',
    cargos: crud('cargos', 'nome'),
    escalas: crud('escalas', 'nome'),
    funcionarios: crud('funcionarios', 'nome'),
    registros: crud('registros_ponto'),
    ocorrencias: crud('ocorrencias'),
    feriados: crud('feriados', 'data'),
    ajustes: crud('ajustes_folha'),
    folhas,
    usuarios,
    auditoria: crud('auditoria'),
    config: {
      async get() {
        const { data } = await sb.from('configuracoes').select('dados').eq('id', 'global').maybeSingle();
        return mesclarConfig(data?.dados as Partial<Config> | undefined);
      },
      async save(c) {
        const { error } = await sb.from('configuracoes').upsert({ id: 'global', dados: c });
        if (error) falha(error);
      },
    },
    auth: {
      sessao: sessaoAtual,
      async entrar(email, senha) {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
        if (error) throw new Error('E-mail ou senha incorretos.');
        const s = await sessaoAtual();
        if (!s) {
          await sb.auth.signOut();
          throw new Error('Seu usuário não tem acesso ao painel. Peça ao administrador para liberar o acesso.');
        }
        return s;
      },
      async sair() { await sb.auth.signOut(); },
    },
    acessos: {
      async criar(a) { await rpc('criar_usuario', { p_email: a.email, p_senha: a.senha, p_nome: a.nome, p_papel: a.papel }); },
      async atualizar(id, a) { await rpc('atualizar_usuario', { p_id: id, p_nome: a.nome, p_papel: a.papel, p_ativo: a.ativo }); },
      async redefinirSenha(id, senha) { await rpc('redefinir_senha_usuario', { p_id: id, p_senha: senha }); },
      async remover(id) { await rpc('remover_usuario', { p_id: id }); },
    },
    equipe: () => rpc<FuncionarioBasico[]>('equipe'),
    async definirPin(fid, pin) { await rpc('definir_pin', { p_func_id: fid, p_pin: pin }); },
    async aprovarPonto(id, acao, motivo) { await rpc('aprovar_ponto', { p_id: id, p_acao: acao, p_motivo: motivo ?? null }); },
    ponto: {
      listarAtivos: () => rpc('ponto_lista_ativos'),
      async escala(escalaId) { return (await rpc<Escala | null>('ponto_escala', { p_escala_id: escalaId })) ?? null; },
      contexto: () => rpc('ponto_contexto').then(c => {
        const x = c as { ponto?: Partial<Config['ponto']>; escritorio_nome?: string; feriado?: string | null };
        return { ponto: mesclarConfig({ ponto: x.ponto as Config['ponto'] }).ponto, escritorio_nome: x.escritorio_nome ?? '', feriado: x.feriado ?? null };
      }),
      bater: a => rpc<PontoResp<never>>('ponto_bater', {
        p_func_id: a.funcionario_id, p_pin: a.pin, p_tipo: a.tipo, p_justificativa: a.justificativa ?? null, p_lat: a.lat ?? null, p_lng: a.lng ?? null,
      }) as ReturnType<Db['ponto']['bater']>,
      historico: (fid, pin, limite = 12) => rpc('ponto_historico', { p_func_id: fid, p_pin: pin, p_limite: limite }) as ReturnType<Db['ponto']['historico']>,
      retroativo: a => rpc('ponto_retroativo', {
        p_func_id: a.funcionario_id, p_pin: a.pin, p_data: a.data, p_tipo: a.tipo, p_hora: a.hora, p_justificativa: a.justificativa,
      }) as ReturnType<Db['ponto']['retroativo']>,
    },
  };
  return db;
}
