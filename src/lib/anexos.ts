import type { ArquivoAnexo } from '@/data/db';

export const MAX_BYTES = 2 * 1024 * 1024;       // 2 MB por arquivo (limite do servidor)
export const MAX_ARQUIVOS = 4;
export const ACEITA = 'application/pdf,image/jpeg,image/png,image/webp,image/*';

export const fmtTamanho = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

function lerBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(new Error('Não foi possível ler o arquivo.'));
    r.readAsDataURL(blob);
  });
}
const tamanhoBase64 = (b64: string) => Math.floor((b64.length * 3) / 4);
const nomeSeguro = (n: string, ext: string) => (n.replace(/\.[^.]+$/, '').replace(/[^\w.()\- ]+/g, '_').slice(0, 60) || 'arquivo') + ext;

/** Reduz a foto (celular gera 3–8 MB) para JPEG de até ~1600 px, mantendo o texto do atestado legível. */
async function comprimirImagem(file: File): Promise<{ blob: Blob }> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file); }
  catch { throw new Error('Formato de imagem não suportado. Tire a foto em JPG/PNG ou envie o PDF.'); }
  for (const [lado, q] of [[1600, 0.82], [1400, 0.72], [1200, 0.62], [1000, 0.55]] as const) {
    const esc = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Não foi possível processar a imagem neste aparelho.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // PNG transparente vira fundo branco
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= MAX_BYTES * 0.9) { bmp.close?.(); return { blob }; }
  }
  bmp.close?.();
  throw new Error('A imagem continua grande demais mesmo reduzida. Envie uma foto mais simples ou o PDF.');
}

/** Valida e prepara um arquivo escolhido pelo funcionário (PDF ou foto). Lança Error com mensagem amigável. */
export async function prepararArquivo(file: File): Promise<ArquivoAnexo> {
  const ehPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (ehPdf) {
    if (file.size > MAX_BYTES) throw new Error(`O PDF tem ${fmtTamanho(file.size)}; o limite é 2 MB. Reduza o arquivo ou envie uma foto.`);
    const conteudo = await lerBase64(file);
    if (!conteudo.startsWith('JVBER')) throw new Error('Esse arquivo não parece ser um PDF válido.');
    return { nome: nomeSeguro(file.name, '.pdf'), mime: 'application/pdf', tamanho: tamanhoBase64(conteudo), conteudo };
  }
  if (file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    const { blob } = await comprimirImagem(file);
    const conteudo = await lerBase64(blob);
    return { nome: nomeSeguro(file.name, '.jpg'), mime: 'image/jpeg', tamanho: tamanhoBase64(conteudo), conteudo };
  }
  throw new Error('Envie um PDF ou uma foto (JPG, PNG).');
}

/** Blob para visualizar/baixar um anexo guardado em base64. */
export function base64ParaBlob(conteudo: string, mime: string): Blob {
  const bin = atob(conteudo);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
