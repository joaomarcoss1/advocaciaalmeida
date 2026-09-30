/** Código de autenticidade de documento: 48 bits aleatórios no formato XXXX-XXXX-XXXX. */
export function gerarCodigoDocumento(): string {
  const h = Array.from(crypto.getRandomValues(new Uint8Array(6))).map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
}
