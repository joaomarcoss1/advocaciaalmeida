/** Dias da semana como no JS Date: 0 = domingo … 6 = sábado. A escala cobre de segunda (1) a sábado (6). */
export const DIAS_ESCALA = [1, 2, 3, 4, 5, 6] as const;
export const DIA_LABEL: Record<number, string> = {
  0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado',
};
export const DIA_CURTO: Record<number, string> = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };

export type CategoriaCargo = 'juridico' | 'gerencia' | 'administrativo' | 'estagio' | 'apoio';
export const CATEGORIA_LABEL: Record<CategoriaCargo, string> = {
  juridico: 'Jurídico',
  gerencia: 'Gerência',
  administrativo: 'Administrativo',
  estagio: 'Estágio',
  apoio: 'Apoio',
};

export interface Cargo {
  id: string;
  nome: string;
  categoria: CategoriaCargo;
  descricao: string | null;
  ativo: boolean;
}

/** Expediente de um dia da escala. Sem intervalo (campos vazios) = jornada contínua. */
export interface TurnoDia {
  ativo: boolean;
  entrada: string;
  saida_intervalo: string;
  retorno_intervalo: string;
  saida: string;
}

export interface Escala {
  id: string;
  nome: string;
  /** Chaves 1..6 (segunda a sábado). */
  dias: Record<number, TurnoDia>;
  ativo: boolean;
}

export type Vinculo = 'clt' | 'estagio' | 'pj' | 'socio';
export const VINCULO_LABEL: Record<Vinculo, string> = { clt: 'CLT', estagio: 'Estágio', pj: 'PJ / Autônomo', socio: 'Sócio' };

export interface Funcionario {
  id: string;
  nome: string;
  cpf: string | null;
  email: string | null;
  telefone: string | null;
  cargo_id: string | null;
  escala_id: string | null;
  vinculo: Vinculo;
  /** Salário mensal bruto (ou bolsa, no caso de estágio). É a base da diária. */
  salario_mensal: number;
  data_admissao: string;
  data_desligamento: string | null;
  oab: string | null;
  pix: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo_conta: string | null;
  /** Diária fixa (opcional). Se preenchida, substitui o cálculo salário ÷ dias previstos. */
  diaria_fixa?: number | null;
  tem_pin: boolean;
  /** PIN antigo de 4 a 5 dígitos (redefinir). */
  pin_curto?: boolean;
  /** Somente no modo local. No Supabase o hash fica em tabela separada, nunca vai ao navegador. */
  pin_hash?: string | null;
  ativo: boolean;
  observacoes: string | null;
  created_at: string;
}

/** Visão sem dados sensíveis (salário, CPF, banco) usada pela gerência e pela tela de ponto. */
export type FuncionarioBasico = Pick<Funcionario, 'id' | 'nome' | 'cargo_id' | 'escala_id' | 'ativo' | 'data_admissao' | 'data_desligamento' | 'vinculo' | 'tem_pin'>;

export type TipoMarcacao = 'entrada' | 'saida_intervalo' | 'retorno_intervalo' | 'saida';
export const TIPO_MARCACAO_LABEL: Record<TipoMarcacao, string> = {
  entrada: 'Entrada',
  saida_intervalo: 'Saída para intervalo',
  retorno_intervalo: 'Retorno do intervalo',
  saida: 'Encerrar expediente',
};
export type StatusMarcacao = 'no_horario' | 'tolerancia' | 'atraso' | 'saida_antecipada' | 'extra' | 'manual' | 'pendente';
export type StatusAprovacao = 'aprovado' | 'pendente' | 'rejeitado';

export interface RegistroPonto {
  id: string;
  funcionario_id: string;
  data: string;
  tipo: TipoMarcacao;
  horario_previsto: string | null;
  /** Instante real (ISO/UTC). */
  horario_real: string;
  diferenca_minutos: number | null;
  status: StatusMarcacao;
  justificativa: string | null;
  latitude: number | null;
  longitude: number | null;
  status_aprovacao: StatusAprovacao;
  retroativo: boolean;
  motivo_rejeicao: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  created_at: string;
}

export type TipoOcorrencia = 'atestado' | 'declaracao' | 'audiencia_externa' | 'folga_compensacao' | 'ferias' | 'licenca' | 'outro';
export const OCORRENCIA_LABEL: Record<TipoOcorrencia, string> = {
  atestado: 'Atestado médico',
  declaracao: 'Declaração de comparecimento',
  audiencia_externa: 'Audiência / diligência externa',
  folga_compensacao: 'Folga / banco de horas',
  ferias: 'Férias',
  licenca: 'Licença',
  outro: 'Outro',
};

