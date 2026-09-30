import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useLocation } from 'react-router-dom';

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
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = antes; };
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
export function PageHeader({ titulo, sub, children }: { titulo: string; sub?: ReactNode; children?: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">{EYEBROW[pathname] ?? 'Almeida Advocacia'}</span>
        <h1 className="page-title">{titulo}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}
export function Field({ label, dica, children }: { label: string; dica?: string; children: ReactNode }) {
  return (
    <div className="field">
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
export function Vazio({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
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
