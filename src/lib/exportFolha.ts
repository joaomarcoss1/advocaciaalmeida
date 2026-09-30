import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { fmtData } from './datetime';
import {
  CINZA, CINZA_HEX, GOLD, GOLD_HEX, NAVY, NAVY_HEX, R, cabecalhoPdf, dadosPagamento, emissao, rodapePdf,
  type CabecalhoExport, type LinhaExport,
} from './exportBase';
import { minParaHoras } from './format';
import { AJUSTE_LABEL, ANALISE_LABEL, OCORRENCIA_LABEL, type StatusAnalise, type TipoOcorrencia } from './types';

// ---------------------------------------------------------------------------------------------
// Dados compartilhados pelo PDF e pelo Excel
// ---------------------------------------------------------------------------------------------
interface Totais { n: number; salarios: number; bruto: number; descFaltas: number; descAtrasos: number; outros: number; adicionais: number; liquido: number; faltas: number; minAtraso: number }
function totais(linhas: LinhaExport[]): Totais {
  const t: Totais = { n: linhas.length, salarios: 0, bruto: 0, descFaltas: 0, descAtrasos: 0, outros: 0, adicionais: 0, liquido: 0, faltas: 0, minAtraso: 0 };
  for (const { calc: c } of linhas) {
    t.salarios += c.salario_mensal; t.bruto += c.valor_bruto; t.descFaltas += c.desconto_faltas; t.descAtrasos += c.desconto_atrasos;
    t.outros += c.descontos; t.adicionais += c.adicionais; t.liquido += c.valor_final; t.faltas += c.faltas;
    t.minAtraso += c.detalhe.reduce((s, d) => s + (d.descontado_min ?? 0), 0);
  }
  return t;
}
const minDescontados = (l: LinhaExport) => l.calc.detalhe.reduce((s, d) => s + (d.descontado_min ?? 0), 0);

