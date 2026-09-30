import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BellRing, Briefcase, CalendarDays, CalendarOff, ClipboardCheck, Clock, FileBarChart, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Smartphone, Users, Wallet,
} from 'lucide-react';
import marcaOuro from '@/assets/marca-ouro.png';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { iniciais } from '@/lib/format';

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
  const { registros, carregando, agora } = useDados();
  const [aberto, setAberto] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => setAberto(false), [loc.pathname]);
  if (!sessao) return null;
  const pendentes = registros.filter(r => r.status_aprovacao === 'pendente').length;
  const dataExtenso = new Date(agora.iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Fortaleza' });

  return (
    <div className="shell">
      <header className="mobilebar">
        <button onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu /></button>
        <img src={marcaOuro} alt="Almeida Advocacia" />
      </header>
      <aside className={`side ${aberto ? 'open' : ''}`} aria-label="Menu principal">
        <NavLink to={sessao.papel === 'admin' ? '/painel' : '/painel/gerencia'} className="side-brand" onClick={() => setAberto(false)}>
          <img src={marcaOuro} alt="Almeida Advocacia & Consultoria" />
        </NavLink>
        <nav className="nav">
          {ITENS.filter(i => (i.papeis as readonly string[]).includes(sessao.papel)).map(i => (
            <span key={i.to} style={{ display: 'contents' }}>
              {'grupo' in i && i.grupo && <div className="nav-group">{i.grupo}</div>}
              <NavLink to={i.to} end={'fim' in i && i.fim} className={({ isActive }) => (isActive ? 'on' : '')}>
                <i.icone size={19} strokeWidth={1.7} />{i.rotulo}
                {'pend' in i && i.pend && pendentes > 0 && <span className="pill">{pendentes}</span>}
              </NavLink>
            </span>
          ))}
          <div className="nav-group">Acesso</div>
          <NavLink to="/"><Smartphone size={19} strokeWidth={1.7} />Tela de ponto</NavLink>
        </nav>
        <div className="side-foot">
          <span className="avatar" style={{ width: 40, height: 40, fontSize: '.95rem' }}>{iniciais(sessao.nome)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="who">{sessao.nome}</div>
            <div className="papel">{sessao.papel === 'admin' ? 'Administrador' : 'Gerência'}</div>
          </div>
          <button className="icon-btn" aria-label="Sair" title="Sair" onClick={async () => { await sair(); nav('/entrar'); }}><LogOut size={18} /></button>
        </div>
      </aside>
      <div className="main">
        <div className="topbar-desk">
          <span className="data">{dataExtenso}</span>
          <div className="row" style={{ gap: 10 }}>
            {pendentes > 0 && <NavLink to={sessao.papel === 'admin' ? '/painel/ponto' : '/painel/gerencia'} className="chip alert"><BellRing size={15} />{pendentes} aprovação(ões) pendente(s)</NavLink>}
            <span className="chip">{sessao.papel === 'admin' ? 'Administrador' : 'Gerência'}</span>
          </div>
        </div>
        <main className="content">
          {modo === 'local' && <div className="demo-banner" style={{ marginBottom: 22 }}><strong>Modo demonstração:</strong> dados fictícios salvos só neste navegador. Configure o Supabase (README) para usar o banco real.</div>}
          {carregando ? <p className="muted">Carregando…</p> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
