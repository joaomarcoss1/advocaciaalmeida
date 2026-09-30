import { jsPDF } from 'jspdf';
import logoOuro from '@/assets/marca-ouro.png';
import { agoraBR, fmtData } from './datetime';
import type { FolhaCalculada } from './folha';
import type { Selo } from './selo';
import type { AjusteFolha, ConfigEscritorio, Funcionario } from './types';

export const NAVY: [number, number, number] = [0, 32, 96];
export const GOLD: [number, number, number] = [209, 180, 125];
export const CINZA: [number, number, number] = [244, 246, 250];
export const NAVY_HEX = '002060', GOLD_HEX = 'D1B47D', CINZA_HEX = 'F4F6FA';

export interface LinhaExport { func: Funcionario; cargo: string; calc: FolhaCalculada; ajustes?: AjusteFolha[] }
export interface CabecalhoExport { escritorio: ConfigEscritorio; periodo: string; selo?: Selo; /** Ex.: 'Definitiva' ou 'Prévia — 2 itens em análise'. */ situacao?: string }

export const R = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const emissao = () => { const a = agoraBR(); return `${fmtData(a.data)} às ${a.hhmm}`; };

/** Dados de pagamento do funcionário: PIX e/ou conta bancária (mostra os dois quando existirem). */
export function dadosPagamento(f: Funcionario): { pix: string; conta: string } {
  const conta = [f.banco, f.agencia && `Ag ${f.agencia}`, f.conta && `${f.tipo_conta ?? 'Conta'} ${f.conta}`].filter(Boolean).join(' · ');
  return { pix: f.pix ?? '', conta };
}

export async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob); });
}

/**
 * Cabeçalho premium: faixa azul com a marca em dourado, título à direita, filete dourado e uma linha de
 * informações (competência, emissão, situação). Devolve o Y livre para o conteúdo.
 */
export async function cabecalhoPdf(doc: jsPDF, titulo: string, sub: string, cab: CabecalhoExport): Promise<number> {
  const w = doc.internal.pageSize.getWidth();
  const logo = await dataUrl(logoOuro);
  doc.setFillColor(...NAVY); doc.rect(0, 0, w, 35, 'F');
  doc.setFillColor(...GOLD); doc.rect(0, 35, w, 1.3, 'F');
  const alt = 25, larg = alt * (900 / 509);
  doc.addImage(logo, 'PNG', 10, 5, larg, alt);
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.text(titulo.toUpperCase(), w - 10, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(203, 213, 240);
  doc.text(sub, w - 10, 20.5, { align: 'right' });
  doc.setTextColor(...GOLD); doc.setFontSize(8.5);
  doc.text([cab.escritorio.nome, cab.escritorio.cidade, cab.escritorio.cnpj && `CNPJ ${cab.escritorio.cnpj}`].filter(Boolean).join('  ·  '), w - 10, 27, { align: 'right' });

  // linha de informações
  const y = 41, h = 11;
  doc.setFillColor(...CINZA); doc.roundedRect(10, y, w - 20, h, 1.6, 1.6, 'F');
  const cols: [string, string][] = [['COMPETÊNCIA', cab.periodo], ['EMISSÃO', emissao()], ['SITUAÇÃO', cab.situacao ?? 'Definitiva']];
  const pesos = [0.44, 0.24, 0.32];
  let acum = 10;
  cols.forEach(([rot, val], i) => {
    const largCol = (w - 20) * pesos[i];
    const x = acum + 5; acum += largCol;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(110, 122, 150); doc.text(rot, x, y + 4.2);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.6); doc.setTextColor(...(rot === 'SITUAÇÃO' && (cab.situacao ?? '').startsWith('Prévia') ? [154, 100, 8] as [number, number, number] : NAVY));
    doc.text(val, x, y + 8.6, { maxWidth: largCol - 8 });
  });
  return y + h + 6;
}
/** Rodapé de todas as páginas: texto, paginação e, quando há selo, QR Code + código de autenticidade. */
export function rodapePdf(doc: jsPDF, texto: string, selo?: Selo) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setFontSize(7.5); doc.setTextColor(120, 128, 150);
    if (selo) {
      // com o QR à esquerda, o texto ocupa o espaço restante, alinhado à direita e em até 2 linhas
      const linhas: string[] = doc.splitTextToSize(`${texto} · Página ${i} de ${n}`, w - 100);
      linhas.slice(-2).forEach((ln, k, arr) => doc.text(ln, w - 8, h - 6 - (arr.length - 1 - k) * 3.3, { align: 'right' }));
    } else doc.text(`${texto} · Página ${i} de ${n}`, w / 2, h - 6, { align: 'center' });
    if (selo) {
      const q = 18;
      doc.addImage(selo.qr, 'PNG', 8, h - q - 3, q, q);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...NAVY);
      doc.text('AUTENTICIDADE', 8 + q + 3, h - 15);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(90, 102, 133);
      doc.text(`Código ${selo.codigo}`, 8 + q + 3, h - 11.4);
      doc.text(`Confira em ${selo.url.replace(/^https?:\/\//, '')}`, 8 + q + 3, h - 7.8);
    }
  }
}

