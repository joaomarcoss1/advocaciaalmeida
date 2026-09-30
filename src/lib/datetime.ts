/** Todas as datas de negócio são strings 'YYYY-MM-DD'; horas são 'HH:MM'. O fuso do escritório é o de Codó/MA (UTC-3, sem horário de verão). */
const pad = (n: number) => String(n).padStart(2, '0');

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
export function toISO(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}
export function diaSemana(s: string): number {
  return parseISO(s).getUTCDay();
}
export function eachDay(ini: string, fim: string): string[] {
  const out: string[] = [];
  for (let d = ini; d <= fim; d = addDays(d, 1)) out.push(d);
  return out;
}
export function ultimoDiaDoMes(ano: number, mes1a12: number): number {
  return new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
}
export function mesRange(ano: number, mes1a12: number): { inicio: string; fim: string } {
  return { inicio: `${ano}-${pad(mes1a12)}-01`, fim: `${ano}-${pad(mes1a12)}-${pad(ultimoDiaDoMes(ano, mes1a12))}` };
}
export function primeiroDoMes(s: string): string { return s.slice(0, 8) + '01'; }
export function ultimoDoMes(s: string): string {
  const [y, m] = s.split('-').map(Number);
  return mesRange(y, m).fim;
}

export function hhmmParaMin(h: string): number {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
}
export function minParaHhmm(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export interface AgoraBR { data: string; hhmm: string; minutos: number; iso: string }
export function isoParaBR(iso: string): AgoraBR {
  const t = new Date(new Date(iso).getTime() - 3 * 3600_000);
  const s = t.toISOString();
  const hhmm = s.slice(11, 16);
  return { data: s.slice(0, 10), hhmm, minutos: hhmmParaMin(hhmm), iso };
}
export function agoraBR(): AgoraBR {
  return isoParaBR(new Date().toISOString());
}
/** Converte data + hora locais (Codó) em instante ISO/UTC. */
export function brParaIso(data: string, hhmm: string): string {
  return new Date(`${data}T${hhmm}:00-03:00`).toISOString();
}

export function fmtData(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = s.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function fmtDataCurta(s: string): string {
  const [, m, d] = s.split('-');
  return `${d}/${m}`;
}
export const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function nomeMes(s: string): string {
  const [y, m] = s.split('-').map(Number);
  return `${MESES[m - 1]} de ${y}`;
}
