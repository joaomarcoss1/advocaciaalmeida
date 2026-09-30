import { describe, expect, it } from 'vitest';
import { calcularFolha, diasPrevistosNoMes, periodosDoMes, valorDiaria, valorHoraExtra, type FolhaInput } from './folha';
import { classificar, minutosJornada, proximoTipo, sequenciaDoDia } from './ponto';
import { pascoa, feriadosPadrao } from './feriados';
import type { AjusteDia, AjusteFolha, Config, Escala, Feriado, Funcionario, Ocorrencia, RegistroPonto, TurnoDia } from './types';

const turno = (e: string, si: string, ri: string, s: string): TurnoDia => ({ ativo: true, entrada: e, saida_intervalo: si, retorno_intervalo: ri, saida: s });
const off: TurnoDia = { ativo: false, entrada: '', saida_intervalo: '', retorno_intervalo: '', saida: '' };
// Segunda a sexta 08–12/14–18, sábado 08–12 contínuo
const escala: Escala = {
  id: 'e1', nome: 'Comercial', ativo: true,
  dias: { 1: turno('08:00', '12:00', '14:00', '18:00'), 2: turno('08:00', '12:00', '14:00', '18:00'), 3: turno('08:00', '12:00', '14:00', '18:00'),
    4: turno('08:00', '12:00', '14:00', '18:00'), 5: turno('08:00', '12:00', '14:00', '18:00'), 6: turno('08:00', '', '', '12:00') },
};
const config: Config = {
  escritorio: { nome: '', cnpj: '', endereco: '', cidade: '', telefone: '', email: '', oab_sociedade: '' },
  ponto: { tolerancia_min: 5, limite_atraso_min: 30, geofence_ativo: false, geofence_lat: 0, geofence_lng: 0, geofence_raio_m: 300, geofence_endereco: '' },
  folha: { periodicidade: 'mensal', descontar_atrasos: false, hora_extra_pct: 50 },
};
const func = (over: Partial<Funcionario> = {}): Funcionario => ({
  id: 'f1', nome: 'Teste', cpf: null, email: null, telefone: null, cargo_id: null, escala_id: 'e1', vinculo: 'clt',
  salario_mensal: 2600, data_admissao: '2020-01-01', data_desligamento: null, oab: null, pix: null, banco: null, agencia: null, conta: null,
  tipo_conta: null, tem_pin: true, ativo: true, observacoes: null, created_at: '', ...over,
});
const reg = (data: string, tipo: RegistroPonto['tipo'] = 'entrada', over: Partial<RegistroPonto> = {}): RegistroPonto => ({
  id: `${data}-${tipo}`, funcionario_id: 'f1', data, tipo, horario_previsto: null, horario_real: '', diferenca_minutos: 0,
  status: 'no_horario', justificativa: null, latitude: null, longitude: null, status_aprovacao: 'aprovado', retroativo: false,
  motivo_rejeicao: null, aprovado_por: null, aprovado_em: null, created_at: '', ...over,
});
const base = (over: Partial<FolhaInput> = {}): FolhaInput => ({
  func: func(), escala, registros: [], ocorrencias: [], feriados: [], ajustes: [], config,
  inicio: '2026-06-01', fim: '2026-06-30', hoje: '2026-07-15', agoraMin: 600, ...over,
});
/** Dias de trabalho previstos (seg–sáb) de junho/2026, sem feriados. */
const diasJunho = () => {
  const out: string[] = [];
  for (let d = 1; d <= 30; d++) { const s = `2026-06-${String(d).padStart(2, '0')}`; if (new Date(s + 'T12:00Z').getUTCDay() !== 0) out.push(s); }
  return out;
};

describe('diária e dias previstos', () => {
  it('junho/2026 tem 26 dias seg–sáb', () => {
    expect(diasJunho()).toHaveLength(26);
    expect(diasPrevistosNoMes(escala, new Set(), '2026-06-15')).toBe(26);
  });
  it('feriado reduz o divisor', () => {
    expect(diasPrevistosNoMes(escala, new Set(['2026-06-04']), '2026-06-15')).toBe(25);
  });
  it('diária = salário ÷ dias previstos', () => {
    expect(valorDiaria(2600, 26)).toBe(100);
    expect(valorDiaria(2600, 0)).toBe(0);
  });
});