/** Justifica dias sem ponto. Se `remunerado`, o dia é pago; se não, é descontado como falta. */
export interface Ocorrencia {
  id: string;
  funcionario_id: string;
  data_inicio: string;
  data_fim: string;
  tipo: TipoOcorrencia;
  remunerado: boolean;
  observacao: string | null;
  created_at: string;
}

export type TipoFeriado = 'nacional' | 'estadual' | 'municipal' | 'facultativo' | 'recesso';
export const FERIADO_LABEL: Record<TipoFeriado, string> = {
  nacional: 'Nacional',
  estadual: 'Estadual (MA)',
  municipal: 'Municipal (Codó)',
  facultativo: 'Ponto facultativo',
  recesso: 'Recesso / fechamento',
};
export interface Feriado {
  id: string;
  data: string;
  nome: string;
  tipo: TipoFeriado;
}

/** Ajuste manual da situação de um dia na folha (substitui a apuração automática do ponto). */
export type SituacaoManual = 'presente' | 'abonado' | 'falta';
export interface AjusteDia {
  id: string;
  funcionario_id: string;
  data: string;
  situacao: SituacaoManual;
  observacao: string | null;
  created_at: string;
}

export type TipoAjuste = 'adicional' | 'hora_extra' | 'desconto' | 'adiantamento';
export const AJUSTE_LABEL: Record<TipoAjuste, string> = {
  adicional: 'Adicional / bônus',
  hora_extra: 'Hora extra',
  desconto: 'Desconto',
  adiantamento: 'Adiantamento / vale',
};
export const AJUSTE_POSITIVO: Record<TipoAjuste, boolean> = { adicional: true, hora_extra: true, desconto: false, adiantamento: false };

export interface AjusteFolha {
  id: string;
  funcionario_id: string;
  /** Data de competência (define em qual folha entra). */
  data: string;
  tipo: TipoAjuste;
  valor: number;
  quantidade_horas: number | null;
  motivo: string;
  observacao: string | null;
  created_at: string;
}

export type SituacaoDia = 'presente' | 'abonado' | 'falta' | 'feriado' | 'folga' | 'futuro' | 'hoje' | 'extra' | 'fora_contrato';
export interface DetalheDia {
  data: string;
  situacao: SituacaoDia;
  /** Observação curta exibida no espelho (ex.: tipo de abono). */
  nota?: string;
  incompleto?: boolean;
  /** Situação definida manualmente (ajuste de dia). */
  manual?: boolean;
  minutos_atraso?: number;
}

export type StatusFolha = 'aberta' | 'fechada' | 'paga';
export interface Folha {
  id: string;
  funcionario_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  salario_mensal: number;
  valor_diaria: number;
  dias_previstos: number;
  dias_trabalhados: number;
  dias_abonados: number;
  faltas: number;
  atrasos: number;
  saidas_antecipadas: number;
  minutos_atraso: number;
  dias_extras: number;
  pendencias: number;
  horas_extras: number;
  valor_bruto: number;
  desconto_faltas: number;
  desconto_atrasos: number;
  adicionais: number;
  descontos: number;
  valor_final: number;
  status: StatusFolha;
  detalhe: DetalheDia[];
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfigEscritorio {
  nome: string;
  cnpj: string;
  endereco: string;
  cidade: string;
  telefone: string;
  email: string;
  oab_sociedade: string;
}
export interface ConfigPonto {
  tolerancia_min: number;
  limite_atraso_min: number;
  geofence_ativo: boolean;
  geofence_lat: number;
  geofence_lng: number;
  geofence_raio_m: number;
  /** Endereço do ponto central da cerca (informativo). */
  geofence_endereco: string;
}
export interface ConfigFolha {
  periodicidade: 'mensal' | 'quinzenal';
  descontar_atrasos: boolean;
  hora_extra_pct: number;
}
export interface Config {
  escritorio: ConfigEscritorio;
  ponto: ConfigPonto;
  folha: ConfigFolha;
}

export type Papel = 'admin' | 'gerente';
export interface Usuario {
  id: string;
  email: string;
  nome: string;
  papel: Papel;
  /** Somente no modo local. */
  senha_hash?: string;
  ativo: boolean;
}

export interface Auditoria {
  id: string;
  usuario: string;
  acao: string;
  detalhe: string;
  created_at: string;
  /** Preenchidos pelos gatilhos do banco. */
  tabela?: string | null;
  registro_id?: string | null;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
}
