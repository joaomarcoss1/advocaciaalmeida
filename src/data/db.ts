import type {
  AjusteDia, AjusteFolha, Auditoria, Cargo, Config, ConfigPonto, Escala, Feriado, Folha, Funcionario, FuncionarioBasico,
  Ocorrencia, Papel, RegistroPonto, TipoMarcacao, Usuario,
} from '@/lib/types';

export interface Crud<T extends { id: string }> {
  list(): Promise<T[]>;
  insert(row: Partial<T>): Promise<T>;
  update(id: string, patch: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
}
export interface FolhasRepo extends Crud<Folha> {
  /** Insere ou atualiza pela chave (funcionário, início, fim). */
  upsertMany(rows: Omit<Folha, 'id' | 'created_at' | 'updated_at'>[]): Promise<void>;
}

export interface Sessao { id: string; email: string; nome: string; papel: Papel }

export type TipoDocumento = 'folha' | 'holerite' | 'frequencia' | 'espelho';
export interface DocumentoVerificado { codigo: string; tipo: TipoDocumento; titulo: string; periodo: string; resumo: Record<string, unknown>; hash: string; emitido_por: string; emitido_em: string }
export interface PessoaPonto { id: string; nome: string; cargo_nome: string | null; escala_id: string | null }
export interface ContextoPonto { ponto: ConfigPonto; escritorio_nome: string; feriado: string | null }

export type PontoErro =
  | 'PIN_INVALIDO' | 'PIN_BLOQUEADO' | 'TIPO_INVALIDO' | 'GPS_OBRIGATORIO' | 'FORA_DA_AREA' | 'JA_REGISTRADO'
  | 'JUSTIFICATIVA_OBRIGATORIA' | 'HORA_INVALIDA' | 'USE_PONTO_NORMAL' | 'DATA_MUITO_ANTIGA';
export type PontoResp<T = object> = ({ ok: true } & T) | { ok: false; erro: PontoErro; detalhe?: string | null };

export const PONTO_ERRO_MSG: Record<PontoErro, string> = {
  PIN_INVALIDO: 'PIN incorreto.',
  PIN_BLOQUEADO: 'Muitas tentativas incorretas. Aguarde 10 minutos ou peça ao administrador para redefinir seu PIN.',
  TIPO_INVALIDO: 'Tipo de marcação inválido.',
  GPS_OBRIGATORIO: 'Ative a localização (GPS) para registrar o ponto.',
  FORA_DA_AREA: 'Você está fora da área do escritório.',
  JA_REGISTRADO: 'Essa marcação já foi registrada hoje.',
  JUSTIFICATIVA_OBRIGATORIA: 'Informe uma justificativa.',
  HORA_INVALIDA: 'Horário inválido.',
  USE_PONTO_NORMAL: 'Para hoje, use o registro normal de ponto.',
  DATA_MUITO_ANTIGA: 'Só é possível solicitar ajustes dos últimos 45 dias.',
};

export interface BaterArgs { funcionario_id: string; pin: string; tipo: TipoMarcacao; justificativa?: string; lat?: number | null; lng?: number | null }
export interface RetroativoArgs { funcionario_id: string; pin: string; data: string; tipo: TipoMarcacao; hora: string; justificativa: string }
export type MarcacaoHistorico = Pick<RegistroPonto,
  'id' | 'data' | 'tipo' | 'horario_previsto' | 'horario_real' | 'diferenca_minutos' | 'status' | 'justificativa' | 'status_aprovacao' | 'retroativo' | 'motivo_rejeicao'>;

export interface Db {
  modo: 'local' | 'supabase';
  /** Preparação assíncrona (dados de demonstração no modo local). */
  init?(): Promise<void>;
  cargos: Crud<Cargo>;
  escalas: Crud<Escala>;
  funcionarios: Crud<Funcionario>;
  registros: Crud<RegistroPonto>;
  ocorrencias: Crud<Ocorrencia>;
  feriados: Crud<Feriado>;
  ajustes: Crud<AjusteFolha>;
  ajustesDia: Crud<AjusteDia>;
  folhas: FolhasRepo;
  usuarios: { list(): Promise<Usuario[]> };
  /** Gestão de acessos ao painel (só administrador). */
  acessos: {
    criar(a: { nome: string; email: string; papel: Papel; senha: string }): Promise<void>;
    atualizar(id: string, a: { nome: string; papel: Papel; ativo: boolean }): Promise<void>;
    redefinirSenha(id: string, senha: string): Promise<void>;
    remover(id: string): Promise<void>;
  };
  auditoria: Crud<Auditoria>;
  /** Autenticidade dos PDFs: cada documento emitido recebe um código e um QR Code verificável em /verificar. */
  documentos: {
    registrar(d: { tipo: TipoDocumento; titulo: string; periodo: string; resumo: Record<string, unknown>; hash: string }): Promise<string>;
    verificar(codigo: string): Promise<DocumentoVerificado | null>;
  };
  config: { get(): Promise<Config>; save(c: Config): Promise<void> };
  auth: {
    sessao(): Promise<Sessao | null>;
    /** Devolve 'mfa' quando a conta tem verificação em duas etapas: falta informar o código do aplicativo. */
    entrar(email: string, senha: string): Promise<Sessao | 'mfa'>;
    verificarMfa(codigo: string): Promise<Sessao>;
    sair(): Promise<void>;
    mfa: {
      disponivel: boolean;
      estado(): Promise<{ ativo: boolean; fatores: { id: string; nome: string; criado: string }[] }>;
      iniciar(): Promise<{ fatorId: string; qr: string; segredo: string }>;
      confirmar(fatorId: string, codigo: string): Promise<void>;
      remover(fatorId: string): Promise<void>;
    };
  };
  /** Equipe sem dados sensíveis (usada pela gerência). */
  equipe(): Promise<FuncionarioBasico[]>;
  definirPin(funcionarioId: string, pin: string): Promise<void>;
  aprovarPonto(id: string, acao: 'aprovar' | 'rejeitar', motivo?: string): Promise<void>;
  ponto: {
    /** Busca no servidor (mín. 3 letras, no máx. 5 resultados): a lista completa da equipe nunca é exposta. */
    buscar(termo: string): Promise<PessoaPonto[]>;
    escala(escalaId: string): Promise<Escala | null>;
    contexto(): Promise<ContextoPonto>;
    bater(a: BaterArgs): Promise<PontoResp<{ status: RegistroPonto['status']; diferenca_minutos: number; horario_real: string }>>;
    historico(funcionarioId: string, pin: string, limite?: number): Promise<PontoResp<{ registros: MarcacaoHistorico[] }>>;
    retroativo(a: RetroativoArgs): Promise<PontoResp>;
  };
}

let promessa: Promise<Db> | null = null;
export function getDb(): Promise<Db> {
  return (promessa ??= (async () => {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    let db: Db;
    if (url && key) {
      const { criarDbSupabase } = await import('./supabase');
      db = criarDbSupabase(url, key);
    } else {
      const { criarDbLocal } = await import('./local');
      db = criarDbLocal();
    }
    await db.init?.();
    return db;
  })());
}
