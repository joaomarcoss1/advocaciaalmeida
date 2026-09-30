import QRCode from 'qrcode';
import type { Db, TipoDocumento } from '@/data/db';
import { gerarCodigoDocumento } from './codigo';

export interface Selo { codigo: string; url: string; qr: string; /** endereço codificado no QR (leva os dados essenciais quando o registro ainda está pendente) */ urlQr: string }
export interface SeloPendente { tipo: TipoDocumento; titulo: string; periodo: string; resumo: Record<string, unknown>; hash: string; codigo: string }

const FILA = 'almeida.selos.pendentes';
const lerFila = (): SeloPendente[] => { try { return JSON.parse(localStorage.getItem(FILA) || '[]') as SeloPendente[]; } catch { return []; } };
const gravarFila = (f: SeloPendente[]) => { try { localStorage.setItem(FILA, JSON.stringify(f.slice(-200))); } catch { /* sem armazenamento */ } };

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const paraBase64Url = (t: string) => btoa(String.fromCharCode(...new TextEncoder().encode(t))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Lê os dados que acompanham o QR de um selo ainda não confirmado pelo servidor (usado na página /verificar). */
export function lerPayloadDoSelo(d: string | null): { tipo: string; periodo: string; resumo: Record<string, unknown>; hash: string } | null {
  if (!d) return null;
  try {
    const bin = atob(d.replace(/-/g, '+').replace(/_/g, '/'));
    const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)))) as Record<string, unknown>;
    if (typeof j.t !== 'string' || typeof j.p !== 'string' || typeof j.h !== 'string' || !/^[0-9a-f]{64}$/.test(j.h)) return null;
    return { tipo: j.t, periodo: j.p, resumo: (j.r && typeof j.r === 'object' ? j.r : {}) as Record<string, unknown>, hash: j.h };
  } catch { return null; }
}

/**
 * Cria o selo do PDF (código + QR Code). O documento SEMPRE sai com selo:
 *  - o código nasce aqui, no navegador;
 *  - o registro no banco é tentado na hora; se o banco ainda não tem a atualização (ou está sem conexão),
 *    o selo entra numa fila local e o QR já carrega os dados essenciais;
 *  - a fila é enviada sozinha ao banco assim que ele estiver pronto (`sincronizarSelos`).
 * `conteudo` é o conteúdo conferível do documento; só o seu hash é guardado.
 */
export async function criarSelo(db: Db, d: { tipo: TipoDocumento; titulo: string; periodo: string; resumo: Record<string, unknown>; conteudo: unknown }): Promise<Selo> {
  const hash = await sha256(JSON.stringify({ t: d.tipo, p: d.periodo, c: d.conteudo }));
  const item: SeloPendente = { tipo: d.tipo, titulo: d.titulo, periodo: d.periodo, resumo: d.resumo, hash, codigo: gerarCodigoDocumento() };
  let registrado = true;
  try { await db.documentos.registrar(item); }
  catch { registrado = false; gravarFila([...lerFila(), item]); }
  const base = `${location.origin}/verificar/${item.codigo}`;
  const url = registrado ? base : `${base}?d=${paraBase64Url(JSON.stringify({ t: d.tipo, p: d.periodo, r: d.resumo, h: hash }))}`;
  const qr = await QRCode.toDataURL(url, { margin: 0, width: 300, errorCorrectionLevel: 'M', color: { dark: '#001746', light: '#ffffff' } });
  // O texto impresso usa o endereço curto; o QR (quando pendente) leva também os dados.
  return { codigo: item.codigo, url: base, qr, urlQr: url };
}

/** Envia ao banco os selos que ficaram na fila. Chamada automaticamente quando o painel carrega. Retorna quantos foram enviados. */
export async function sincronizarSelos(db: Db): Promise<number> {
  const fila = lerFila();
  if (!fila.length) return 0;
  const restantes: SeloPendente[] = [];
  let enviados = 0;
  for (const [i, item] of fila.entries()) {
    try { await db.documentos.registrar(item); enviados++; }
    catch { restantes.push(...fila.slice(i)); break; }   // banco ainda sem a atualização: tenta de novo na próxima vez
  }
  gravarFila(restantes);
  return enviados;
}
