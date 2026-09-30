import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase, CalendarDays, CalendarOff, ClipboardCheck, Clock, FileBarChart, FileSpreadsheet, LayoutDashboard, LogOut,
  Menu, Settings, ShieldCheck, Users, Wallet,
} from 'lucide-react';
import logoIcone from '@/assets/logo-icone.png';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';

const ITENS = [
  { grupo: 'Visão geral', to: '/painel', fim: true, rotulo: 'Painel', icone: LayoutDashboard, papeis: ['admin'] },
  { to: '/painel/gerencia', rotulo: 'Gerência', icone: ShieldCheck, papeis: ['admin', 'gerente'], pend: true },
  { grupo: 'Equipe', to: '/painel/funcionarios', rotulo: 'Funcionários', icone: Users, papeis: ['admin'] },
  { to: '/painel/cargos', rotulo: 'Cargos', icone: Briefcase, papeis: ['admin'] },
  { to: '/painel/escalas', rotulo: 'Escalas', icone: CalendarDays, papeis: ['admin', 'gerente'] },
  { grupo: 'Frequência', to: '/painel/ponto', rotulo: 'Registros de ponto', icone: Clock, papeis: ['admin', 'gerente'] },
  { to: '/painel/ocorrencias', rotulo: 'Ocorrências e abonos', icone: ClipboardCheck, papeis: ['admin', 'gerente'] },
  { to: '/painel/feriados', rotulo: 'Feriados', icone: CalendarOff, papeis: ['admin', 'gerente'] },
  { grupo: 'Financeiro', to: '/painel/folha', rotulo: 'Folha de pagamento', icone: Wallet, papeis: ['admin'] },
  { to: '/painel/relatorios', rotulo: 'Relatórios', icone: FileBarChart, papeis: ['admin', 'gerente'] },
  { grupo: 'Sistema', to: '/painel/configuracoes', rotulo: 'Configurações', icone: Settings, papeis: ['admin'] },
] as const;

export default function Layout() {
  const { sessao, sair, modo } = useAuth();
  const { registros, carregando } = useDados();
  const [aberto, setAberto] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setAberto(false), [loc.pathname]);
  if (!sessao) return null;
  const pendentes = registros.filter(r => r.status_aprovacao === 'pendente').length;

  return (
    <div className="shell">
      <header className="topbar">
        <button onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu /></button>
        <span className="brand-display">Almeida</span>
      </header>
      <aside className={`side ${aberto ? 'open' : ''}`} aria-label="Menu principal">
        <NavLink to="/painel" className="side-brand" onClick={() => setAberto(false)}>
          <img src={logoIcone} alt="" />
          <div>
            <div className="nome">Almeida</div>
            <div className="sub">Advocacia &amp; Consultoria</div>
          </div>
        </NavLink>
        <nav className="nav">
          {ITENS.filter(i => (i.papeis as readonly string[]).includes(sessao.papel)).map(i => (
            <span key={i.to} style={{ display: 'contents' }}>
              {'grupo' in i && i.grupo && <div className="nav-group">{i.grupo}</div>}
              <NavLink to={i.to} end={'fim' in i && i.fim} className={({ isActive }) => (isActive ? 'on' : '')}>
                <i.icone size={19} />{i.rotulo}
                {'pend' in i && i.pend && pendentes > 0 && <span className="pill">{pendentes}</span>}
              </NavLink>
            </span>
          ))}
          <div className="nav-group">Acesso</div>
          <NavLink to="/"><FileSpreadsheet size={19} />Tela de ponto</NavLink>
        </nav>
        <div className="side-foot">
          <div className="who">{sessao.nome}</div>
          <div className="papel">{sessao.papel === 'admin' ? 'Administrador' : 'Gerência'}</div>
          <button className="btn ghost sm block" style={{ marginTop: 12, color: '#fff', borderColor: 'rgb(255 255 255 / 30%)' }}
            onClick={async () => { await sair(); nav('/entrar'); }}>
            <LogOut size={16} />Sair
          </button>
        </div>
      </aside>
      <main className="main">
        {modo === 'local' && (
          <div className="demo-banner" style={{ marginBottom: 18 }}>
            <strong>Modo demonstração:</strong> os dados ficam salvos só neste navegador. Configure o Supabase (veja o README) para usar o banco real.
          </div>
        )}
        {carregando ? <p className="muted">Carregando…</p> : <Outlet />}
      </main>
    </div>
  );
}
