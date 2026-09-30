import { useCallback, useEffect, useState } from 'react';

export type Tema = 'auto' | 'claro' | 'escuro';
export type Densidade = 'confortavel' | 'compacta';

const K_TEMA = 'almeida.tema', K_DENS = 'almeida.densidade';
const ler = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const gravar = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };

export function aplicarTema(t: Tema) {
  const escuro = t === 'escuro' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', escuro ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', escuro ? '#0b1120' : '#002060');
}
export function aplicarDensidade(d: Densidade) {
  if (d === 'compacta') document.documentElement.setAttribute('data-densidade', 'compacta');
  else document.documentElement.removeAttribute('data-densidade');
}

export function useAparencia() {
  const [tema, setTemaS] = useState<Tema>(() => (ler(K_TEMA) as Tema) || 'auto');
  const [densidade, setDensS] = useState<Densidade>(() => (ler(K_DENS) as Densidade) || 'confortavel');
  const setTema = useCallback((t: Tema) => { gravar(K_TEMA, t); setTemaS(t); aplicarTema(t); }, []);
  const setDensidade = useCallback((d: Densidade) => { gravar(K_DENS, d); setDensS(d); aplicarDensidade(d); }, []);
  // no modo automático acompanha o sistema em tempo real
  useEffect(() => {
    if (tema !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const f = () => aplicarTema('auto');
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [tema]);
  return { tema, setTema, densidade, setDensidade };
}