export interface Evento { func: string; data: string; tipo: string; detalhe: string; situacao: string; efeito: string; valor: number; provisorio: boolean }
const ROTULO_ANALISE = (a?: StatusAnalise | null) => (a ? ANALISE_LABEL[a] : '—');
/** Faltas, abonos, atrasos e ajustes do período, um por linha, com o efeito em dinheiro na folha. */
export function eventos(linhas: LinhaExport[]): Evento[] {
  const out: Evento[] = [];
  for (const l of linhas) {
    const c = l.calc, nome = l.func.nome;
    const min = minDescontados(l);
    const taxa = min > 0 ? c.desconto_atrasos / min : 0;
    for (const d of c.detalhe) {
      if (d.situacao === 'falta') {
        const prov = d.analise === 'pendente';
        out.push({
          func: nome, data: d.data, tipo: d.manual ? 'Falta (ajuste manual)' : 'Falta',
          detalhe: d.nota ?? 'Sem registro de ponto no dia', situacao: d.analise ? `Atestado ${ROTULO_ANALISE(d.analise).toLowerCase()}` : '—',
          efeito: `- ${R(c.valor_diaria)}${prov ? ' (provisório)' : ''}`, valor: -c.valor_diaria, provisorio: prov,
        });
      } else if (d.situacao === 'abonado') {
        out.push({ func: nome, data: d.data, tipo: 'Abono', detalhe: OCORRENCIA_LABEL[(d.nota ?? '') as TipoOcorrencia] ?? d.nota ?? 'Dia abonado', situacao: 'Aceito', efeito: 'Sem desconto', valor: 0, provisorio: false });
      }
      if (d.atraso_min) {
        const desc = d.descontado_min ?? 0;
        const valor = -Math.round(taxa * desc * 100) / 100;
        const prov = d.atraso_analise === 'pendente';
        out.push({
          func: nome, data: d.data, tipo: 'Atraso / saída antecipada', detalhe: minParaHoras(d.atraso_min),
          situacao: ROTULO_ANALISE(d.atraso_analise), efeito: desc > 0 ? `- ${R(-valor)} (${minParaHoras(desc)})${prov ? ' provisório' : ''}` : 'Sem desconto', valor, provisorio: prov,
        });
      }
    }
    for (const a of l.ajustes ?? []) {
      const pos = a.tipo === 'adicional' || a.tipo === 'hora_extra';
      out.push({ func: nome, data: a.data, tipo: `Ajuste · ${AJUSTE_LABEL[a.tipo]}`, detalhe: a.motivo, situacao: '—', efeito: `${pos ? '+' : '-'} ${R(Number(a.valor))}`, valor: pos ? Number(a.valor) : -Number(a.valor), provisorio: false });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------------------------
type Doc = jsPDF & { lastAutoTable?: { finalY: number } };
const finalY = (doc: Doc) => doc.lastAutoTable?.finalY ?? 0;

function cartao(doc: jsPDF, x: number, y: number, w: number, h: number, rotulo: string, valor: string, opts: { destaque?: boolean; sub?: string } = {}) {
  if (opts.destaque) { doc.setFillColor(...NAVY); doc.roundedRect(x, y, w, h, 2, 2, 'F'); doc.setFillColor(...GOLD); doc.rect(x, y + 2, 1.3, h - 4, 'F'); }
  else { doc.setFillColor(...CINZA); doc.roundedRect(x, y, w, h, 2, 2, 'F'); doc.setDrawColor(226, 230, 240); doc.roundedRect(x, y, w, h, 2, 2, 'S'); }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.6); doc.setTextColor(...(opts.destaque ? GOLD : ([110, 122, 150] as [number, number, number])));
  doc.text(rotulo.toUpperCase(), x + 5, y + 6);
  doc.setFontSize(13.5); doc.setTextColor(...(opts.destaque ? ([255, 255, 255] as [number, number, number]) : NAVY));
  doc.text(valor, x + 5, y + 13.2);
  if (opts.sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...(opts.destaque ? ([203, 213, 240] as [number, number, number]) : ([110, 122, 150] as [number, number, number]))); doc.text(opts.sub, x + 5, y + h - 3); }
}

function titulo(doc: jsPDF, texto: string, y: number) {
  doc.setFillColor(...GOLD); doc.rect(10, y - 3.6, 1.3, 5, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text(texto.toUpperCase(), 13.5, y);
}

export async function folhaPdf(linhas: LinhaExport[], cab: CabecalhoExport) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }) as Doc;
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  let y = await cabecalhoPdf(doc, 'Folha de pagamento', 'Relação para conferência e pagamento', cab);
  const t = totais(linhas);

  // Resumo em cartões
  const gap = 4, cw = (W - 20 - gap * 4) / 5, ch = 22;
  cartao(doc, 10, y, cw, ch, 'Funcionários', String(t.n), { sub: `Salários base ${R(t.salarios)}` });
  cartao(doc, 10 + (cw + gap), y, cw, ch, 'Bruto do período', R(t.bruto), { sub: 'Antes dos descontos' });
  cartao(doc, 10 + (cw + gap) * 2, y, cw, ch, 'Descontos', `- ${R(t.descFaltas + t.descAtrasos + t.outros)}`, { sub: `${t.faltas} falta(s) ${R(t.descFaltas)} · atrasos ${R(t.descAtrasos)}` });
  cartao(doc, 10 + (cw + gap) * 3, y, cw, ch, 'Adicionais', `+ ${R(t.adicionais)}`, { sub: 'Horas extras e adicionais' });
  cartao(doc, 10 + (cw + gap) * 4, y, cw, ch, 'Total líquido a pagar', R(t.liquido), { destaque: true, sub: `${t.n} pagamento(s)` });
  y += ch + 6;

  titulo(doc, 'Folha por funcionário', y); y += 3;
  const pagamento = (l: LinhaExport) => {
    const d = dadosPagamento(l.func);
    const partes = [d.pix && `PIX: ${d.pix}`, d.conta && `Conta: ${d.conta}`].filter(Boolean);
    return partes.length ? partes.join('\n') : 'Não informado';
  };
  autoTable(doc, {
    startY: y,
    head: [['Nº', 'Funcionário / Cargo', 'Salário', 'Diária', 'Dias\ntrab./prev.', 'Faltas', 'Desconto\nfaltas', 'Atrasos\n(tempo · desc.)', 'Adicionais', 'Outros\ndescontos', 'Total a\nreceber', 'PIX / Conta bancária']],
    body: linhas.map((l, i) => {
      const c = l.calc, m = minDescontados(l);
      return [
        i + 1, `${l.func.nome}\n${l.cargo}`, R(c.salario_mensal), R(c.valor_diaria), `${c.dias_trabalhados + c.dias_abonados}/${c.dias_previstos}`,
        c.faltas, c.desconto_faltas ? `- ${R(c.desconto_faltas)}` : '—',
        c.desconto_atrasos ? `${minParaHoras(m)}\n- ${R(c.desconto_atrasos)}` : c.minutos_atraso ? `${minParaHoras(c.minutos_atraso)}\nsem desc.` : '—',
        c.adicionais ? `+ ${R(c.adicionais)}` : '—', c.descontos ? `- ${R(c.descontos)}` : '—', R(c.valor_final), pagamento(l),
      ];
    }),
    foot: [['', `${t.n} funcionário(s)`, R(t.salarios), '', '', String(t.faltas), `- ${R(t.descFaltas)}`, `${minParaHoras(t.minAtraso)}\n- ${R(t.descAtrasos)}`, `+ ${R(t.adicionais)}`, `- ${R(t.outros)}`, R(t.liquido), 'TOTAL A PAGAR']],
    styles: { fontSize: 7.4, cellPadding: 1.4, textColor: [13, 26, 56], valign: 'middle', lineColor: [226, 230, 240], lineWidth: 0.1 },
    headStyles: { fillColor: NAVY, textColor: 255, halign: 'center', fontSize: 7, fontStyle: 'bold', lineWidth: 0 },
    footStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'right', fontSize: 7.6 },
    alternateRowStyles: { fillColor: [248, 249, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 }, 1: { cellWidth: 48 }, 2: { halign: 'right', cellWidth: 20 }, 3: { halign: 'right', cellWidth: 17 }, 4: { halign: 'center', cellWidth: 16 },
      5: { halign: 'center', cellWidth: 11 }, 6: { halign: 'right', cellWidth: 21 }, 7: { halign: 'right', cellWidth: 21 }, 8: { halign: 'right', cellWidth: 19 }, 9: { halign: 'right', cellWidth: 19 },
      10: { halign: 'right', fontStyle: 'bold', cellWidth: 24 }, 11: { cellWidth: 'auto', fontSize: 7, halign: 'left' },
    },
    didParseCell: h => {
      if (h.section === 'body' && h.column.index === 1) h.cell.styles.fontStyle = 'bold';
      if (h.section === 'body' && [6, 7, 9].includes(h.column.index) && String(h.cell.raw).includes('-')) h.cell.styles.textColor = [176, 32, 32];
      if (h.section === 'body' && h.column.index === 10) h.cell.styles.fillColor = [235, 240, 250];
      if (h.section === 'foot' && h.column.index === 11) h.cell.styles.halign = 'right';
    },
    margin: { left: 10, right: 10, bottom: 26 },
  });

  if ((cab.situacao ?? '').startsWith('Prévia')) {
    const ny = finalY(doc) + 4;
    if (ny + 9 < H - 26) {   // cabe na página; a situação também já está no cabeçalho
      doc.setFillColor(251, 243, 221); doc.setDrawColor(240, 226, 184); doc.roundedRect(10, ny, W - 20, 8, 1.6, 1.6, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8); doc.setTextColor(154, 100, 8);
      doc.text(`${cab.situacao}. Valores provisórios até a decisão do administrador.`, 14, ny + 5.2);
    }
  }

  // Detalhamento
  const ev = eventos(linhas);
  doc.addPage();
  let y2 = 16;
  titulo(doc, 'Detalhamento: faltas, atrasos, abonos e ajustes', y2); y2 += 3;
  if (!ev.length) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 102, 133); doc.text('Nenhuma falta, atraso, abono ou ajuste no período.', 13.5, y2 + 8);
    y2 += 14;
  } else {
    autoTable(doc, {
      startY: y2,
      head: [['Funcionário', 'Data', 'Ocorrência', 'Detalhe', 'Análise', 'Efeito na folha']],
      body: ev.map(e => [e.func, fmtData(e.data), e.tipo, e.detalhe, e.situacao, e.efeito]),
      styles: { fontSize: 7.8, cellPadding: 1.8, textColor: [13, 26, 56], lineColor: [226, 230, 240], lineWidth: 0.1 },
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 7.2 },
      alternateRowStyles: { fillColor: [248, 249, 252] },
      columnStyles: { 0: { cellWidth: 52, fontStyle: 'bold' }, 1: { cellWidth: 20 }, 2: { cellWidth: 44 }, 4: { cellWidth: 34 }, 5: { cellWidth: 44, halign: 'right' } },
      didParseCell: h => {
        if (h.section !== 'body') return;
        const e = ev[h.row.index];
        if (h.column.index === 5) h.cell.styles.textColor = e.valor < 0 ? [176, 32, 32] : e.valor > 0 ? [27, 122, 75] : [110, 122, 150];
        if (h.column.index === 4 && e.provisorio) h.cell.styles.textColor = [154, 100, 8];
      },
      margin: { left: 10, right: 10, bottom: 26 },
    });
    y2 = finalY(doc) + 4;
  }
  const nota = doc.splitTextToSize('Regra de cálculo: diária = salário ÷ dias de trabalho previstos no mês (escala e feriados). Cada falta desconta uma diária; atestado aceito paga o dia. Atraso ou saída antecipada recusado desconta apenas o tempo correspondente (valor da hora da jornada), nunca a diária inteira. Encargos legais (INSS, IRRF, FGTS, férias e 13º) não estão incluídos.', W - 20);
  // nota + assinaturas juntas: se não couberem no fim da tabela, vão inteiras para a página seguinte
  if (y2 + 6 + nota.length * 3.2 + 26 > H - 26) { doc.addPage(); y2 = 22; }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 122, 150);
  doc.text(nota, 10, y2 + 3);
  y2 += 3 + nota.length * 3.2 + 16;

  // Assinaturas
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.3);
  doc.line(25, y2, 105, y2); doc.line(W - 105, y2, W - 25, y2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(60, 70, 100);
  doc.text('Gerência', 65, y2 + 5, { align: 'center' });
  doc.text('Administração / Sócio responsável', W - 65, y2 + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140, 150, 170);
  doc.text(`Emitido em ${emissao()}`, W / 2, y2 + 5, { align: 'center' });

  rodapePdf(doc, 'Documento gerencial de conferência · encargos legais (INSS, IRRF, FGTS) não incluídos', cab.selo);
  doc.save(`Folha-${cab.periodo.replace(/[^\w]+/g, '_')}.pdf`);
}

