/** Banco em memória persistido no localStorage: modo demonstração/teste, sem servidor. */
import { CONFIG_PADRAO, mesclarConfig } from '@/lib/config';
import { agoraBR, brParaIso, hhmmParaMin, isoParaBR } from '@/lib/datetime';
import { classificar, distanciaMetros, exigeJustificativa, previstoDoTipo, turnoDaData } from '@/lib/ponto';
import type { Auditoria, Config, Escala, Folha, Funcionario, RegistroPonto, Usuario } from '@/lib/types';
import type { BaterArgs, Crud, Db, FolhasRepo, MarcacaoHistorico, PontoErro, PontoResp, RetroativoArgs, Sessao } from './db';
import { gerarSeed, hashSecreto } from './seed';

const P = 'almeida.v1.';
const lerTabela = <T,>(t: string): T[] => {
  try { return JSON.parse(localStorage.getItem(P + t) || '[]') as T[]; } catch { return []; }
};
const gravarTabela = (t: string, rows: unknown[]) => localStorage.setItem(P + t, JSON.stringify(rows));
const uuid = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

function crud<T extends { id: string }>(tabela: string): Crud<T> {
  return {
    async list() { return lerTabela<T>(tabela); },
    async insert(row) {
      const novo = { created_at: new Date().toISOString(), ...row, id: uuid() } as unknown as T;
      gravarTabela(tabela, [...lerTabela<T>(tabela), novo]);
      return novo;
    },
    async update(id, patch) {
      const rows = lerTabela<T>(tabela);
      const i = rows.findIndex(r => r.id === id);
      if (i < 0) throw new Error('Registro não encontrado.');
      rows[i] = { ...rows[i], ...patch };
      gravarTabela(tabela, rows);
      return rows[i];
    },
    async remove(id) { gravarTabela(tabela, lerTabela<T>(tabela).filter(r => r.id !== id)); },
  };
}

