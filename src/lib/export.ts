import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import logoVertical from '@/assets/logo-vertical.png';
import { agoraBR, fmtData, isoParaBR } from './datetime';
import type { FolhaCalculada } from './folha';
import { minParaHoras } from './format';
import { SITUACAO_DIA } from './rotulos';
import { AJUSTE_LABEL, OCORRENCIA_LABEL, type AjusteFolha, type ConfigEscritorio, type Funcionario, type RegistroPonto, type TipoOcorrencia } from './types';

const NAVY: [number, number, number] = [0, 32, 96];
const GOLD: [number, number, number] = [209, 180, 125];
const CINZA: [number, number, number] = [244, 246, 250];
const NAVY_HEX = '002060', GOLD_HEX = 'D1B47D', CINZA_HEX = 'F4F6FA';

export interface LinhaExport { func: Funcionario; cargo: string; calc: FolhaCalculada; ajustes?: AjusteFolha[] }
export interface CabecalhoExport { escritorio: ConfigEscritorio; periodo: string }

const R = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const emissao = () => { const a = agoraBR(); return `${fmtData(a.data)} às ${a.hhmm}`; };

async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
}

/** Cabeçalho com logo à esquerda, título à direita, faixa dourada e faixa azul com o período. Devolve o Y livre. */
async function cabecalhoPdf(doc: jsPDF, titulo: string, sub: string, cab: CabecalhoExport): Promise<number> {
  const w = doc.internal.pageSize.getWidth();
  const logo = await dataUrl(logoVertical);
  const alt = 22, larg = alt * (700 / 396);
  doc.addImage(logo, 'PNG', 10, 6, larg, alt);
  doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(titulo.toUpperCase(), w - 10, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 102, 133);
  doc.text(sub, w - 10, 20, { align: 'right' });
  doc.text([cab.escritorio.nome, cab.escritorio.cidade, cab.escritorio.cnpj && `CNPJ ${cab.escritorio.cnpj}`].filter(Boolean).join(' · '), w - 10, 25, { align: 'right' });
  doc.setFillColor(...GOLD); doc.rect(0, 31, w, 1.6, 'F');
  doc.setFillColor(...NAVY); doc.rect(0, 32.6, w, 8, 'F');
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(`PERÍODO: ${cab.periodo.toUpperCase()}`, 10, 38);
  doc.setFont('helvetica', 'normal'); doc.text(`Emitido em ${emissao()}`, w - 10, 38, { align: 'right' });
  return 46;
}
function rodapePdf(doc: jsPDF, texto: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5); doc.setTextColor(120, 128, 150);
    doc.text(`${texto} · Página ${i} de ${n}`, w / 2, h - 6, { align: 'center' });
  }
}

