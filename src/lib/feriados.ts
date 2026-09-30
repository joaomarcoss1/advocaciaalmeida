import { addDays } from './datetime';
import type { Feriado, TipoFeriado } from './types';

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

type Sugestao = Omit<Feriado, 'id'>;
const f = (data: string, nome: string, tipo: TipoFeriado): Sugestao => ({ data, nome, tipo });

/** Feriados nacionais fixos e móveis + data estadual do Maranhão. */
export function feriadosPadrao(ano: number): Sugestao[] {
  const p = pascoa(ano);
  return [
    f(`${ano}-01-01`, 'Confraternização Universal', 'nacional'),
    f(addDays(p, -48), 'Carnaval (segunda-feira)', 'facultativo'),
    f(addDays(p, -47), 'Carnaval (terça-feira)', 'facultativo'),
    f(addDays(p, -2), 'Sexta-feira Santa', 'nacional'),
    f(`${ano}-04-21`, 'Tiradentes', 'nacional'),
    f(`${ano}-05-01`, 'Dia do Trabalho', 'nacional'),
    f(addDays(p, 60), 'Corpus Christi', 'facultativo'),
    f(`${ano}-07-28`, 'Adesão do Maranhão à Independência', 'estadual'),
    f(`${ano}-09-07`, 'Independência do Brasil', 'nacional'),
    f(`${ano}-10-12`, 'Nossa Senhora Aparecida', 'nacional'),
    f(`${ano}-11-02`, 'Finados', 'nacional'),
    f(`${ano}-11-15`, 'Proclamação da República', 'nacional'),
    f(`${ano}-11-20`, 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
    f(`${ano}-12-25`, 'Natal', 'nacional'),
  ];
}

/** Datas locais que o escritório precisa confirmar em lei municipal antes de adotar. */
export function sugestoesMunicipais(ano: number): (Sugestao & { aviso: string })[] {
  return [{
    ...f(`${ano}-04-16`, 'Aniversário de Codó', 'municipal'),
    aviso: 'Codó foi fundada em 16/04/1896. Confirme na legislação municipal se a data é feriado antes de lançar.',
  }];
}
