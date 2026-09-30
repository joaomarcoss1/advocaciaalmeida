/**
 * Trava a rolagem da página enquanto há modal/gaveta aberto.
 * Usa contador: com vários modais ao mesmo tempo (ou fechando fora de ordem) a página só volta
 * a rolar quando o último trava for liberado — nunca fica presa.
 */
let travas = 0;
export function travarRolagem(): () => void {
  if (travas++ === 0) document.documentElement.classList.add('sem-rolagem');
  let liberada = false;
  return () => {
    if (liberada) return;
    liberada = true;
    if (--travas <= 0) { travas = 0; document.documentElement.classList.remove('sem-rolagem'); }
  };
}
