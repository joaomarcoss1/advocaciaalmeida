import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Printer, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { travarRolagem } from '@/lib/rolagem';

/* ---------- Toast ---------- */
interface ToastCtx { ok(m: string): void; erro(m: string): void }
const ToastC = createContext<ToastCtx | null>(null);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<{ id: number; msg: string; erro: boolean }[]>([]);
  const prox = useRef(1);
  const push = useCallback((msg: string, erro: boolean) => {
    const id = prox.current++;
    setItens(x => [...x, { id, msg, erro }]);
    setTimeout(() => setItens(x => x.filter(i => i.id !== id)), erro ? 6000 : 3500);
  }, []);
  const api = useRef<ToastCtx>({ ok: m => push(m, false), erro: m => push(m, true) });
  return (
    <ToastC.Provider value={api.current}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {itens.map(i => <div key={i.id} className={`toast ${i.erro ? 'erro' : ''}`}>{i.msg}</div>)}
      </div>
    </ToastC.Provider>
  );
}
export function useToast() {
  const c = useContext(ToastC);
  if (!c) throw new Error('useToast fora do ToastProvider');
  return c;
}

/* ---------- Modal ---------- */
export function Modal({ titulo, onClose, children, rodape, largo }: {
  titulo: string; onClose(): void; children: ReactNode; rodape?: ReactNode; largo?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    const liberar = travarRolagem();
    return () => { document.removeEventListener('keydown', h); liberar(); };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${largo ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="modal-head">
          <h3>{titulo}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {rodape && <div className="modal-foot">{rodape}</div>}
      </div>
    </div>
  );
}

/* ---------- Confirmação ---------- */
const ConfC = createContext<((msg: string, opts?: { perigo?: boolean; rotulo?: string }) => Promise<boolean>) | null>(null);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<{ msg: string; perigo: boolean; rotulo: string; fim(v: boolean): void } | null>(null);
  const confirmar = useCallback((msg: string, opts?: { perigo?: boolean; rotulo?: string }) =>
    new Promise<boolean>(res => setEstado({ msg, perigo: !!opts?.perigo, rotulo: opts?.rotulo ?? 'Confirmar', fim: res })), []);
  const fechar = (v: boolean) => { estado?.fim(v); setEstado(null); };
  return (
    <ConfC.Provider value={confirmar}>
      {children}
      {estado && (
        <Modal titulo="Confirmação" onClose={() => fechar(false)} rodape={<>
          <button className="btn ghost" onClick={() => fechar(false)}>Cancelar</button>
          <button className={`btn ${estado.perigo ? 'danger' : ''}`} onClick={() => fechar(true)}>{estado.rotulo}</button>
        </>}>
          <p>{estado.msg}</p>
        </Modal>
      )}
    </ConfC.Provider>
  );
}
export function useConfirm() {
  const c = useContext(ConfC);
  if (!c) throw new Error('useConfirm fora do ConfirmProvider');
  return c;
}