export function criarDbLocal(): Db {
  const init = async () => {
    if (localStorage.getItem(P + 'seeded')) return;
    const s = await gerarSeed();
    for (const [k, v] of Object.entries(s)) gravarTabela(k, v);
    localStorage.setItem(P + 'config', JSON.stringify(CONFIG_PADRAO));
    localStorage.setItem(P + 'seeded', '1');
  };
  const registros = crud<RegistroPonto>('registros');
  const funcionarios = crud<Funcionario>('funcionarios');
  const usuarios = crud<Usuario>('usuarios');
  const folhas: FolhasRepo = {
    ...crud<Folha>('folhas'),
    async upsertMany(rows) {
      const atuais = lerTabela<Folha>('folhas');
      const agora = new Date().toISOString();
      for (const r of rows) {
        const i = atuais.findIndex(x => x.funcionario_id === r.funcionario_id && x.periodo_inicio === r.periodo_inicio && x.periodo_fim === r.periodo_fim);
        if (i >= 0) atuais[i] = { ...atuais[i], ...r, updated_at: agora };
        else atuais.push({ ...r, id: uuid(), created_at: agora, updated_at: agora });
      }
      gravarTabela('folhas', atuais);
    },
  };

  // ---- PIN ----
  const tentativas = () => JSON.parse(localStorage.getItem(P + 'pin_tentativas') || '{}') as Record<string, { falhas: number[]; }>;
  async function validarPin(fid: string, pin: string): Promise<'ok' | 'PIN_INVALIDO' | 'PIN_BLOQUEADO'> {
    const t = tentativas();
    const agora = Date.now();
    const recentes = (t[fid]?.falhas ?? []).filter(x => agora - x < 10 * 60_000);
    if (recentes.length >= 5) return 'PIN_BLOQUEADO';
    const f = (await funcionarios.list()).find(x => x.id === fid && x.ativo);
    const ok = !!f?.pin_hash && f.pin_hash === (await hashSecreto(fid, pin));
    t[fid] = { falhas: ok ? [] : [...recentes, agora] };
    localStorage.setItem(P + 'pin_tentativas', JSON.stringify(t));
    return ok ? 'ok' : 'PIN_INVALIDO';
  }
  const err = (erro: PontoErro, detalhe?: string): { ok: false; erro: PontoErro; detalhe?: string } => ({ ok: false, erro, detalhe });
  const cfgAtual = (): Config => mesclarConfig(JSON.parse(localStorage.getItem(P + 'config') || 'null'));
  const escalaDe = (fid: string): Escala | null => {
    const f = lerTabela<Funcionario>('funcionarios').find(x => x.id === fid);
    return lerTabela<Escala>('escalas').find(e => e.id === f?.escala_id) ?? null;
  };

  const db: Db = {
    modo: 'local',
    init,
    cargos: crud('cargos'),
    escalas: crud('escalas'),
    funcionarios,
    registros,
    ocorrencias: crud('ocorrencias'),
    feriados: crud('feriados'),
    ajustes: crud('ajustes'),
    folhas,
    usuarios: { list: () => usuarios.list() },
    acessos: {
      async criar(a) {
        const email = a.email.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Informe um e-mail válido.');
        if (a.senha.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
        if (a.nome.trim().length < 2) throw new Error('Informe o nome.');
        if ((await usuarios.list()).some(u => u.email === email)) throw new Error('Já existe um usuário com esse e-mail.');
        await usuarios.insert({ nome: a.nome.trim(), email, papel: a.papel, ativo: true, senha_hash: await hashSecreto(email, a.senha) });
      },
      async atualizar(id, a) {
        const todos = await usuarios.list();
        const restantes = todos.filter(u => u.id !== id && u.papel === 'admin' && u.ativo).length + (a.papel === 'admin' && a.ativo ? 1 : 0);
        if (restantes < 1) throw new Error('Precisa existir pelo menos um administrador ativo.');
        await usuarios.update(id, { nome: a.nome.trim() || undefined, papel: a.papel, ativo: a.ativo } as Partial<Usuario>);
      },
      async redefinirSenha(id, senha) {
        if (senha.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
        const u = (await usuarios.list()).find(x => x.id === id);
        if (!u) throw new Error('Registro não encontrado.');
        await usuarios.update(id, { senha_hash: await hashSecreto(u.email, senha) });
      },
      async remover(id) {
        const sessao = await db.auth.sessao();
        if (sessao?.id === id) throw new Error('Você não pode remover o seu próprio acesso.');
        const todos = await usuarios.list();
        if (todos.filter(u => u.id !== id && u.papel === 'admin' && u.ativo).length < 1) throw new Error('Precisa existir pelo menos um administrador ativo.');
        await usuarios.remove(id);
      },
    },
    auditoria: crud<Auditoria>('auditoria'),
    config: {
      async get() { return cfgAtual(); },
      async save(c) { localStorage.setItem(P + 'config', JSON.stringify(c)); },
    },
    auth: {
      async sessao() {
        try { return JSON.parse(localStorage.getItem(P + 'sessao') || 'null') as Sessao | null; } catch { return null; }
      },
      async entrar(email, senha) {
        const e = email.trim().toLowerCase();
        const u = (await usuarios.list()).find(x => x.email === e && x.ativo);
        if (!u || u.senha_hash !== (await hashSecreto(e, senha))) throw new Error('E-mail ou senha incorretos.');
        const s: Sessao = { id: u.id, email: u.email, nome: u.nome, papel: u.papel };
        localStorage.setItem(P + 'sessao', JSON.stringify(s));
        return s;
      },
      async sair() { localStorage.removeItem(P + 'sessao'); },
    },
    async equipe() {
      return (await funcionarios.list()).map(f => ({
        id: f.id, nome: f.nome, cargo_id: f.cargo_id, escala_id: f.escala_id, ativo: f.ativo,
        data_admissao: f.data_admissao, data_desligamento: f.data_desligamento, vinculo: f.vinculo, tem_pin: f.tem_pin,
      }));
    },
    async definirPin(fid, pin) {
      if (!/^\d{4,8}$/.test(pin)) throw new Error('O PIN deve ter de 4 a 8 números.');
      await funcionarios.update(fid, { pin_hash: await hashSecreto(fid, pin), tem_pin: true });
      const t = tentativas(); delete t[fid]; localStorage.setItem(P + 'pin_tentativas', JSON.stringify(t));
    },
    async aprovarPonto(rid, acao, motivo) {
      const r = (await registros.list()).find(x => x.id === rid);
      if (!r) throw new Error('Registro não encontrado.');
      const sessao = await db.auth.sessao();
      if (acao === 'rejeitar') {
        if (!motivo || motivo.trim().length < 3) throw new Error('Informe o motivo da rejeição.');
        await registros.update(rid, { status_aprovacao: 'rejeitado', motivo_rejeicao: motivo.trim(), aprovado_por: sessao?.id ?? null, aprovado_em: new Date().toISOString() });
        return;
      }
      const real = isoParaBR(r.horario_real);
      const c = classificar(r.tipo, r.horario_previsto, real.minutos, cfgAtual().ponto);
      await registros.update(rid, { status_aprovacao: 'aprovado', status: c.status, diferenca_minutos: c.diferenca, motivo_rejeicao: null, aprovado_por: sessao?.id ?? null, aprovado_em: new Date().toISOString() });
    },
    ponto: {
      async listarAtivos() {
        const cargos = lerTabela<{ id: string; nome: string }>('cargos');
        const hoje = agoraBR().data;
        return (await funcionarios.list())
          .filter(f => f.ativo && f.tem_pin && (!f.data_desligamento || f.data_desligamento >= hoje))
          .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
          .map(f => ({ id: f.id, nome: f.nome, cargo_nome: cargos.find(c => c.id === f.cargo_id)?.nome ?? null, escala_id: f.escala_id }));
      },
      async escala(escalaId) { return lerTabela<Escala>('escalas').find(e => e.id === escalaId) ?? null; },
      async contexto() {
        const c = cfgAtual();
        const hoje = agoraBR().data;
        const fer = lerTabela<{ data: string; nome: string }>('feriados').find(f => f.data === hoje);
        return { ponto: c.ponto, escritorio_nome: c.escritorio.nome, feriado: fer?.nome ?? null };
      },
      async bater(a: BaterArgs): Promise<PontoResp<{ status: RegistroPonto['status']; diferenca_minutos: number; horario_real: string }>> {
        const pv = await validarPin(a.funcionario_id, a.pin);
        if (pv !== 'ok') return err(pv);
        const cfg = cfgAtual().ponto;
        const agora = agoraBR();
        if (cfg.geofence_ativo) {
          if (a.lat == null || a.lng == null) return err('GPS_OBRIGATORIO');
          const d = distanciaMetros(a.lat, a.lng, cfg.geofence_lat, cfg.geofence_lng);
          if (d > cfg.geofence_raio_m) return err('FORA_DA_AREA', `${Math.round(d)} m (máx. ${cfg.geofence_raio_m} m)`);
        }
        const regs = await registros.list();
        if (regs.some(r => r.funcionario_id === a.funcionario_id && r.data === agora.data && r.tipo === a.tipo && r.status_aprovacao !== 'rejeitado')) return err('JA_REGISTRADO');
        const turno = turnoDaData(escalaDe(a.funcionario_id), agora.data);
        const previsto = previstoDoTipo(turno, a.tipo);
        const c = classificar(a.tipo, previsto, agora.minutos, cfg);
        if (exigeJustificativa(c.status) && (a.justificativa ?? '').trim().length < 3) return err('JUSTIFICATIVA_OBRIGATORIA', c.status);
        await registros.insert({
          funcionario_id: a.funcionario_id, data: agora.data, tipo: a.tipo, horario_previsto: previsto, horario_real: agora.iso,
          diferenca_minutos: c.diferenca, status: c.status, justificativa: a.justificativa?.trim() || null,
          latitude: a.lat ?? null, longitude: a.lng ?? null, status_aprovacao: 'aprovado', retroativo: false,
          motivo_rejeicao: null, aprovado_por: null, aprovado_em: null,
        });
        return { ok: true, status: c.status, diferenca_minutos: c.diferenca, horario_real: agora.iso };
      },
      async historico(fid, pin, limite = 12) {
        const pv = await validarPin(fid, pin);
        if (pv !== 'ok') return err(pv);
        const regs = (await registros.list()).filter(r => r.funcionario_id === fid)
          .sort((a, b) => b.horario_real.localeCompare(a.horario_real)).slice(0, Math.min(Math.max(limite, 1), 60));
        const registrosOut: MarcacaoHistorico[] = regs.map(r => ({
          id: r.id, data: r.data, tipo: r.tipo, horario_previsto: r.horario_previsto, horario_real: r.horario_real,
          diferenca_minutos: r.diferenca_minutos, status: r.status, justificativa: r.justificativa,
          status_aprovacao: r.status_aprovacao, retroativo: r.retroativo, motivo_rejeicao: r.motivo_rejeicao,
        }));
        return { ok: true, registros: registrosOut };
      },
      async retroativo(a: RetroativoArgs) {
        const pv = await validarPin(a.funcionario_id, a.pin);
        if (pv !== 'ok') return err(pv);
        const hoje = agoraBR().data;
        if (!/^[0-2]\d:[0-5]\d$/.test(a.hora)) return err('HORA_INVALIDA');
        if (a.data >= hoje) return err('USE_PONTO_NORMAL');
        const limite = new Date(Date.now() - 3 * 3600_000 - 45 * 86400_000).toISOString().slice(0, 10);
        if (a.data < limite) return err('DATA_MUITO_ANTIGA');
        if (a.justificativa.trim().length < 5) return err('JUSTIFICATIVA_OBRIGATORIA');
        const regs = await registros.list();
        if (regs.some(r => r.funcionario_id === a.funcionario_id && r.data === a.data && r.tipo === a.tipo && r.status_aprovacao !== 'rejeitado')) return err('JA_REGISTRADO');
        const previsto = previstoDoTipo(turnoDaData(escalaDe(a.funcionario_id), a.data), a.tipo);
        await registros.insert({
          funcionario_id: a.funcionario_id, data: a.data, tipo: a.tipo, horario_previsto: previsto, horario_real: brParaIso(a.data, a.hora),
          diferenca_minutos: previsto ? hhmmParaMin(a.hora) - hhmmParaMin(previsto) : 0, status: 'pendente', justificativa: a.justificativa.trim(),
          latitude: null, longitude: null, status_aprovacao: 'pendente', retroativo: true, motivo_rejeicao: null, aprovado_por: null, aprovado_em: null,
        });
        return { ok: true };
      },
    },
  };
  return db;
}
