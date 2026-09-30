import { addDays, eachDay, diaSemana, hhmmParaMin, primeiroDoMes, ultimoDoMes } from './datetime';
import { minutosJornada, turnoDaData } from './ponto';
import type {
  AjusteFolha, Config, DetalheDia, Escala, Feriado, Folha, Funcionario, Ocorrencia, RegistroPonto, SituacaoDia,
} from './types';

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PeriodoFolha { inicio: string; fim: string; rotulo: string }

/** Períodos disponíveis para o mês de `ref` conforme a periodicidade configurada. */
export function periodosDoMes(ref: string, periodicidade: 'mensal' | 'quinzenal'): PeriodoFolha[] {
  const ini = primeiroDoMes(ref), fim = ultimoDoMes(ref);
  if (periodicidade === 'mensal') return [{ inicio: ini, fim, rotulo: 'Mês completo' }];
  return [
    { inicio: ini, fim: ini.slice(0, 8) + '15', rotulo: '1ª quinzena' },
    { inicio: ini.slice(0, 8) + '16', fim, rotulo: '2ª quinzena' },
  ];
}

/** Quantos dias de trabalho a escala prevê no mês (sem feriados). É o divisor da diária. */
export function diasPrevistosNoMes(escala: Escala | null, feriados: Set<string>, mesRef: string): number {
  if (!escala) return 0;
  return eachDay(primeiroDoMes(mesRef), ultimoDoMes(mesRef)).filter(d => !feriados.has(d) && turnoDaData(escala, d)).length;
}

export function valorDiaria(salario: number, diasPrevistosMes: number): number {
  return diasPrevistosMes > 0 ? r2(salario / diasPrevistosMes) : 0;
}

/** Valor da hora derivado da diária e da jornada; `pct` é o adicional (ex.: 50 = +50%). */
export function valorHoraExtra(diaria: number, minutosJornadaDia: number, pct: number): number {
  if (minutosJornadaDia <= 0) return 0;
  return r2((diaria / (minutosJornadaDia / 60)) * (1 + pct / 100));
}

export interface FolhaInput {
  func: Funcionario;
  escala: Escala | null;
  registros: RegistroPonto[];
  ocorrencias: Ocorrencia[];
  feriados: Feriado[];
  ajustes: AjusteFolha[];
  config: Config;
  inicio: string;
  fim: string;
  /** Data e minutos do dia "agora" no fuso do escritório. */
  hoje: string;
  agoraMin: number;
}
export type FolhaCalculada = Omit<Folha, 'id' | 'status' | 'observacoes' | 'created_at' | 'updated_at'>;

/**
 * Regra de cálculo:
 *  - diária = salário mensal ÷ dias de trabalho previstos na escala no mês (seg–sáb, sem feriados);
 *  - valor bruto do período = diária × dias previstos no período (a partir da admissão);
 *  - cada falta desconta 1 diária; dias abonados (atestado, audiência externa, férias…) são pagos;
 *  - dias ainda no futuro entram como previstos, então a folha de um período em curso é uma prévia.
 */