// ---------------------------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------------------------
const FMT_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
type Est = Record<string, unknown>;
const borda = (cor = 'D9DEE9') => ({ top: { style: 'thin', color: { rgb: cor } }, bottom: { style: 'thin', color: { rgb: cor } }, left: { style: 'thin', color: { rgb: cor } }, right: { style: 'thin', color: { rgb: cor } } });
const E = {
  titulo: { font: { bold: true, sz: 18, color: { rgb: 'FFFFFF' }, name: 'Calibri' }, fill: { fgColor: { rgb: NAVY_HEX } }, alignment: { vertical: 'center', horizontal: 'left', indent: 1 } } as Est,
  sub: { font: { bold: true, sz: 10, color: { rgb: NAVY_HEX } }, fill: { fgColor: { rgb: GOLD_HEX } }, alignment: { vertical: 'center', horizontal: 'left', indent: 1 } } as Est,
  faixa: { fill: { fgColor: { rgb: NAVY_HEX } } } as Est,
  faixaOuro: { fill: { fgColor: { rgb: GOLD_HEX } } } as Est,
  cab: { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, fill: { fgColor: { rgb: NAVY_HEX } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: { ...borda('001746'), bottom: { style: 'medium', color: { rgb: GOLD_HEX } } } } as Est,
  rot: { font: { bold: true, sz: 9, color: { rgb: '6E7A96' } }, fill: { fgColor: { rgb: CINZA_HEX } }, alignment: { vertical: 'center', indent: 1 }, border: borda() } as Est,
  val: { font: { bold: true, sz: 12, color: { rgb: NAVY_HEX } }, fill: { fgColor: { rgb: CINZA_HEX } }, alignment: { horizontal: 'right', vertical: 'center', indent: 1 }, border: borda() } as Est,
  destaqueRot: { font: { bold: true, sz: 9, color: { rgb: GOLD_HEX } }, fill: { fgColor: { rgb: NAVY_HEX } }, alignment: { vertical: 'center', indent: 1 } } as Est,
  destaqueVal: { font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: NAVY_HEX } }, alignment: { horizontal: 'right', vertical: 'center', indent: 1 } } as Est,
  aviso: { font: { bold: true, sz: 10, color: { rgb: '9A6408' } }, fill: { fgColor: { rgb: 'FBF3DD' } }, alignment: { vertical: 'center', indent: 1, wrapText: true } } as Est,
  total: { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: NAVY_HEX } }, alignment: { horizontal: 'right', vertical: 'center' } } as Est,
  nota: { font: { italic: true, sz: 9, color: { rgb: '6E7A96' } }, alignment: { wrapText: true, vertical: 'top' } } as Est,
};
const zebra = (i: number): Est => (i % 2 ? { fill: { fgColor: { rgb: 'F8F9FC' } } } : {});

