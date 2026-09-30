import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import marcaOuro from '@/assets/marca-ouro.png';
import monograma from '@/assets/monograma-ouro.png';
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
      <section className="stage">
        <img className="stage-logo" src={marcaOuro} alt="Almeida Advocacia & Consultoria" />
        <div className="stage-clock">
          <div className="hora" style={{ fontSize: 'clamp(2.6rem, 5.4vw, 4.8rem)', lineHeight: 1.02 }}>
            Ponto, escalas e folha <em style={{ color: 'var(--gold)' }}>em um só lugar.</em>
          </div>
          <p className="dia">Plataforma administrativa do escritório.</p>
        </div>
        <div className="stage-foot">Codó · Maranhão</div>
        <img className="mark" src={monograma} alt="" />
      </section>
      <section className="auth-side">
        <form className="auth-card stack" style={{ gap: 20 }} onSubmit={enviar}>
          <div>
            <span className="eyebrow">Acesso restrito</span>
            <h1>Entrar na plataforma</h1>
            <p className="page-sub" style={{ marginTop: 8 }}>Administração e gerência do escritório.</p>
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <div style={{ position: 'relative' }}>
              <Mail size={17} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--muted)' }} />
              <input id="email" className="input" style={{ paddingLeft: 42 }} type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={17} style={{ position: 'absolute', left: 14, top: 15, color: 'var(--muted)' }} />
              <input id="senha" className="input" style={{ paddingLeft: 42, paddingRight: 46 }} type={ver ? 'text' : 'password'} autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} />
              <button type="button" className="icon-btn" style={{ position: 'absolute', right: 4, top: 4 }} aria-label={ver ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVer(v => !v)}>{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </div>
          {erro && <div className="notice bad" role="alert">{erro}</div>}
          <button className="btn gold block" style={{ minHeight: 52 }} disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
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
