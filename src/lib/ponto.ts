import { diaSemana, hhmmParaMin } from './datetime';
import type { ConfigPonto, Escala, RegistroPonto, StatusMarcacao, TipoMarcacao, TurnoDia } from './types';

/** Expediente previsto para a data, ou null se o dia não é de trabalho nessa escala. */
export function turnoDaData(escala: Escala | null | undefined, data: string): TurnoDia | null {
  if (!escala) return null;
  const t = escala.dias[diaSemana(data)];
  return t && t.ativo && t.entrada && t.saida ? t : null;
}

export function temIntervalo(t: TurnoDia): boolean {
  return !!t.saida_intervalo && !!t.retorno_intervalo;
}

/** Marcações esperadas no dia, em ordem. */
export function sequenciaDoDia(t: TurnoDia | null): TipoMarcacao[] {
  if (!t) return ['entrada', 'saida'];
  return temIntervalo(t) ? ['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida'] : ['entrada', 'saida'];
}

export function previstoDoTipo(t: TurnoDia | null, tipo: TipoMarcacao): string | null {
  if (!t) return null;
  const v = { entrada: t.entrada, saida_intervalo: t.saida_intervalo, retorno_intervalo: t.retorno_intervalo, saida: t.saida }[tipo];
  return v || null;
}

/** Minutos efetivamente trabalhados num dia da escala (descontado o intervalo). */
export function minutosJornada(t: TurnoDia | null): number {
  if (!t || !t.ativo || !t.entrada || !t.saida) return 0;
  let m = hhmmParaMin(t.saida) - hhmmParaMin(t.entrada);
  if (temIntervalo(t)) m -= hhmmParaMin(t.retorno_intervalo) - hhmmParaMin(t.saida_intervalo);
  return Math.max(m, 0);
}

export function horasSemanais(escala: Escala): number {
  return Object.values(escala.dias).reduce((s, t) => s + (t.ativo ? minutosJornada(t) : 0), 0) / 60;
}

export function classificar(
  tipo: TipoMarcacao, previsto: string | null, realMin: number, cfg: Pick<ConfigPonto, 'tolerancia_min' | 'limite_atraso_min'>,
): { diferenca: number; status: StatusMarcacao } {
  if (!previsto) return { diferenca: 0, status: 'extra' };
  const diferenca = realMin - hhmmParaMin(previsto);
  const abs = Math.abs(diferenca);
  const entrando = tipo === 'entrada' || tipo === 'retorno_intervalo';
  let status: StatusMarcacao;
  if (abs <= cfg.tolerancia_min) status = 'no_horario';
  else if (entrando && diferenca >= cfg.limite_atraso_min) status = 'atraso';
  else if (!entrando && diferenca <= -cfg.limite_atraso_min) status = 'saida_antecipada';
  else if (!entrando && diferenca > 0) status = 'extra';
  else status = 'tolerancia';
  return { diferenca, status };
}

export const exigeJustificativa = (s: StatusMarcacao) => s === 'atraso' || s === 'saida_antecipada';

/** Primeira marcação da sequência do dia que ainda não foi feita (ignora rejeitadas). */
export function proximoTipo(feitas: Pick<RegistroPonto, 'tipo' | 'status_aprovacao'>[], turno: TurnoDia | null): TipoMarcacao | null {
  const ok = new Set(feitas.filter(r => r.status_aprovacao !== 'rejeitado').map(r => r.tipo));
  return sequenciaDoDia(turno).find(t => !ok.has(t)) ?? null;
}

export function distanciaMetros(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