/* ---------- Blocos ---------- */
const EYEBROW: Record<string, string> = {
  '/painel': 'Visão geral', '/painel/gerencia': 'Gerência', '/painel/funcionarios': 'Equipe', '/painel/cargos': 'Equipe', '/painel/escalas': 'Equipe',
  '/painel/ponto': 'Frequência', '/painel/ocorrencias': 'Frequência', '/painel/feriados': 'Frequência', '/painel/folha': 'Financeiro',
  '/painel/relatorios': 'Financeiro', '/painel/configuracoes': 'Sistema',
};
/** Telas com tabelas que fazem sentido imprimir (layout próprio de impressão no CSS). */
const IMPRIMIVEL = new Set(['/painel', '/painel/funcionarios', '/painel/cargos', '/painel/escalas', '/painel/ponto', '/painel/ocorrencias', '/painel/feriados', '/painel/folha', '/painel/relatorios']);
export function PageHeader({ titulo, sub, children }: { titulo: string; sub?: ReactNode; children?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">{EYEBROW[pathname] ?? 'Almeida Advocacia'}</span>
        <h1 className="page-title">{titulo}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      <div className="row no-print">
        {children}
        {IMPRIMIVEL.has(pathname) && <button type="button" className="btn ghost" onClick={() => window.print()} title="Imprimir esta tela"><Printer />Imprimir</button>}
      </div>
    </div>
  );
}
/** Campo com rótulo. O rótulo é ligado ao primeiro input/select/textarea do campo (leitores de tela e clique no texto). */
export function Field({ label, dica, children }: { label: string; dica?: string; children: ReactNode }) {
  const base = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const raiz = ref.current;
    const ctl = raiz?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea');
    const lab = raiz?.querySelector('label');
    if (!ctl || !lab) return;
    if (!ctl.id) ctl.id = `f${base.replace(/:/g, '')}`;
    lab.htmlFor = ctl.id;
    if (dica) { const h = raiz?.querySelector<HTMLElement>('.hint'); if (h) { h.id = `${ctl.id}-dica`; ctl.setAttribute('aria-describedby', h.id); } }
  });
  return (
    <div className="field" ref={ref}>
      <label>{label}</label>
      {children}
      {dica && <span className="hint">{dica}</span>}
    </div>
  );
}
export function Kpi({ label, valor, dica, alerta, icone }: { label: string; valor: ReactNode; dica?: ReactNode; alerta?: boolean; icone?: ReactNode }) {
  return (
    <div className={`card kpi ${alerta ? 'alert' : ''}`}>
      <div className="top"><div className="label">{label}</div>{icone && <div className="ico">{icone}</div>}</div>
      <div className="value">{valor}</div>
      {dica && <div className="hint">{dica}</div>}
    </div>
  );
}
export type Tom = 'ok' | 'warn' | 'bad' | 'gold' | 'mute' | '';
export function Badge({ tom = '', children }: { tom?: Tom; children: ReactNode }) {
  return <span className={`badge ${tom}`}>{children}</span>;
}
export type TipoVazio = 'pessoas' | 'calendario' | 'documento' | 'busca' | 'ok' | 'cargos';
const ILUSTRACAO: Record<TipoVazio, ReactNode> = {
  pessoas: (<><circle className="a" cx="80" cy="62" r="46" /><circle className="b" cx="80" cy="46" r="15" /><path className="b" d="M50 92c3-17 15-25 30-25s27 8 30 25" /><path className="c" d="M112 40l4-8m4 14l8-2" /></>),
  calendario: (<><rect className="a" x="30" y="24" width="100" height="78" rx="12" /><rect className="b" x="30" y="24" width="100" height="78" rx="10" /><path className="b" d="M30 46h100M56 16v14M104 16v14" /><path className="c" d="M52 66h14m14 0h14m14 0h6M52 84h14m14 0h14" /></>),
  documento: (<><path className="a" d="M42 14h52l24 24v72a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6z" /><path className="b" d="M94 14v24h24M42 14h52l24 24v72a6 6 0 0 1-6 6H42a6 6 0 0 1-6-6V20a6 6 0 0 1 6-6z" /><path className="c" d="M52 62h44M52 78h44M52 94h26" /></>),
  busca: (<><circle className="a" cx="72" cy="58" r="38" /><circle className="b" cx="72" cy="58" r="26" /><path className="b" d="M92 78l24 24" /><path className="c" d="M62 58h20" /></>),
  ok: (<><circle className="a" cx="80" cy="62" r="46" /><circle className="b" cx="80" cy="62" r="30" /><path className="c" d="M66 62l10 11 20-22" /></>),
  cargos: (<><rect className="a" x="26" y="40" width="108" height="66" rx="10" /><rect className="b" x="26" y="40" width="108" height="66" rx="10" /><path className="b" d="M60 40V28a6 6 0 0 1 6-6h28a6 6 0 0 1 6 6v12M26 70h108" /><path className="c" d="M72 70v10h16V70" /></>),
};
/** Estado vazio com ilustração e, se houver, uma ação clara (ex.: "Cadastrar o primeiro funcionário"). */
export function Vazio({ children, tipo = 'documento', titulo, acao }: { children: ReactNode; tipo?: TipoVazio; titulo?: string; acao?: { rotulo: string; onClick(): void } }) {
  return (
    <div className="vazio" role="status">
      <svg className="ilu" viewBox="0 0 160 124" aria-hidden="true" focusable="false">{ILUSTRACAO[tipo]}</svg>
      {titulo && <strong>{titulo}</strong>}
      <p>{children}</p>
      {acao && <button className="btn" onClick={acao.onClick}>{acao.rotulo}</button>}
    </div>
  );
}

/* ---------- Esqueletos de carregamento ---------- */
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div className={`esq ${className}`} aria-hidden="true" />;
}
export function PaginaEsqueleto() {
  return (
    <div className="esq-pagina" role="status" aria-label="Carregando…">
      <div><Esqueleto className="t" /><Esqueleto className="s" /></div>
      <div className="grid c4"><Esqueleto className="kpi-e" /><Esqueleto className="kpi-e" /><Esqueleto className="kpi-e" /><Esqueleto className="kpi-e" /></div>
      <div className="card">{[0, 1, 2, 3, 4, 5].map(i => <Esqueleto key={i} className="linha" />)}</div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
export function Abas<T extends string>({ valor, onChange, itens }: {
  valor: T; onChange(v: NoInfer<T>): void; itens: { id: NoInfer<T>; rotulo: string; contagem?: number }[];
}) {
  return (
    <div className="tabs" role="tablist">
      {itens.map(i => (
        <button key={i.id} role="tab" aria-selected={valor === i.id} className={valor === i.id ? 'on' : ''} onClick={() => onChange(i.id)}>
          {i.rotulo}{!!i.contagem && <span className="count">{i.contagem}</span>}
        </button>
      ))}
    </div>
  );
}