type Col = { t: string; w: number; tipo: 'txt' | 'moeda' | 'int' | 'centro'; get(l: LinhaExport, i: number): string | number };
function tabela(ws: XLSX.WorkSheet, r0: number, cols: Col[], linhas: LinhaExport[], somar: number[]): number {
  const put = (r: number, c: number, v: string | number, s: Est, z?: string, f?: string) => {
    ws[XLSX.utils.encode_cell({ r, c })] = { v, t: typeof v === 'number' ? 'n' : 's', s, ...(z ? { z } : {}), ...(f ? { f } : {}) } as XLSX.CellObject;
  };
  cols.forEach((c, k) => put(r0, k, c.t, E.cab));
  const rows = (ws['!rows'] ??= []); rows[r0] = { hpt: 34 };
  linhas.forEach((l, i) => cols.forEach((c, k) => {
    const v = c.get(l, i);
    const base: Est = { ...zebra(i), border: borda(), alignment: { vertical: 'center', wrapText: c.tipo === 'txt', horizontal: c.tipo === 'txt' ? 'left' : c.tipo === 'centro' ? 'center' : 'right' } };
    if (c.tipo === 'moeda') put(r0 + 1 + i, k, Number(v), base, FMT_MOEDA);
    else if (c.tipo === 'int') put(r0 + 1 + i, k, Number(v), base, '0');
    else put(r0 + 1 + i, k, v as string, base);
  }));
  const rt = r0 + 1 + linhas.length;
  cols.forEach((c, k) => {
    if (k === 0) put(rt, k, 'TOTAL', { ...E.total, alignment: { horizontal: 'left', indent: 1 } });
    else if (somar.includes(k)) {
      const col = XLSX.utils.encode_col(k);
      const soma = linhas.reduce((s, l, i) => s + Number(c.get(l, i)), 0);
      put(rt, k, Math.round(soma * 100) / 100, E.total, c.tipo === 'moeda' ? FMT_MOEDA : '0', `SUM(${col}${r0 + 2}:${col}${rt})`);
    } else put(rt, k, '', E.total);
  });
  return rt;
}
function abaBase(ws: XLSX.WorkSheet, titulo: string, sub: string, largura: number, cols: Col[] | number[]) {
  const put = (r: number, c: number, v: string, s: Est) => { ws[XLSX.utils.encode_cell({ r, c })] = { v, t: 's', s } as XLSX.CellObject; };
  put(0, 0, titulo, E.titulo); put(1, 0, sub, E.sub);
  for (let c = 1; c < largura; c++) { put(0, c, '', E.faixa); put(1, c, '', E.faixaOuro); }
  ws['!merges'] = [...(ws['!merges'] ?? []), { s: { r: 0, c: 0 }, e: { r: 0, c: largura - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: largura - 1 } }];
  ws['!cols'] = (cols as (Col | number)[]).map(c => ({ wch: typeof c === 'number' ? c : c.w }));
  ws['!rows'] = [{ hpt: 32 }, { hpt: 20 }, { hpt: 8 }];
}

