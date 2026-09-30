import QRCode from 'qrcode';
import type { Db, TipoDocumento } from '@/data/db';

export interface Selo { codigo: string; url: string; qr: string }

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Registra o documento no banco (código gerado no servidor) e devolve o selo com QR Code que vai no rodapé do PDF.
 * `conteudo` é o conteúdo conferível do documento; só o seu hash é guardado. `resumo` aparece na página pública de verificação.
 */
export async function criarSelo(db: Db, d: { tipo: TipoDocumento; titulo: string; periodo: string; resumo: Record<string, unknown>; conteudo: unknown }): Promise<Selo | undefined> {
  try {
    const hash = await sha256(JSON.stringify({ t: d.tipo, p: d.periodo, c: d.conteudo }));
    const codigo = await db.documentos.registrar({ tipo: d.tipo, titulo: d.titulo, periodo: d.periodo, resumo: d.resumo, hash });
    const url = `${location.origin}/verificar/${codigo}`;
    const qr = await QRCode.toDataURL(url, { margin: 0, width: 260, errorCorrectionLevel: 'M', color: { dark: '#001746', light: '#ffffff' } });
    return { codigo, url, qr };
  } catch {
    // Se o banco ainda não tem a atualização, o PDF sai normalmente, sem selo.
    return undefined;
  }
}