export function calcularFolha(inp: FolhaInput): FolhaCalculada {
  const { func, escala, config, inicio, fim, hoje, agoraMin } = inp;
  const salario = Number(func.salario_mensal) || 0;
  const feriadoSet = new Set(inp.feriados.map(x => x.data));
  const regs = inp.registros.filter(r => r.funcionario_id === func.id && r.data >= inicio && r.data <= fim);
  const ocs = inp.ocorrencias.filter(o => o.funcionario_id === func.id);
  const aprovados = regs.filter(r => r.status_aprovacao === 'aprovado');
  const diasComPonto = new Set(aprovados.map(r => r.data));
  const diasPendentes = new Set(regs.filter(r => r.status_aprovacao === 'pendente').map(r => r.data));

  const cacheMes = new Map<string, number>();
  const previstosDoMes = (d: string) => {
    const k = d.slice(0, 7);
    if (!cacheMes.has(k)) cacheMes.set(k, diasPrevistosNoMes(escala, feriadoSet, d));
    return cacheMes.get(k)!;
  };

  const detalhe: DetalheDia[] = [];
  const prevPorMes = new Map<string, number>();
  const faltasPorMes = new Map<string, number>();
  let presentes = 0, abonados = 0, faltas = 0, previstos = 0, extras = 0, pendencias = 0;

  for (const d of eachDay(inicio, fim)) {
    const turno = turnoDaData(escala, d);
    const contratoAtivo = d >= func.data_admissao && (!func.data_desligamento || d <= func.data_desligamento);
    const feriado = inp.feriados.find(x => x.data === d);
    const temPonto = diasComPonto.has(d);
    const mes = d.slice(0, 7);
    let situacao: SituacaoDia;
    let nota: string | undefined;

    if (!contratoAtivo) situacao = 'fora_contrato';
    else if (!turno) {
      situacao = temPonto ? 'extra' : 'folga';
      if (temPonto) extras++;
    } else if (feriado) {
      situacao = temPonto ? 'extra' : 'feriado';
      nota = feriado.nome;
      if (temPonto) extras++;
    } else {
      previstos++;
      prevPorMes.set(mes, (prevPorMes.get(mes) ?? 0) + 1);
      const oc = ocs.find(o => d >= o.data_inicio && d <= o.data_fim);
      if (temPonto) { situacao = 'presente'; presentes++; }
      else if (oc && oc.remunerado) { situacao = 'abonado'; nota = oc.tipo; abonados++; }
      else if (d > hoje) situacao = 'futuro';
      else if (d === hoje && agoraMin <= hhmmParaMin(turno.saida)) situacao = 'hoje';
      else {
        situacao = 'falta';
        nota = oc ? `${oc.tipo} (não remunerado)` : undefined;
        faltas++;
        faltasPorMes.set(mes, (faltasPorMes.get(mes) ?? 0) + 1);
        if (diasPendentes.has(d)) pendencias++;
      }
    }

    let incompleto = false;
    if (situacao === 'presente' && d < hoje) {
      const tipos = new Set(aprovados.filter(r => r.data === d).map(r => r.tipo));
      incompleto = !tipos.has('entrada') || !tipos.has('saida');
    }
    detalhe.push({ data: d, situacao, ...(nota ? { nota } : {}), ...(incompleto ? { incompleto } : {}) });
  }

  // Valores: por mês, para que salário ÷ dias previstos feche exatamente o salário no mês cheio.
  let bruto = 0, descFaltas = 0;
  for (const [mes, n] of prevPorMes) {
    const ref = `${mes}-01`;
    const total = previstosDoMes(ref);
    if (total <= 0) continue;
    bruto += r2((salario * n) / total);
    descFaltas += r2((salario * (faltasPorMes.get(mes) ?? 0)) / total);
  }
  bruto = r2(bruto); descFaltas = r2(descFaltas);

  // Atrasos e saídas antecipadas (somente marcações aprovadas)
  let atrasos = 0, saidas = 0, minutosAtraso = 0, descAtrasos = 0;
  for (const r of aprovados) {
    if (r.status !== 'atraso' && r.status !== 'saida_antecipada') continue;
    const min = Math.abs(r.diferenca_minutos ?? 0);
    if (r.status === 'atraso') atrasos++; else saidas++;
    minutosAtraso += min;
    if (config.folha.descontar_atrasos) {
      const jornada = minutosJornada(turnoDaData(escala, r.data));
      const total = previstosDoMes(`${r.data.slice(0, 7)}-01`);
      if (jornada > 0 && total > 0) descAtrasos += (salario / total / jornada) * min;
    }
  }
  descAtrasos = r2(descAtrasos);

  const aj = inp.ajustes.filter(a => a.funcionario_id === func.id && a.data >= inicio && a.data <= fim);
  const adicionais = r2(aj.filter(a => a.tipo === 'adicional' || a.tipo === 'hora_extra').reduce((s, a) => s + Number(a.valor), 0));
  const descontos = r2(aj.filter(a => a.tipo === 'desconto' || a.tipo === 'adiantamento').reduce((s, a) => s + Number(a.valor), 0));
  const horasExtras = r2(aj.filter(a => a.tipo === 'hora_extra').reduce((s, a) => s + Number(a.quantidade_horas ?? 0), 0));

  const final = r2(Math.max(0, bruto - descFaltas - descAtrasos + adicionais - descontos));
  return {
    funcionario_id: func.id,
    periodo_inicio: inicio,
    periodo_fim: fim,
    salario_mensal: salario,
    valor_diaria: valorDiaria(salario, previstosDoMes(inicio)),
    dias_previstos: previstos,
    dias_trabalhados: presentes,
    dias_abonados: abonados,
    faltas,
    atrasos,
    saidas_antecipadas: saidas,
    minutos_atraso: minutosAtraso,
    dias_extras: extras,
    pendencias,
    horas_extras: horasExtras,
    valor_bruto: bruto,
    desconto_faltas: descFaltas,
    desconto_atrasos: descAtrasos,
    adicionais,
    descontos,
    valor_final: final,
    detalhe,
  };
}

/** Datas dos próximos dias úteis da escala (utilitário do painel). */
export function proximoDiaDeTrabalho(escala: Escala | null, feriados: Set<string>, apos: string): string | null {
  for (let i = 1; i <= 14; i++) {
    const d = addDays(apos, i);
    if (turnoDaData(escala, d) && !feriados.has(d) && diaSemana(d) !== 0) return d;
  }
  return null;
}
