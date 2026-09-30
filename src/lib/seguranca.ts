/** Regras de PIN e senha (espelham as do banco — o servidor é quem decide). */
const SEQ = '01234567890123456789';
const SEQ_INV = '98765432109876543210';

export function pinFraco(pin: string): boolean {
  return /^(\d)\1+$/.test(pin) || SEQ.includes(pin) || SEQ_INV.includes(pin) || /^(\d\d)\1+$/.test(pin) || /^(\d\d\d)\1+$/.test(pin)
    || ['123123', '112233', '121212', '654321'].includes(pin);
}

/** Devolve a mensagem de erro do PIN ou '' se estiver bom. */
export function validarPin(pin: string): string {
  if (!/^\d{6,8}$/.test(pin)) return 'O PIN deve ter de 6 a 8 números.';
  if (pinFraco(pin)) return 'PIN fácil de adivinhar (sequência ou repetição). Escolha outro.';
  return '';
}

export function gerarPin(tamanho = 6): string {
  for (;;) {
    const p = Array.from(crypto.getRandomValues(new Uint8Array(tamanho))).map(n => n % 10).join('');
    if (!validarPin(p)) return p;
  }
}

export function validarSenha(senha: string): string {
  if (senha.length < 10) return 'A senha deve ter pelo menos 10 caracteres.';
  if (!/[A-Za-z]/.test(senha) || !/\d/.test(senha)) return 'A senha deve ter letras e números.';
  return '';
}

export function gerarSenha(tamanho = 14): string {
  const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  for (;;) {
    const s = Array.from(crypto.getRandomValues(new Uint32Array(tamanho))).map(n => alfa[n % alfa.length]).join('');
    if (!validarSenha(s)) return s;
  }
}

/** 0 a 4 — só para o medidor visual. */
export function forcaSenha(s: string): number {
  let p = 0;
  if (s.length >= 10) p++;
  if (s.length >= 14) p++;
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) p++;
  if (/\d/.test(s) && /[^A-Za-z0-9]/.test(s)) p++;
  return Math.min(p, 4);
}