export async function folhaPdf(linhas: LinhaExport[], cab: CabecalhoExport, variante: 'pix' | 'banco') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const y = await cabecalhoPdf(doc, 'Folha de pagamento', variante === 'banco' ? 'Relação para pagamento em conta bancária' : 'Relação para pagamento via PIX', cab);
  const dest = (l: LinhaExport) => variante === 'banco'
    ? [l.func.banco, l.func.agencia && `Ag ${l.func.agencia}`, l.func.conta && `${l.func.tipo_conta ?? 'CC'} ${l.func.conta}`].filter(Boolean).join(' · ') || '—'
    : l.func.pix || '—';
  const total = linhas.reduce((s, l) => s + l.calc.valor_final, 0);
  autoTable(doc, {
    startY: y,
    head: [['Nº', 'Funcionário', 'Cargo', 'Salário', 'Diária', 'Dias', 'Faltas', 'Bruto', 'Desc. faltas', 'Adicionais', 'Descontos', 'Líquido', variante === 'banco' ? 'Conta' : 'Chave PIX']],
    body: linhas.map((l, i) => [
      i + 1, l.func.nome, l.cargo, R(l.calc.salario_mensal), R(l.calc.valor_diaria), `${l.calc.dias_trabalhados + l.calc.dias_abonados}/${l.calc.dias_previstos}`,
      l.calc.faltas, R(l.calc.valor_bruto), R(l.calc.desconto_faltas + l.calc.desconto_atrasos), R(l.calc.adicionais), R(l.calc.descontos), R(l.calc.valor_final), dest(l),
    ]),
    foot: [['', '', '', '', '', '', '', '', '', '', 'TOTAL', R(total), `${linhas.length} func.`]],
    styles: { fontSize: 7.5, cellPadding: 1.8, textColor: [13, 26, 56] },
    headStyles: { fillColor: NAVY, textColor: 255, halign: 'center' },
    footStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: CINZA },
    columnStyles: { 0: { halign: 'center', cellWidth: 8 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'right' }, 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right', fontStyle: 'bold' }, 12: { cellWidth: 44, fontSize: 7 } },
    margin: { left: 8, right: 8, bottom: 14 },
  });
  const fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  const w = doc.internal.pageSize.getWidth();
  if (fy < doc.internal.pageSize.getHeight() - 20) {
    doc.setDrawColor(...NAVY); doc.line(25, fy, 95, fy); doc.line(w - 95, fy, w - 25, fy);
    doc.setFontSize(9); doc.setTextColor(60, 70, 100);
    doc.text('Gerência', 60, fy + 5, { align: 'center' }); doc.text('Administração / Sócio responsável', w - 60, fy + 5, { align: 'center' });
  }
  rodapePdf(doc, 'Documento gerencial de conferência · encargos legais (INSS, IRRF, FGTS) não incluídos');
  doc.save(`Folha-${variante}-${cab.periodo.replace(/[^\w]+/g, '_')}.pdf`);
}

