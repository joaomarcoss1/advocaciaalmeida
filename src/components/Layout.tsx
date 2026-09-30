import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Briefcase, CalendarDays, CalendarOff, ClipboardCheck, Clock, FileBarChart, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Smartphone, Users, Wallet, X,
  type LucideIcon,
} from 'lucide-react';
import marcaOuro from '@/assets/marca-ouro.png';
import sqlAtualizacao from '../../supabase/atualizacao_definitiva.sql?raw';
import Aparencia from '@/components/Aparencia';
import { PaginaEsqueleto } from '@/components/ui';
import logoHorizontal from '@/assets/logo-horizontal.png';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { iniciais } from '@/lib/format';
import { travarRolagem } from '@/lib/rolagem';

interface Item { grupo?: string; to: string; fim?: boolean; rotulo: string; curto?: string; icone: LucideIcon; papeis: ('admin' | 'gerente')[]; pend?: boolean }
const ITENS: Item[] = [
  { grupo: 'Visão geral', to: '/painel', fim: true, rotulo: 'Painel', icone: LayoutDashboard, papeis: ['admin'] },
  { to: '/painel/gerencia', rotulo: 'Gerência', icone: ShieldCheck, papeis: ['admin', 'gerente'], pend: true },
  { grupo: 'Equipe', to: '/painel/funcionarios', rotulo: 'Funcionários', curto: 'Equipe', icone: Users, papeis: ['admin'] },
  { to: '/painel/cargos', rotulo: 'Cargos', icone: Briefcase, papeis: ['admin'] },
  { to: '/painel/escalas', rotulo: 'Escalas', icone: CalendarDays, papeis: ['admin', 'gerente'] },
  { grupo: 'Frequência', to: '/painel/ponto', rotulo: 'Registros de ponto', curto: 'Ponto', icone: Clock, papeis: ['admin', 'gerente'] },
  { to: '/painel/ocorrencias', rotulo: 'Ocorrências e abonos', curto: 'Ocorrências', icone: ClipboardCheck, papeis: ['admin', 'gerente'] },
  { to: '/painel/feriados', rotulo: 'Feriados', icone: CalendarOff, papeis: ['admin', 'gerente'] },
  { grupo: 'Financeiro', to: '/painel/folha', rotulo: 'Folha de pagamento', curto: 'Folha', icone: Wallet, papeis: ['admin'] },
  { to: '/painel/relatorios', rotulo: 'Relatórios', icone: FileBarChart, papeis: ['admin', 'gerente'] },
  { grupo: 'Sistema', to: '/painel/configuracoes', rotulo: 'Configurações', curto: 'Ajustes', icone: Settings, papeis: ['admin'] },
];
// Atalhos da barra inferior no celular
const ATALHOS: Record<'admin' | 'gerente', string[]> = {
  admin: ['/painel', '/painel/ponto', '/painel/folha', '/painel/funcionarios'],
  gerente: ['/painel/gerencia', '/painel/ponto', '/painel/ocorrencias', '/painel/escalas'],
};

/** Copia o texto dos cabeçalhos para cada célula (data-label), usado pelo CSS que transforma tabelas em cartões no celular. */
function useRotulosDeTabela() {
  useEffect(() => {
    let raf = 0;
    const aplicar = () => {
      document.querySelectorAll<HTMLTableElement>('table.tbl').forEach(t => {
        const cab = Array.from(t.querySelectorAll('thead th')).map(th => th.textContent?.trim() ?? '');
        t.querySelectorAll('tbody tr, tfoot tr').forEach(tr => Array.from(tr.children).forEach((td, i) => {
          const r = cab[i] ?? '';
          if (td.getAttribute('data-label') !== r) td.setAttribute('data-label', r);
        }));
      });
      // Regiões rolagem horizontal precisam ser alcançáveis pelo teclado (WCAG 2.1.1)
      document.querySelectorAll<HTMLElement>('.table-wrap').forEach(w => {
        if (!w.hasAttribute('tabindex')) { w.setAttribute('tabindex', '0'); w.setAttribute('role', 'region'); w.setAttribute('aria-label', 'Tabela (use as setas para rolar)'); }
      });
    };
    aplicar();
    const mo = new MutationObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(aplicar); });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { mo.disconnect(); cancelAnimationFrame(raf); };
  }, []);
}

