import type { Config, Escala, TurnoDia } from './types';

export const CONFIG_PADRAO: Config = {
  escritorio: {
    nome: 'Almeida Advocacia & Consultoria',
    cnpj: '',
    endereco: 'Posto FC - Av. Augusto Teixeira, S/N, R. São Sebastião, 02 - Sala 02',
    cidade: 'Codó - MA',
    telefone: '',
    email: '',
    oab_sociedade: '',
  },
  ponto: {
    tolerancia_min: 5,
    limite_atraso_min: 30,
    geofence_ativo: true,
    geofence_lat: -4.460791217811178,
    geofence_lng: -43.88809954417763,
    geofence_raio_m: 900,
    geofence_endereco: 'Posto FC - Av. Augusto Teixeira, S/N, R. São Sebastião, 02 - Sala 02, Codó - MA, 65400-000',
  },
  folha: { periodicidade: 'mensal', descontar_atrasos: false, hora_extra_pct: 50 },
};

export function mesclarConfig(c: Partial<Config> | null | undefined): Config {
  return {
    escritorio: { ...CONFIG_PADRAO.escritorio, ...c?.escritorio },
    ponto: { ...CONFIG_PADRAO.ponto, ...c?.ponto },
    folha: { ...CONFIG_PADRAO.folha, ...c?.folha },
  };
}

export const turnoVazio = (): TurnoDia => ({ ativo: false, entrada: '', saida_intervalo: '', retorno_intervalo: '', saida: '' });
const t = (entrada: string, si: string, ri: string, saida: string): TurnoDia => ({ ativo: true, entrada, saida_intervalo: si, retorno_intervalo: ri, saida });

export function escalaVazia(): Omit<Escala, 'id'> {
  return { nome: '', ativo: true, dias: { 1: turnoVazio(), 2: turnoVazio(), 3: turnoVazio(), 4: turnoVazio(), 5: turnoVazio(), 6: turnoVazio() } };
}

/** Modelos usados no cadastro inicial e como atalho ao criar escalas. */
export const ESCALAS_MODELO: Omit<Escala, 'id'>[] = [
  {
    nome: 'Comercial · Seg–Sex 08h–18h, Sáb 08h–12h', ativo: true,
    dias: { 1: t('08:00', '12:00', '14:00', '18:00'), 2: t('08:00', '12:00', '14:00', '18:00'), 3: t('08:00', '12:00', '14:00', '18:00'),
      4: t('08:00', '12:00', '14:00', '18:00'), 5: t('08:00', '12:00', '14:00', '18:00'), 6: t('08:00', '', '', '12:00') },
  },
  {
    nome: 'Estágio · Seg–Sex 08h–14h', ativo: true,
    dias: { 1: t('08:00', '', '', '14:00'), 2: t('08:00', '', '', '14:00'), 3: t('08:00', '', '', '14:00'), 4: t('08:00', '', '', '14:00'), 5: t('08:00', '', '', '14:00'), 6: turnoVazio() },
  },
  {
    nome: 'Apoio · Seg–Sáb 07h–13h', ativo: true,
    dias: { 1: t('07:00', '', '', '13:00'), 2: t('07:00', '', '', '13:00'), 3: t('07:00', '', '', '13:00'), 4: t('07:00', '', '', '13:00'), 5: t('07:00', '', '', '13:00'), 6: t('07:00', '', '', '13:00') },
  },
];

export const CARGOS_PADRAO = [
  { nome: 'Sócio(a) Administrador(a)', categoria: 'gerencia', descricao: 'Direção do escritório' },
  { nome: 'Gerente Administrativo(a)', categoria: 'gerencia', descricao: 'Gestão de equipe, escalas, aprovação de ponto e rotinas internas' },
  { nome: 'Gerente Jurídico(a)', categoria: 'gerencia', descricao: 'Coordenação técnica da equipe de advogados' },
  { nome: 'Advogado(a) Associado(a)', categoria: 'juridico', descricao: 'Atuação contenciosa e consultiva' },
  { nome: 'Estagiário(a) de Direito', categoria: 'estagio', descricao: 'Apoio jurídico, protocolo e acompanhamento processual' },
  { nome: 'Assistente Jurídico(a)', categoria: 'juridico', descricao: 'Elaboração de peças, cálculos e organização de processos' },
  { nome: 'Secretário(a) / Recepcionista', categoria: 'administrativo', descricao: 'Atendimento a clientes, agenda e recepção' },
  { nome: 'Auxiliar Administrativo(a)', categoria: 'administrativo', descricao: 'Rotinas financeiras, arquivo e documentos' },
  { nome: 'Serviços Gerais', categoria: 'apoio', descricao: 'Limpeza, copa e apoio operacional' },
] as const;