export async function holeritePdf(l: LinhaExport, cab: CabecalhoExport) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y0 = await cabecalhoPdf(doc, 'Demonstrativo de pagamento', 'Cálculo por diária e dias trabalhados', cab);
  const c = l.calc;
  autoTable(doc, {
    startY: y0 + 2, theme: 'plain', styles: { fontSize: 9.5, cellPadding: 1.4 },
    body: [
      [{ content: 'Funcionário', styles: { fontStyle: 'bold' } }, l.func.nome, { content: 'Cargo', styles: { fontStyle: 'bold' } }, l.cargo],
      [{ content: 'CPF', styles: { fontStyle: 'bold' } }, l.func.cpf || '—', { content: 'Admissão', styles: { fontStyle: 'bold' } }, fmtData(l.func.data_admissao)],
      [{ content: 'Salário mensal', styles: { fontStyle: 'bold' } }, R(c.salario_mensal), { content: 'Valor da diária', styles: { fontStyle: 'bold' } }, R(c.valor_diaria)],
    ],
  });
  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  const proventos: [string, string][] = [[`Salário do período (${c.dias_previstos} dia(s) previstos × ${R(c.valor_diaria)})`, R(c.valor_bruto)]];
  const descontos: [string, string][] = [];
  if (c.faltas) descontos.push([`Faltas: ${c.faltas} dia(s) × ${R(c.valor_diaria)}`, R(c.desconto_faltas)]);
  if (c.desconto_atrasos) descontos.push([`Atrasos e saídas antecipadas (${minParaHoras(c.minutos_atraso)})`, R(c.desconto_atrasos)]);
  for (const a of l.ajustes ?? []) {
    const pos = a.tipo === 'adicional' || a.tipo === 'hora_extra';
    const rot = `${AJUSTE_LABEL[a.tipo]}${a.tipo === 'hora_extra' && a.quantidade_horas ? ` (${a.quantidade_horas}h)` : ''}: ${a.motivo}`;
    (pos ? proventos : descontos).push([rot, R(a.valor)]);
  }
  autoTable(doc, {
    startY: y, head: [['Proventos', 'Valor']], body: proventos, theme: 'grid',
    headStyles: { fillColor: NAVY, textColor: 255 }, styles: { fontSize: 9.5 }, columnStyles: { 1: { halign: 'right', cellWidth: 36 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  autoTable(doc, {
    startY: y, head: [['Descontos', 'Valor']], body: descontos.length ? descontos : [['Nenhum desconto no período', R(0)]], theme: 'grid',
    headStyles: { fillColor: GOLD, textColor: NAVY }, styles: { fontSize: 9.5 }, columnStyles: { 1: { halign: 'right', cellWidth: 36 } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  autoTable(doc, {
    startY: y, theme: 'plain', body: [[{ content: 'LÍQUIDO A RECEBER', styles: { fontStyle: 'bold', fontSize: 12, textColor: 255 } }, { content: R(c.valor_final), styles: { fontStyle: 'bold', fontSize: 12, halign: 'right', textColor: 255 } }]],
    styles: { fillColor: NAVY, cellPadding: 3 },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY);
  doc.text('Resumo de frequência', 14, y);
  autoTable(doc, {
    startY: y + 2, theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: CINZA, textColor: NAVY },
    head: [['Dias previstos', 'Trabalhados', 'Abonados', 'Faltas', 'Atrasos', 'Saídas antecip.']],
    body: [[c.dias_previstos, c.dias_trabalhados, c.dias_abonados, c.faltas, c.atrasos, c.saidas_antecipadas]],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  const faltas = c.detalhe.filter(d => d.situacao === 'falta').map(d => fmtData(d.data).slice(0, 5));
  if (faltas.length) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 70, 100); doc.text(doc.splitTextToSize(`Dias com falta: ${faltas.join(', ')}`, 180), 14, y); y += 8; }
  const h = doc.internal.pageSize.getHeight();
  const sy = Math.max(y + 26, h - 55);
  doc.setDrawColor(...NAVY); doc.line(20, sy, 90, sy); doc.line(120, sy, 190, sy);
  doc.setFontSize(9); doc.setTextColor(60, 70, 100);
  doc.text('Funcionário(a)', 55, sy + 5, { align: 'center' }); doc.text('Responsável pelo pagamento', 155, sy + 5, { align: 'center' });
  rodapePdf(doc, 'Documento gerencial de conferência · não substitui o recibo/holerite oficial (INSS, IRRF e FGTS não incluídos)');
  doc.save(`Demonstrativo-${l.func.nome.replace(/\s+/g, '_')}-${cab.periodo.replace(/[^\w]+/g, '_')}.pdf`);
}

export function folhaXlsx(linhas: LinhaExport[], cab: CabecalhoExport, variante: 'pix' | 'banco') {
  const borda = { top: { style: 'thin', color: { rgb: 'CCD3E3' } }, bottom: { style: 'thin', color: { rgb: 'CCD3E3' } }, left: { style: 'thin', color: { rgb: 'CCD3E3' } }, right: { style: 'thin', color: { rgb: 'CCD3E3' } } };
  const head = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: NAVY_HEX } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: borda };
  const fmt = 'R$ #,##0.00';
  const cols = ['Nº', 'Funcionário', 'Cargo', 'Salário mensal', 'Diária', 'Dias previstos', 'Trabalhados', 'Abonados', 'Faltas', 'Bruto do período', 'Desc. faltas', 'Desc. atrasos', 'Adicionais', 'Descontos', 'Líquido', variante === 'banco' ? 'Banco / Ag / Conta' : 'Chave PIX'];
  const ws: XLSX.WorkSheet = {};
  const put = (r: number, c: number, v: string | number, s?: object, z?: string) => { ws[XLSX.utils.encode_cell({ r, c })] = { v, t: typeof v === 'number' ? 'n' : 's', s, ...(z ? { z } : {}) }; };
  put(0, 0, cab.escritorio.nome.toUpperCase(), { font: { bold: true, sz: 16, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: NAVY_HEX } }, alignment: { horizontal: 'center' } });
  put(1, 0, `Folha de pagamento · ${cab.periodo} · emitida em ${emissao()}`, { font: { bold: true, color: { rgb: NAVY_HEX } }, fill: { fgColor: { rgb: GOLD_HEX } }, alignment: { horizontal: 'center' } });
  cols.forEach((h, c) => { put(3, c, h, head); if (c > 0) { put(0, c, '', { fill: { fgColor: { rgb: NAVY_HEX } } }); put(1, c, '', { fill: { fgColor: { rgb: GOLD_HEX } } }); } });
  linhas.forEach((l, i) => {
    const r = 4 + i, c = l.calc;
    const s = { border: borda, fill: i % 2 ? { fgColor: { rgb: CINZA_HEX } } : undefined };
    const dest = variante === 'banco' ? [l.func.banco, l.func.agencia && `Ag ${l.func.agencia}`, l.func.conta && `Conta ${l.func.conta}`].filter(Boolean).join(' · ') : l.func.pix ?? '';
    [i + 1, l.func.nome, l.cargo, c.salario_mensal, c.valor_diaria, c.dias_previstos, c.dias_trabalhados, c.dias_abonados, c.faltas, c.valor_bruto, c.desconto_faltas, c.desconto_atrasos, c.adicionais, c.descontos, c.valor_final, dest || '—']
      .forEach((v, k) => put(r, k, v, k === 14 ? { ...s, font: { bold: true } } : s, [3, 4, 9, 10, 11, 12, 13, 14].includes(k) ? fmt : undefined));
  });
  const rt = 4 + linhas.length;
  const tot = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: NAVY_HEX } } };
  put(rt, 0, 'TOTAL', tot);
  for (let k = 1; k < cols.length; k++) put(rt, k, '', tot);
  [9, 10, 11, 12, 13, 14].forEach(k => {
    const col = XLSX.utils.encode_col(k);
    ws[XLSX.utils.encode_cell({ r: rt, c: k })] = { t: 'n', f: `SUM(${col}5:${col}${rt})`, v: linhas.reduce((s, l) => s + [l.calc.valor_bruto, l.calc.desconto_faltas, l.calc.desconto_atrasos, l.calc.adicionais, l.calc.descontos, l.calc.valor_final][k - 9], 0), s: tot, z: fmt };
  });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rt, c: cols.length - 1 } });
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cols.length - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: cols.length - 1 } }];
  ws['!cols'] = [5, 30, 26, 14, 12, 10, 12, 10, 8, 16, 13, 13, 13, 13, 15, 34].map(wch => ({ wch }));
  ws['!rows'] = [{ hpt: 26 }, { hpt: 20 }, { hpt: 8 }, { hpt: 34 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Folha');
  XLSX.writeFile(wb, `Folha-${variante}-${cab.periodo.replace(/[^\w]+/g, '_')}.xlsx`);
}

export interface LinhaFrequencia {
  nome: string; cargo: string; previstos: number; presentes: number; abonados: number; faltas: number; atrasos: number; saidas: number; minutosAtraso: number;
}
export function frequenciaXlsx(linhas: LinhaFrequencia[], cab: CabecalhoExport) {
  const dados = linhas.map(l => ({
    Funcionário: l.nome, Cargo: l.cargo, 'Dias previstos': l.previstos, Presentes: l.presentes, Abonados: l.abonados, Faltas: l.faltas,
    Atrasos: l.atrasos, 'Saídas antecipadas': l.saidas, 'Minutos de atraso': l.minutosAtraso,
  }));
  const ws = XLSX.utils.json_to_sheet(dados);
  ws['!cols'] = [30, 26, 14, 11, 11, 9, 9, 17, 17].map(wch => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Frequência');
  XLSX.writeFile(wb, `Frequencia-${cab.periodo.replace(/[^\w]+/g, '_')}.xlsx`);
}
export async function frequenciaPdf(linhas: LinhaFrequencia[], cab: CabecalhoExport) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const y = await cabecalhoPdf(doc, 'Relatório de frequência', 'Faltas, atrasos e abonos por funcionário', cab);
  autoTable(doc, {
    startY: y, head: [['Funcionário', 'Cargo', 'Previstos', 'Presentes', 'Abonados', 'Faltas', 'Atrasos', 'Saídas antec.', 'Min. de atraso']],
    body: linhas.map(l => [l.nome, l.cargo, l.previstos, l.presentes, l.abonados, l.faltas, l.atrasos, l.saidas, l.minutosAtraso]),
    styles: { fontSize: 9, textColor: [13, 26, 56] }, headStyles: { fillColor: NAVY, textColor: 255 }, alternateRowStyles: { fillColor: CINZA },
    columnStyles: { 2: { halign: 'center' }, 3: { halign: 'center' }, 4: { halign: 'center' }, 5: { halign: 'center' }, 6: { halign: 'center' }, 7: { halign: 'center' }, 8: { halign: 'center' } },
  });
  rodapePdf(doc, cab.escritorio.nome);
  doc.save(`Frequencia-${cab.periodo.replace(/[^\w]+/g, '_')}.pdf`);
}

/** Espelho de ponto individual: uma linha por dia, com as quatro marcações e a situação. */
export async function espelhoPdf(func: Funcionario, cargo: string, calc: FolhaCalculada, registros: RegistroPonto[], cab: CabecalhoExport, ocorrencias: { data_inicio: string; data_fim: string; tipo: TipoOcorrencia }[]) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const y = await cabecalhoPdf(doc, 'Espelho de ponto', `${func.nome} · ${cargo}`, cab);
  const hora = (data: string, tipo: RegistroPonto['tipo']) => {
    const r = registros.find(x => x.funcionario_id === func.id && x.data === data && x.tipo === tipo && x.status_aprovacao === 'aprovado');
    return r ? isoParaBR(r.horario_real).hhmm : '';
  };
  const visiveis = calc.detalhe.filter(d => d.situacao !== 'fora_contrato');
  autoTable(doc, {
    startY: y, head: [['Data', 'Entrada', 'Saída int.', 'Retorno', 'Saída', 'Situação']],
    body: visiveis.map(d => {
      const oc = ocorrencias.find(o => d.data >= o.data_inicio && d.data <= o.data_fim);
      const nota = d.situacao === 'abonado' && oc ? OCORRENCIA_LABEL[oc.tipo] : d.nota;
      return [`${fmtData(d.data)} ${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d.data + 'T12:00:00Z').getUTCDay()]}`, hora(d.data, 'entrada'), hora(d.data, 'saida_intervalo'), hora(d.data, 'retorno_intervalo'), hora(d.data, 'saida'),
        `${SITUACAO_DIA[d.situacao].rotulo}${nota ? ` · ${nota}` : ''}${d.incompleto ? ' · marcação incompleta' : ''}`];
    }),
    styles: { fontSize: 8.5, cellPadding: 1.5, textColor: [13, 26, 56] }, headStyles: { fillColor: NAVY, textColor: 255 }, alternateRowStyles: { fillColor: CINZA },
    didParseCell: h => { if (h.section === 'body' && String(h.row.raw && (h.row.raw as string[])[5]).startsWith('Falta')) h.cell.styles.textColor = [179, 38, 30]; },
    margin: { bottom: 14 },
  });
  const fy = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  doc.setFontSize(9); doc.setTextColor(60, 70, 100);
  doc.text(`Previstos: ${calc.dias_previstos} · Trabalhados: ${calc.dias_trabalhados} · Abonados: ${calc.dias_abonados} · Faltas: ${calc.faltas} · Atrasos: ${calc.atrasos}`, 14, fy);
  rodapePdf(doc, cab.escritorio.nome);
  doc.save(`Espelho-${func.nome.replace(/\s+/g, '_')}-${cab.periodo.replace(/[^\w]+/g, '_')}.pdf`);
}
