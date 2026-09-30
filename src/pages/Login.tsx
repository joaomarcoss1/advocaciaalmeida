import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Stage from '@/components/Stage';
import { useAuth } from '@/context/Auth';
import { DEMO_ADMIN, DEMO_GERENTE } from '@/data/seed';

export default function Login() {
  const { sessao, carregando, entrar, modo } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!carregando && sessao) return <Navigate to="/painel" replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(''); setEnviando(true);
    try { await entrar(email, senha); nav('/painel'); }
    catch (x) { setErro((x as Error).message); }
    finally { setEnviando(false); }
  }

  return (
    <div className="auth">
      <Stage>
        <p className="headline">Ponto, escalas e folha em um só lugar.</p>
      </Stage>
      <section className="auth-side">
        <form className="auth-card stack passo" style={{ gap: 18 }} onSubmit={enviar}>
          <div>
            <span className="eyebrow">Acesso restrito</span>
            <h1>Entrar na plataforma</h1>
            <p className="page-sub" style={{ marginTop: 8 }}>Administração e gerência do escritório.</p>
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <div style={{ position: 'relative' }}>
              <Mail size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--faint)' }} />
              <input id="email" className="input" style={{ paddingLeft: 42 }} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={17} style={{ position: 'absolute', left: 14, top: 14, color: 'var(--faint)' }} />
              <input id="senha" className="input" style={{ paddingLeft: 42, paddingRight: 46 }} type={ver ? 'text' : 'password'} autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} />
              <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4, top: 4 }} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVer(v => !v)}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          {erro && <div className="notice bad" role="alert">{erro}</div>}
          <button className="btn block" style={{ minHeight: 48 }} disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
          {modo === 'local' && (
            <div className="demo-banner">
              <strong>Demonstração</strong> — Administrador: <code>{DEMO_ADMIN.email}</code> / <code>{DEMO_ADMIN.senha}</code><br />
              Gerência: <code>{DEMO_GERENTE.email}</code> / <code>{DEMO_GERENTE.senha}</code>
            </div>
          )}
        </form>
        <Link to="/" className="auth-link"><ArrowLeft size={15} />Voltar ao registro de ponto</Link>
      </section>
    </div>
  );
}
