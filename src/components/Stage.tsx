import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import marcaOuro from '@/assets/marca-ouro.png';

const DESTAQUES = [
  { t: 'Registro de ponto', d: 'Entrada, intervalo e saída com PIN pessoal, no celular ou no computador.' },
  { t: 'Escalas de segunda a sábado', d: 'Jornada individual por dia, com feriados, abonos e ajustes aprovados pela gerência.' },
  { t: 'Folha por diária', d: 'Dias trabalhados e faltas apurados automaticamente, com desconto e total a pagar.' },
];
const INTERVALO = 5500;

/** Faixa lateral das telas de ponto e login: logo em destaque, fundo com colunas que reagem ao cursor e destaques rotativos. */
export default function Stage({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [ativo, setAtivo] = useState(0);
  const [pausa, setPausa] = useState(false);
  // Respeita "reduzir movimento": sem troca automática de destaques (WCAG 2.2.2); pausa também com foco do teclado.
  const [reduz] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const parado = pausa || reduz;

  useEffect(() => {
    if (parado) return;
    const t = setTimeout(() => setAtivo(a => (a + 1) % DESTAQUES.length), INTERVALO);
    return () => clearTimeout(t);
  }, [ativo, parado]);

  function mover(e: React.PointerEvent<HTMLElement>) {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', String((e.clientX - r.left) / r.width));
    el.style.setProperty('--my', String((e.clientY - r.top) / r.height));
  }
  function soltar() {
    ref.current?.style.removeProperty('--mx');
    ref.current?.style.removeProperty('--my');
  }

  return (
    <section className="stage" ref={ref} onPointerMove={mover} onPointerLeave={soltar}>
      <div className="stage-bg" aria-hidden="true">
        <span className="luz" />
        {Array.from({ length: 7 }).map((_, k) => <i key={k} className="coluna" style={{ '--k': k } as CSSProperties} />)}
      </div>

      <header className="stage-top">
        <img className="stage-logo" src={marcaOuro} alt="Almeida Advocacia & Consultoria" />
        <span className="stage-rule" aria-hidden="true" />
      </header>

      <div className="stage-mid">{children}</div>

      <footer className="stage-bottom" onPointerEnter={() => setPausa(true)} onPointerLeave={() => setPausa(false)} onFocus={() => setPausa(true)} onBlur={() => setPausa(false)}>
        <div className="destaques" aria-live="off">
          {DESTAQUES.map((x, k) => (
            <article key={x.t} className={k === ativo ? 'on' : ''} aria-hidden={k !== ativo}>
              <h3>{x.t}</h3>
              <p>{x.d}</p>
            </article>
          ))}
        </div>
        <div className="barras" role="tablist" aria-label="Destaques do sistema">
          {DESTAQUES.map((x, k) => (
            <button key={x.t} role="tab" aria-selected={k === ativo} aria-label={x.t} className={k === ativo ? 'on' : ''} onClick={() => setAtivo(k)}>
              <span style={k === ativo && !parado ? { animationDuration: `${INTERVALO}ms` } : undefined} />
            </button>
          ))}
        </div>
        <div className="stage-foot">Codó · Maranhão</div>
      </footer>
    </section>
  );
}