describe('folha', () => {
  it('sem faltas paga o salário cheio', () => {
    const r = calcularFolha(base({ registros: diasJunho().map(d => reg(d)) }));
    expect(r.dias_previstos).toBe(26);
    expect(r.dias_trabalhados).toBe(26);
    expect(r.faltas).toBe(0);
    expect(r.valor_diaria).toBe(100);
    expect(r.valor_bruto).toBe(2600);
    expect(r.valor_final).toBe(2600);
  });

  it('cada falta desconta uma diária', () => {
    const dias = diasJunho();
    const r = calcularFolha(base({ registros: dias.slice(2).map(d => reg(d)) })); // faltou nos 2 primeiros dias
    expect(r.faltas).toBe(2);
    expect(r.desconto_faltas).toBe(200);
    expect(r.valor_final).toBe(2400);
  });

  it('nenhum ponto no mês inteiro: falta em todos os dias, líquido zero', () => {
    const r = calcularFolha(base());
    expect(r.faltas).toBe(26);
    expect(r.valor_final).toBe(0);
  });

  it('atestado (abono remunerado) não desconta; não remunerado desconta', () => {
    const dias = diasJunho();
    const oc = (id: string, ini: string, fim: string, remunerado: boolean): Ocorrencia => ({
      id, funcionario_id: 'f1', data_inicio: ini, data_fim: fim, tipo: 'atestado', remunerado, observacao: null, created_at: '',
    });
    const regs = dias.slice(3).map(d => reg(d));
    const a = calcularFolha(base({ registros: regs, ocorrencias: [oc('o', dias[0], dias[2], true)] }));
    expect(a.faltas).toBe(0);
    expect(a.dias_abonados).toBe(3);
    expect(a.valor_final).toBe(2600);
    const b = calcularFolha(base({ registros: regs, ocorrencias: [oc('o', dias[0], dias[2], false)] }));
    expect(b.faltas).toBe(3);
    expect(b.valor_final).toBe(2300);
  });

  it('feriado não conta como falta e a diária sobe', () => {
    const feriados: Feriado[] = [{ id: 'h', data: '2026-06-04', nome: 'Corpus Christi', tipo: 'facultativo' }];
    const dias = diasJunho().filter(d => d !== '2026-06-04');
    const r = calcularFolha(base({ feriados, registros: dias.slice(1).map(d => reg(d)) }));
    expect(r.dias_previstos).toBe(25);
    expect(r.valor_diaria).toBe(104);
    expect(r.faltas).toBe(1);
    expect(r.valor_final).toBe(2496);
  });

  it('admissão no meio do mês paga só os dias a partir da admissão', () => {
    const dias = diasJunho().filter(d => d >= '2026-06-16');
    const r = calcularFolha(base({ func: func({ data_admissao: '2026-06-16' }), registros: dias.map(d => reg(d)) }));
    expect(r.dias_previstos).toBe(dias.length);
    expect(r.faltas).toBe(0);
    expect(r.valor_bruto).toBe(dinheiro(2600 * dias.length / 26));
  });

  it('quinzena soma o mês', () => {
    const [q1, q2] = periodosDoMes('2026-06-10', 'quinzenal');
    const regs = diasJunho().slice(1).map(d => reg(d)); // falta no dia 1
    const a = calcularFolha(base({ registros: regs, inicio: q1.inicio, fim: q1.fim }));
    const b = calcularFolha(base({ registros: regs, inicio: q2.inicio, fim: q2.fim }));
    expect(a.valor_final + b.valor_final).toBe(2500);
  });

  it('dia futuro e dia de hoje ainda em andamento não são falta', () => {
    const r = calcularFolha(base({ inicio: '2026-06-01', fim: '2026-06-30', hoje: '2026-06-10', agoraMin: 9 * 60, registros: diasJunho().filter(d => d < '2026-06-10').map(d => reg(d)) }));
    expect(r.faltas).toBe(0);
    expect(r.valor_final).toBe(2600); // prévia do mês
    expect(r.detalhe.find(x => x.data === '2026-06-10')?.situacao).toBe('hoje');
    expect(r.detalhe.find(x => x.data === '2026-06-11')?.situacao).toBe('futuro');
  });

  it('hoje após o fim do expediente sem ponto vira falta', () => {
    const r = calcularFolha(base({ hoje: '2026-06-10', agoraMin: 19 * 60, registros: diasJunho().filter(d => d < '2026-06-10').map(d => reg(d)) }));
    expect(r.faltas).toBe(1);
  });

  it('ponto pendente ou rejeitado não conta como presença', () => {
    const dias = diasJunho();
    const regs = dias.map((d, i) => reg(d, 'entrada', i === 0 ? { status_aprovacao: 'pendente' } : i === 1 ? { status_aprovacao: 'rejeitado' } : {}));
    const r = calcularFolha(base({ registros: regs }));
    expect(r.faltas).toBe(2);
    expect(r.pendencias).toBe(1);
  });

  it('ajustes entram na folha: adicional, hora extra, desconto e adiantamento', () => {
    const aj = (tipo: AjusteFolha['tipo'], valor: number, horas: number | null = null, data = '2026-06-10'): AjusteFolha => ({
      id: tipo + valor, funcionario_id: 'f1', data, tipo, valor, quantidade_horas: horas, motivo: 'x', observacao: null, created_at: '',
    });
    const r = calcularFolha(base({
      registros: diasJunho().map(d => reg(d)),
      ajustes: [aj('adicional', 100), aj('hora_extra', 75, 2), aj('desconto', 30), aj('adiantamento', 200), aj('adicional', 999, null, '2026-07-01')],
    }));
    expect(r.adicionais).toBe(175);
    expect(r.horas_extras).toBe(2);
    expect(r.descontos).toBe(230);
    expect(r.valor_final).toBe(2545);
  });

  it('desconto de atraso proporcional só quando habilitado', () => {
    const dias = diasJunho();
    const regs = dias.map((d, i) => reg(d, 'entrada', i === 0 ? { status: 'atraso', diferenca_minutos: 60 } : {}));
    const off_ = calcularFolha(base({ registros: regs }));
    expect(off_.atrasos).toBe(1);
    expect(off_.minutos_atraso).toBe(60);
    expect(off_.desconto_atrasos).toBe(0);
    const on = calcularFolha(base({ registros: regs, config: { ...config, folha: { ...config.folha, descontar_atrasos: true } } }));
    // diária 100, jornada seg 8h (480 min) => 60 min = 12,50
    expect(on.desconto_atrasos).toBe(12.5);
    expect(on.valor_final).toBe(2587.5);
  });

  it('sinaliza dia sem saída como incompleto', () => {
    const dias = diasJunho();
    const regs = dias.flatMap((d, i) => (i === 0 ? [reg(d, 'entrada')] : [reg(d, 'entrada'), reg(d, 'saida')]));
    const r = calcularFolha(base({ registros: regs }));
    expect(r.detalhe.filter(x => x.incompleto)).toHaveLength(1);
  });

  it('domingo trabalhado é dia extra (informativo)', () => {
    const r = calcularFolha(base({ registros: [...diasJunho().map(d => reg(d)), reg('2026-06-07')] }));
    expect(r.dias_extras).toBe(1);
    expect(r.valor_final).toBe(2600);
  });

  it('valor da hora extra deriva da diária e do adicional', () => {
    expect(valorHoraExtra(100, 480, 50)).toBe(18.75); // 12,50/h × 1,5
    expect(valorHoraExtra(100, 480, 100)).toBe(25);
  });
});