export default function Layout() {
  const { sessao, sair, modo } = useAuth();
  const { registros, carregando, agora, atualizacaoPendente, erroAtualizacao, recarregar } = useDados();
  const [copiado, setCopiado] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  useRotulosDeTabela();
  useEffect(() => setAberto(false), [loc.pathname]);
  useEffect(() => (aberto ? travarRolagem() : undefined), [aberto]);
  if (!sessao) return null;

  const papel = sessao.papel;
  const visiveis = ITENS.filter(i => i.papeis.includes(papel));
  const atalhos = ATALHOS[papel].map(to => visiveis.find(i => i.to === to)).filter((i): i is Item => !!i);
  const atual = visiveis.find(i => i.to === loc.pathname);
  const pendentes = registros.filter(r => r.status_aprovacao === 'pendente').length;
  const dataExtenso = new Date(agora.iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Fortaleza' });
  const inicio = papel === 'admin' ? '/painel' : '/painel/gerencia';

  return (
    <div className="shell">
      <a className="skip" href="#conteudo" onClick={e => { e.preventDefault(); document.getElementById('conteudo')?.focus(); }}>Pular para o conteúdo</a>
      <header className="mobilebar">
        <button onClick={() => setAberto(true)} aria-label="Abrir menu"><Menu size={22} /></button>
        <span className="titulo">{atual?.rotulo ?? 'Almeida Advocacia'}</span>
        {pendentes > 0 && <NavLink to={papel === 'admin' ? '/painel/ponto' : '/painel/gerencia'} className="chip alert" style={{ marginRight: 6 }}>{pendentes} pendente(s)</NavLink>}
      </header>
      <div className={`scrim ${aberto ? 'on' : ''}`} onClick={() => setAberto(false)} aria-hidden="true" />

      <aside className={`side ${aberto ? 'open' : ''}`} aria-label="Menu principal">
        <div className="row between" style={{ flexWrap: 'nowrap' }}>
          <NavLink to={inicio} className="side-brand" onClick={() => setAberto(false)}><img src={marcaOuro} alt="Almeida Advocacia & Consultoria" /></NavLink>
          <button className="icon-btn menu-x" style={{ color: '#fff', display: aberto ? 'grid' : 'none' }} onClick={() => setAberto(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <nav className="nav">
          {visiveis.map(i => (
            <span key={i.to} style={{ display: 'contents' }}>
              {i.grupo && <div className="nav-group">{i.grupo}</div>}
              <NavLink to={i.to} end={i.fim} className={({ isActive }) => (isActive ? 'on' : '')}>
                <i.icone size={18} strokeWidth={1.7} />{i.rotulo}
                {i.pend && pendentes > 0 && <span className="pill">{pendentes}</span>}
              </NavLink>
            </span>
          ))}
          <div className="nav-group">Acesso</div>
          <NavLink to="/"><Smartphone size={18} strokeWidth={1.7} />Tela de ponto</NavLink>
        </nav>
        <div className="side-ap"><span>Aparência</span><Aparencia /></div>
        <div className="side-foot">
          <span className="avatar">{iniciais(sessao.nome)}</span>
          <div style={{ minWidth: 0 }}>
            <div className="who">{sessao.nome}</div>
            <div className="papel">{papel === 'admin' ? 'Administrador master' : 'Gerência'}</div>
          </div>
          <button className="icon-btn" aria-label="Sair" title="Sair" onClick={async () => { await sair(); nav('/entrar'); }}><LogOut size={18} /></button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar-desk">
          <span className="data">{dataExtenso}</span>
          <div className="row" style={{ gap: 10 }}>
            {pendentes > 0 && <NavLink to={papel === 'admin' ? '/painel/ponto' : '/painel/gerencia'} className="chip alert">{pendentes} aprovação(ões) pendente(s)</NavLink>}
            <span className="chip">{papel === 'admin' ? 'Administrador master' : 'Gerência'}</span>
          </div>
        </div>
        <main className="content" id="conteudo" tabIndex={-1}>
          <div className="cab-impressao so-impressao"><img src={logoHorizontal} alt="" /><div className="t"><strong>{atual?.rotulo ?? 'Almeida Advocacia'}</strong>Impresso em {dataExtenso}<br />por {sessao.nome}</div></div>
          {modo === 'local' && <div className="demo-banner" style={{ marginBottom: 20 }}><strong>Modo demonstração</strong> · dados fictícios, salvos só neste navegador.</div>}
          {papel === 'admin' && atualizacaoPendente && modo === 'supabase' && (
            <div className="demo-banner" style={{ marginBottom: 20 }}>
              <strong>Atualização do banco pendente.</strong> O Supabase ainda não tem as tabelas novas (ajuste de dias, diária fixa) nem a correção do PIN.
              <ol style={{ margin: '8px 0 10px 18px', padding: 0 }}>
                <li>Clique em <em>Copiar SQL</em>.</li>
                <li>No Supabase, abra <strong>SQL Editor → New query</strong>, cole e clique em <strong>Run</strong>.</li>
                <li>Volte aqui e clique em <em>Verificar novamente</em>.</li>
              </ol>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(sqlAtualizacao); setCopiado(true); setTimeout(() => setCopiado(false), 3000); } catch { window.prompt('Copie o SQL (Ctrl+C):', sqlAtualizacao); } }}>{copiado ? 'SQL copiado ✓' : 'Copiar SQL'}</button>
                <button className="btn ghost sm" disabled={verificando} onClick={async () => { setVerificando(true); try { await recarregar(); } finally { setVerificando(false); } }}>{verificando ? 'Verificando…' : 'Verificar novamente'}</button>
                <a className="btn ghost sm" href="/diagnostico">Diagnóstico</a>
              </div>
              {erroAtualizacao && <p className="muted" style={{ margin: '8px 0 0', fontSize: '.8rem' }}>Resposta do banco: {erroAtualizacao}</p>}
            </div>
          )}
          {carregando ? <PaginaEsqueleto /> : <Outlet />}
          <div className="rodape-impressao so-impressao">Almeida Advocacia &amp; Consultoria · documento gerencial de conferência. Autenticidade: use o QR Code dos PDFs oficiais.</div>
        </main>
      </div>

      <nav className="bottomnav" aria-label="Atalhos">
        {atalhos.map(i => (
          <NavLink key={i.to} to={i.to} end={i.fim} className={({ isActive }) => (isActive ? 'on' : '')}>
            <i.icone size={21} strokeWidth={1.7} />{i.curto ?? i.rotulo}
            {i.pend && pendentes > 0 && <span className="badge-n">{pendentes}</span>}
          </NavLink>
        ))}
        <button onClick={() => setAberto(true)} aria-label="Abrir menu completo"><Menu size={21} strokeWidth={1.7} />Menu</button>
      </nav>
    </div>
  );
}
