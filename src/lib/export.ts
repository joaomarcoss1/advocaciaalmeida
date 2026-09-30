import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { fmtData, isoParaBR } from './datetime';
import { CINZA, NAVY, GOLD, R, cabecalhoPdf, dadosPagamento, rodapePdf, type CabecalhoExport, type LinhaExport } from './exportBase';
import type { FolhaCalculada } from './folha';
import { minParaHoras } from './format';
import { SITUACAO_DIA } from './rotulos';
import { AJUSTE_LABEL, OCORRENCIA_LABEL, type Funcionario, type RegistroPonto, type TipoOcorrencia } from './types';

export { dadosPagamento } from './exportBase';
export type { CabecalhoExport, LinhaExport } from './exportBase';
import { eventos } from './exportFolha';
export { folhaPdf, folhaXlsx } from './exportFolha';

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
  if (c.desconto_atrasos) descontos.push([`Atrasos e saídas antecipadas (${minParaHoras(c.detalhe.reduce((t, d) => t + (d.descontado_min ?? 0), 0))} descontados, sem descontar a diária inteira)`, R(c.desconto_atrasos)]);
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
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  const pg = dadosPagamento(l.func);
  autoTable(doc, {
    startY: y, theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: CINZA, textColor: NAVY },
    head: [['Chave PIX', 'Conta bancária']], body: [[pg.pix || 'Não informado', pg.conta || 'Não informada']],
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
  // Ocorrências do período (faltas, atrasos, abonos e ajustes) com o efeito de cada uma
  const ev = eventos([l]).filter(e => !e.tipo.startsWith('Ajuste'));
  if (ev.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text('Ocorrências do período', 14, y);
    autoTable(doc, {
      startY: y + 2, theme: 'grid', styles: { fontSize: 8.2, cellPadding: 1.5, textColor: [13, 26, 56], lineColor: [226, 230, 240] }, headStyles: { fillColor: NAVY, textColor: 255 },
      head: [['Data', 'Ocorrência', 'Detalhe', 'Análise', 'Efeito']],
      body: ev.slice(0, 40).map(e => [fmtData(e.data), e.tipo, e.detalhe, e.situacao, e.efeito]),
      columnStyles: { 0: { cellWidth: 22 }, 4: { halign: 'right', cellWidth: 40 } },
      didParseCell: h => { if (h.section === 'body' && h.column.index === 4) h.cell.styles.textColor = ev[h.row.index].valor < 0 ? [176, 32, 32] : [110, 122, 150]; },
      margin: { left: 14, right: 14, bottom: 26 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }
  const h = doc.internal.pageSize.getHeight();
  if (y + 40 > h - 26) { doc.addPage(); y = 30; }
  const sy = Math.max(y + 26, h - 55);
  doc.setDrawColor(...NAVY); doc.line(20, sy, 90, sy); doc.line(120, sy, 190, sy);
  doc.setFontSize(9); doc.setTextColor(60, 70, 100);
  doc.text('Funcionário(a)', 55, sy + 5, { align: 'center' }); doc.text('Responsável pelo pagamento', 155, sy + 5, { align: 'center' });
  rodapePdf(doc, 'Documento gerencial de conferência · não substitui o recibo/holerite oficial (INSS, IRRF e FGTS não incluídos)', cab.selo);
  doc.save(`Demonstrativo-${l.func.nome.replace(/\s+/g, '_')}-${cab.periodo.replace(/[^\w]+/g, '_')}.pdf`);
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
  rodapePdf(doc, cab.escritorio.nome, cab.selo);
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
  rodapePdf(doc, cab.escritorio.nome, cab.selo);
  doc.save(`Espelho-${func.nome.replace(/\s+/g, '_')}-${cab.periodo.replace(/[^\w]+/g, '_')}.pdf`);
}