function dinheiro(n: number) { return Math.round(n * 100) / 100; }

describe('ajustes manuais e diária fixa', () => {
  const aj = (data: string, situacao: AjusteDia['situacao']): AjusteDia => ({ id: data, funcionario_id: 'f1', data, situacao, observacao: 'ajuste do escritório', created_at: '' });
  it('marcar um dia com ponto como falta desconta uma diária', () => {
    const dias = diasJunho();
    const r = calcularFolha(base({ registros: dias.map(d => reg(d)), ajustesDia: [aj(dias[4], 'falta')] }));
    expect(r.faltas).toBe(1);
    expect(r.valor_final).toBe(2500);
    expect(r.detalhe.find(x => x.data === dias[4])?.manual).toBe(true);
  });
  it('marcar uma falta como presente ou abonada devolve a diária', () => {
    const dias = diasJunho();
    const regs = dias.slice(2).map(d => reg(d)); // faltou nos 2 primeiros
    const r = calcularFolha(base({ registros: regs, ajustesDia: [aj(dias[0], 'presente'), aj(dias[1], 'abonado')] }));
    expect(r.faltas).toBe(0);
    expect(r.dias_trabalhados).toBe(25);
    expect(r.dias_abonados).toBe(1);
    expect(r.valor_final).toBe(2600);
  });
  it('ajuste de outro funcionário não interfere', () => {
    const dias = diasJunho();
    const outro = { ...aj(dias[0], 'falta'), funcionario_id: 'f2' };
    const r = calcularFolha(base({ registros: dias.map(d => reg(d)), ajustesDia: [outro] }));
    expect(r.faltas).toBe(0);
  });
  it('diária fixa substitui salário ÷ dias previstos', () => {
    const dias = diasJunho();
    const r = calcularFolha(base({ func: func({ diaria_fixa: 120 }), registros: dias.slice(1).map(d => reg(d)) }));
    expect(r.valor_diaria).toBe(120);
    expect(r.valor_bruto).toBe(3120); // 26 × 120
    expect(r.desconto_faltas).toBe(120);
    expect(r.valor_final).toBe(3000);
  });
  it('desconto de atraso usa a diária fixa', () => {
    const dias = diasJunho();
    const regs = dias.map((d, i) => reg(d, 'entrada', i === 0 ? { status: 'atraso', diferenca_minutos: 60 } : {}));
    const r = calcularFolha(base({ func: func({ diaria_fixa: 96 }), registros: regs, config: { ...config, folha: { ...config.folha, descontar_atrasos: true } } }));
    expect(r.desconto_atrasos).toBe(12); // 96 ÷ 480 min × 60
  });
});

