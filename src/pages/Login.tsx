import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import logo from '@/assets/logo-vertical.webp';
import { useAuth } from '@/context/Auth';
import { DEMO_ADMIN, DEMO_GERENTE } from '@/data/seed';

export default function Login() {
  const { sessao, carregando, entrar, modo } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
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
    <div className="hero">
      <img className="hero-logo" src={logo} alt="Almeida Advocacia & Consultoria" />
      <form className="panel stack" onSubmit={enviar}>
        <div>
          <div className="eyebrow">Plataforma administrativa</div>
          <h1 className="page-title" style={{ marginTop: 4 }}>Entrar</h1>
          <p className="page-sub">Acesso da administração e da gerência.</p>
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input id="senha" className="input" type="password" autoComplete="current-password" required value={senha} onChange={e => setSenha(e.target.value)} />
        </div>
        {erro && <div className="badge bad" role="alert" style={{ padding: '8px 12px', borderRadius: 10 }}>{erro}</div>}
        <button className="btn gold block" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        {modo === 'local' && (
          <div className="demo-banner">
            <strong>Demonstração</strong> — Administrador: <code>{DEMO_ADMIN.email}</code> / <code>{DEMO_ADMIN.senha}</code><br />
            Gerência: <code>{DEMO_GERENTE.email}</code> / <code>{DEMO_GERENTE.senha}</code>
          </div>
        )}
        <Link to="/" className="center hint">← Voltar para o registro de ponto</Link>
      </form>
    </div>
  );
}
