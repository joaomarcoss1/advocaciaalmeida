import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '@/components/ui';

interface Item { rotulo: string; ok: boolean | null; detalhe: string }
const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function jwt(key: string | undefined): { role?: string; ref?: string } {
  try { return JSON.parse(atob((key ?? '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return {}; }
}
async function chamar(caminho: string, init?: RequestInit) {
  const r = await fetch(`${URL_}${caminho}`, { ...init, headers: { apikey: KEY!, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const texto = await r.text();
  let corpo: unknown = texto; try { corpo = JSON.parse(texto); } catch { /* texto puro */ }
  return { status: r.status, corpo };
}

/** Página de diagnóstico: mostra a causa real quando o login ou o banco falham. Não exibe nem guarda segredos. */
export default function Diagnostico() {
  const [itens, setItens] = useState<Item[]>([]);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [rodando, setRodando] = useState(false);

  async function rodar() {
    setRodando(true);
    const out: Item[] = [];
    const add = (rotulo: string, ok: boolean | null, detalhe: string) => { out.push({ rotulo, ok, detalhe }); setItens([...out]); };
    try {
      if (!URL_ || !KEY) { add('Configuração do site', false, 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não estão definidas neste deploy: o site está em modo demonstração.'); return; }
      const c = jwt(KEY);
      const hostRef = new URL(URL_).hostname.split('.')[0];
      add('URL do projeto', true, URL_);
      add('Chave anon', c.role === 'anon' && c.ref === hostRef, `papel=${c.role ?? '?'} · projeto=${c.ref ?? '?'} ${c.role === 'service_role' ? '· ATENÇÃO: é a chave service_role, troque pela anon' : c.ref !== hostRef ? '· a chave é de OUTRO projeto' : ''}`);
      try { const h = await chamar('/auth/v1/health'); add('Serviço de login (Auth)', h.status === 200, `HTTP ${h.status} ${JSON.stringify(h.corpo).slice(0, 120)}`); }
      catch (e) { add('Serviço de login (Auth)', false, `Sem resposta: ${(e as Error).message}`); }
      const ctx = await chamar('/rest/v1/rpc/ponto_contexto', { method: 'POST', body: '{}' });
      add('Tabelas e funções do banco', ctx.status === 200, ctx.status === 200 ? 'ponto_contexto respondeu (schema aplicado).' : `HTTP ${ctx.status} ${JSON.stringify(ctx.corpo).slice(0, 160)}`);
      const lista = await chamar('/rest/v1/rpc/ponto_lista_ativos', { method: 'POST', body: '{}' });
      add('Funcionários com PIN', lista.status === 200, lista.status === 200 ? `${(lista.corpo as unknown[]).length} pessoa(s) com PIN definido` : `HTTP ${lista.status} ${JSON.stringify(lista.corpo).slice(0, 160)}`);
      if (email && senha) {
        const t = await chamar('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: email.trim(), password: senha }) });
        const corpo = t.corpo as { access_token?: string; msg?: string; error_description?: string; error_code?: string; message?: string };
        if (t.status === 200 && corpo.access_token) {
          add('Login no Supabase Auth', true, 'Usuário e senha corretos.');
          const p = await chamar(`/rest/v1/perfis?select=nome,email,papel,ativo&email=eq.${encodeURIComponent(email.trim().toLowerCase())}`, { headers: { Authorization: `Bearer ${corpo.access_token}` } });
          const linhas = Array.isArray(p.corpo) ? p.corpo as { papel: string; ativo: boolean }[] : [];
          add('Perfil de acesso (tabela perfis)', linhas.length > 0 && linhas[0].ativo, linhas.length ? `papel=${linhas[0].papel} · ativo=${linhas[0].ativo}` : `Sem perfil para este usuário (HTTP ${p.status}). Rode o SQL que cria o perfil de administrador.`);
        } else {
          add('Login no Supabase Auth', false, `HTTP ${t.status} · ${corpo.error_code ?? ''} · ${corpo.msg ?? corpo.error_description ?? corpo.message ?? JSON.stringify(t.corpo).slice(0, 160)}`);
        }
      } else add('Teste de login', null, 'Preencha e-mail e senha abaixo para testar o login.');
    } catch (e) { add('Erro inesperado', false, (e as Error).message); }
    finally { setRodando(false); }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px 60px' }}>
      <span className="eyebrow">Diagnóstico</span>
      <h1 className="page-title">Conexão com o banco</h1>
      <p className="page-sub">Mostra por que o login ou o registro de ponto não funcionam. A senha digitada aqui só é enviada ao Supabase, não é guardada.</p>
      <div className="card card-pad stack" style={{ marginTop: 20 }}>
        <div className="grid c2">
          <Field label="E-mail (opcional)"><input className="input" type="email" autoCapitalize="none" value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Senha (opcional)"><input className="input" type="password" autoComplete="off" value={senha} onChange={e => setSenha(e.target.value)} /></Field>
        </div>
        <button className="btn" onClick={rodar} disabled={rodando}>{rodando ? 'Verificando…' : 'Rodar diagnóstico'}</button>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        {itens.map(i => (
          <div key={i.rotulo} className="sum-line" style={{ padding: '14px 20px', alignItems: 'flex-start' }}>
            <span><strong>{i.rotulo}</strong><br /><span className="muted" style={{ fontSize: '.88rem', wordBreak: 'break-word' }}>{i.detalhe}</span></span>
            <span className={`badge ${i.ok === null ? 'mute' : i.ok ? 'ok' : 'bad'}`}>{i.ok === null ? '—' : i.ok ? 'OK' : 'Falhou'}</span>
          </div>
        ))}
        {!itens.length && <div className="empty">Clique em “Rodar diagnóstico”.</div>}
      </div>
      <p style={{ marginTop: 18 }}><Link to="/entrar" className="auth-link">← Voltar ao login</Link></p>
    </div>
  );
}