describe('ponto', () => {
  const t = escala.dias[1];
  it('classifica pontualidade, tolerância, atraso e saída antecipada', () => {
    const c = { tolerancia_min: 5, limite_atraso_min: 30 };
    expect(classificar('entrada', '08:00', 8 * 60 + 3, c).status).toBe('no_horario');
    expect(classificar('entrada', '08:00', 8 * 60 + 15, c).status).toBe('tolerancia');
    expect(classificar('entrada', '08:00', 8 * 60 + 40, c)).toEqual({ diferenca: 40, status: 'atraso' });
    expect(classificar('saida', '18:00', 17 * 60, c).status).toBe('saida_antecipada');
    expect(classificar('saida', '18:00', 18 * 60 + 20, c).status).toBe('extra');
    expect(classificar('entrada', null, 600, c).status).toBe('extra');
  });
  it('sequência e próximo tipo', () => {
    expect(sequenciaDoDia(t)).toEqual(['entrada', 'saida_intervalo', 'retorno_intervalo', 'saida']);
    expect(sequenciaDoDia(escala.dias[6])).toEqual(['entrada', 'saida']);
    expect(proximoTipo([{ tipo: 'entrada', status_aprovacao: 'aprovado' }], t)).toBe('saida_intervalo');
    expect(proximoTipo([{ tipo: 'entrada', status_aprovacao: 'rejeitado' }], t)).toBe('entrada');
  });
  it('jornada líquida descontando intervalo', () => {
    expect(minutosJornada(t)).toBe(480);
    expect(minutosJornada(escala.dias[6])).toBe(240);
    expect(minutosJornada(off)).toBe(0);
  });
});

describe('feriados', () => {
  it('calcula a Páscoa', () => {
    expect(pascoa(2026)).toBe('2026-04-05');
    expect(pascoa(2027)).toBe('2027-03-28');
  });
  it('gera móveis a partir da Páscoa', () => {
    const f = feriadosPadrao(2026);
    expect(f.find(x => x.nome === 'Sexta-feira Santa')?.data).toBe('2026-04-03');
    expect(f.find(x => x.nome === 'Corpus Christi')?.data).toBe('2026-06-04');
    expect(f.some(x => x.data === '2026-07-28' && x.tipo === 'estadual')).toBe(true);
  });
});