export function folhaXlsx(linhas: LinhaExport[], cab: CabecalhoExport) {
  const wb = XLSX.utils.book_new();
  const t = totais(linhas);
  const nomeEsc = cab.escritorio.nome.toUpperCase();
  const sub = `Folha de pagamento · ${cab.periodo} · ${cab.situacao ?? 'Definitiva'} · emitida em ${emissao()}`;

  // ---- Resumo
  const wsR: XLSX.WorkSheet = {};
  const colsR: Col[] = [
    { t: 'Funcionário', w: 34, tipo: 'txt', get: l => l.func.nome },
    { t: 'Cargo', w: 28, tipo: 'txt', get: l => l.cargo },
    { t: 'Faltas', w: 9, tipo: 'int', get: l => l.calc.faltas },
    { t: 'Desconto de faltas', w: 18, tipo: 'moeda', get: l => l.calc.desconto_faltas },
    { t: 'Atrasos (min. descontados)', w: 16, tipo: 'int', get: l => minDescontados(l) },
    { t: 'Desconto de atrasos', w: 18, tipo: 'moeda', get: l => l.calc.desconto_atrasos },
    { t: 'Adicionais', w: 15, tipo: 'moeda', get: l => l.calc.adicionais },
    { t: 'Outros descontos', w: 16, tipo: 'moeda', get: l => l.calc.descontos },
    { t: 'TOTAL A RECEBER', w: 19, tipo: 'moeda', get: l => l.calc.valor_final },
  ];
  abaBase(wsR, nomeEsc, sub, colsR.length, colsR);
  // Painel de indicadores: bloco esquerdo (rótulo col. A, valor col. B) e bloco direito (rótulo C:E mesclado, valor F:G mesclado)
  wsR['!merges'] = [...(wsR['!merges'] ?? [])];
  const kpi = (r: number, bloco: 'esq' | 'dir', rot: string, val: number | string, moeda: boolean, dest = false) => {
    const [cr, nr, cv, nv] = bloco === 'esq' ? [0, 1, 1, 1] : [2, 3, 5, 2];
    const put = (c: number, v: string | number, est: Est, z?: string) => { wsR[XLSX.utils.encode_cell({ r, c })] = { v, t: typeof v === 'number' ? 'n' : 's', s: est, ...(z ? { z } : {}) } as XLSX.CellObject; };
    for (let k = 0; k < nr; k++) put(cr + k, k === 0 ? rot : '', dest ? E.destaqueRot : E.rot);
    for (let k = 0; k < nv; k++) put(cv + k, k === 0 ? val : '', dest ? E.destaqueVal : E.val, moeda ? FMT_MOEDA : undefined);
    if (nr > 1) wsR['!merges']!.push({ s: { r, c: cr }, e: { r, c: cr + nr - 1 } });
    if (nv > 1) wsR['!merges']!.push({ s: { r, c: cv }, e: { r, c: cv + nv - 1 } });
  };
  wsR['!rows'] = [...(wsR['!rows'] ?? []), ...[3, 4, 5, 6, 7].map(() => ({ hpt: 24 }))];
  kpi(3, 'esq', 'FUNCIONÁRIOS', t.n, false); kpi(3, 'dir', 'BRUTO DO PERÍODO', t.bruto, true);
  kpi(4, 'esq', 'FALTAS NO PERÍODO', t.faltas, false); kpi(4, 'dir', 'DESCONTO DE FALTAS', -t.descFaltas, true);
  kpi(5, 'esq', 'TEMPO DE ATRASO DESCONTADO', minParaHoras(t.minAtraso), false); kpi(5, 'dir', 'DESCONTO DE ATRASOS', -t.descAtrasos, true);
  kpi(6, 'esq', 'ADICIONAIS', t.adicionais, true); kpi(6, 'dir', 'OUTROS DESCONTOS', -t.outros, true);
  kpi(7, 'esq', 'TOTAL LÍQUIDO A PAGAR', t.liquido, true, true);
  let proxima = 9;
  if ((cab.situacao ?? '').startsWith('Prévia')) {
    wsR[XLSX.utils.encode_cell({ r: 8, c: 0 })] = { v: `${cab.situacao}. Valores provisórios até a decisão do administrador.`, t: 's', s: E.aviso } as XLSX.CellObject;
    for (let c = 1; c < colsR.length; c++) wsR[XLSX.utils.encode_cell({ r: 8, c })] = { v: '', t: 's', s: E.aviso } as XLSX.CellObject;
    wsR['!merges']!.push({ s: { r: 8, c: 0 }, e: { r: 8, c: colsR.length - 1 } });
    proxima = 10;
  }
  const fim = tabela(wsR, proxima, colsR, linhas, [2, 3, 4, 5, 6, 7, 8]);
  wsR['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: fim + 3, c: colsR.length - 1 } });
  wsR[XLSX.utils.encode_cell({ r: fim + 2, c: 0 })] = { v: 'Encargos legais (INSS, IRRF, FGTS, férias e 13º) não estão incluídos. Atraso ou saída antecipada recusado desconta apenas o tempo correspondente; atestado recusado desconta a diária.', t: 's', s: E.nota } as XLSX.CellObject;
  wsR['!merges']!.push({ s: { r: fim + 2, c: 0 }, e: { r: fim + 3, c: colsR.length - 1 } });
  wsR['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: proxima, c: 0 }, e: { r: fim - 1, c: colsR.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, wsR, 'Resumo');

  // ---- Folha detalhada
  const wsD: XLSX.WorkSheet = {};
  const colsD: Col[] = [
    { t: 'Nº', w: 5, tipo: 'centro', get: (_l, i) => i + 1 },
    { t: 'Funcionário', w: 32, tipo: 'txt', get: l => l.func.nome },
    { t: 'Cargo', w: 26, tipo: 'txt', get: l => l.cargo },
    { t: 'Salário mensal', w: 15, tipo: 'moeda', get: l => l.calc.salario_mensal },
    { t: 'Valor da diária', w: 14, tipo: 'moeda', get: l => l.calc.valor_diaria },
    { t: 'Dias previstos', w: 10, tipo: 'int', get: l => l.calc.dias_previstos },
    { t: 'Dias trabalhados', w: 11, tipo: 'int', get: l => l.calc.dias_trabalhados },
    { t: 'Dias abonados', w: 10, tipo: 'int', get: l => l.calc.dias_abonados },
    { t: 'Faltas', w: 8, tipo: 'int', get: l => l.calc.faltas },
    { t: 'Bruto do período', w: 16, tipo: 'moeda', get: l => l.calc.valor_bruto },
    { t: 'Desconto de faltas', w: 16, tipo: 'moeda', get: l => l.calc.desconto_faltas },
    { t: 'Atrasos (min. desc.)', w: 12, tipo: 'int', get: l => minDescontados(l) },
    { t: 'Desconto de atrasos', w: 16, tipo: 'moeda', get: l => l.calc.desconto_atrasos },
    { t: 'Adicionais', w: 14, tipo: 'moeda', get: l => l.calc.adicionais },
    { t: 'Outros descontos', w: 15, tipo: 'moeda', get: l => l.calc.descontos },
    { t: 'TOTAL A RECEBER', w: 18, tipo: 'moeda', get: l => l.calc.valor_final },
  ];
  abaBase(wsD, nomeEsc, sub, colsD.length, colsD);
  const fimD = tabela(wsD, 3, colsD, linhas, [3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  wsD['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: fimD, c: colsD.length - 1 } });
  wsD['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: fimD - 1, c: colsD.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, wsD, 'Folha detalhada');

  // ---- Ocorrências
  const ev = eventos(linhas);
  const wsO: XLSX.WorkSheet = {};
  const largO = [32, 12, 26, 34, 18, 26];
  abaBase(wsO, nomeEsc, `Faltas, atrasos, abonos e ajustes · ${cab.periodo}`, largO.length, largO);
  const cabO = ['Funcionário', 'Data', 'Ocorrência', 'Detalhe', 'Análise', 'Efeito na folha'];
  cabO.forEach((h, k) => { wsO[XLSX.utils.encode_cell({ r: 3, c: k })] = { v: h, t: 's', s: E.cab } as XLSX.CellObject; });
  ev.forEach((e, i) => {
    const linha = [e.func, fmtData(e.data), e.tipo, e.detalhe, e.situacao, e.valor];
    linha.forEach((v, k) => {
      const cor = k === 5 ? (e.valor < 0 ? 'B02020' : e.valor > 0 ? '1B7A4B' : '6E7A96') : k === 4 && e.provisorio ? '9A6408' : '0D1A38';
      wsO[XLSX.utils.encode_cell({ r: 4 + i, c: k })] = {
        v: typeof v === 'number' && e.valor === 0 ? 'Sem desconto' : v, t: typeof v === 'number' && e.valor !== 0 ? 'n' : 's',
        s: { ...zebra(i), border: borda(), font: { color: { rgb: cor }, bold: k === 0 || k === 5 }, alignment: { vertical: 'center', wrapText: true, horizontal: k === 5 ? 'right' : 'left' } },
        ...(typeof v === 'number' && e.valor !== 0 ? { z: FMT_MOEDA } : {}),
      } as XLSX.CellObject;
    });
  });
  if (!ev.length) wsO[XLSX.utils.encode_cell({ r: 4, c: 0 })] = { v: 'Nenhuma falta, atraso, abono ou ajuste no período.', t: 's', s: E.nota } as XLSX.CellObject;
  wsO['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 4 + Math.max(ev.length, 1), c: largO.length - 1 } });
  if (ev.length) wsO['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + ev.length, c: largO.length - 1 } }) };
  XLSX.utils.book_append_sheet(wb, wsO, 'Ocorrências');

  // ---- Pagamento (lista para o financeiro / banco)
  const wsP: XLSX.WorkSheet = {};
  const colsP: Col[] = [
    { t: 'Nº', w: 5, tipo: 'centro', get: (_l, i) => i + 1 },
    { t: 'Funcionário', w: 32, tipo: 'txt', get: l => l.func.nome },
    { t: 'CPF', w: 16, tipo: 'txt', get: l => l.func.cpf ?? '—' },
    { t: 'Cargo', w: 26, tipo: 'txt', get: l => l.cargo },
    { t: 'TOTAL A RECEBER', w: 18, tipo: 'moeda', get: l => l.calc.valor_final },
    { t: 'Chave PIX', w: 30, tipo: 'txt', get: l => dadosPagamento(l.func).pix || '—' },
    { t: 'Banco', w: 18, tipo: 'txt', get: l => l.func.banco ?? '—' },
    { t: 'Agência', w: 10, tipo: 'centro', get: l => l.func.agencia ?? '—' },
    { t: 'Conta', w: 14, tipo: 'centro', get: l => l.func.conta ?? '—' },
    { t: 'Tipo', w: 11, tipo: 'centro', get: l => l.func.tipo_conta ?? '—' },
    { t: 'Pago em', w: 12, tipo: 'centro', get: () => '' },
    { t: 'Visto', w: 9, tipo: 'centro', get: () => '' },
  ];
  abaBase(wsP, nomeEsc, `Lista de pagamento · ${cab.periodo}`, colsP.length, colsP);
  const fimP = tabela(wsP, 3, colsP, linhas, [4]);
  wsP['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: fimP, c: colsP.length - 1 } });
  XLSX.utils.book_append_sheet(wb, wsP, 'Pagamento');

  wb.Props = { Title: `Folha de pagamento ${cab.periodo}`, Author: cab.escritorio.nome, Company: cab.escritorio.nome };
  XLSX.writeFile(wb, `Folha-${cab.periodo.replace(/[^\w]+/g, '_')}.xlsx`);
}
