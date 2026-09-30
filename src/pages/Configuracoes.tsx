import { useEffect, useState } from 'react';
import { Crosshair, Download, Eye, EyeOff, KeyRound, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { Abas, Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { mesclarConfig } from '@/lib/config';
import { isoParaBR, fmtData } from '@/lib/datetime';
import type { Auditoria, Config, Papel, Usuario } from '@/lib/types';

type Aba = 'escritorio' | 'ponto' | 'folha' | 'acessos' | 'auditoria' | 'dados';

export default function Configuracoes() {
  const { db, config, usuarios, recarregar, auditar } = useDados();
  const { sessao } = useAuth();
  const toast = useToast();
  const confirmar = useConfirm();
  const [aba, setAba] = useState<Aba>('escritorio');
  const [c, setC] = useState<Config>(config);
  const [novo, setNovo] = useState<{ nome: string; email: string; papel: Papel; senha: string } | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [senhaDe, setSenhaDe] = useState<{ u: Usuario; senha: string } | null>(null);
  const [logs, setLogs] = useState<Auditoria[]>([]);
  useEffect(() => setC(config), [config]);
  useEffect(() => { if (aba === 'auditoria') db.auditoria.list().then(l => setLogs(l.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80))); }, [aba, db]);

  async function salvar() {
    try { await db.config.save(mesclarConfig(c)); await auditar('Configurações alteradas', aba); toast.ok('Configurações salvas.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')) || 0);
  function minhaLocalizacao() {
    navigator.geolocation?.getCurrentPosition(
      p => setC({ ...c, ponto: { ...c.ponto, geofence_lat: Number(p.coords.latitude.toFixed(6)), geofence_lng: Number(p.coords.longitude.toFixed(6)) } }),
      () => toast.erro('Não foi possível obter a localização. Verifique a permissão do navegador.'), { enableHighAccuracy: true, timeout: 12000 });
  }
  const gerarSenha = () => {
    const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    return Array.from(crypto.getRandomValues(new Uint32Array(12))).map(n => alfa[n % alfa.length]).join('');
  };
  async function criarUsuario() {
    if (!novo) return;
    try {
      await db.acessos.criar({ nome: novo.nome, email: novo.email, papel: novo.papel, senha: novo.senha });
      await auditar('Acesso criado', `${novo.email} (${novo.papel})`);
      toast.ok(`Acesso criado para ${novo.email}.`); setNovo(null); setVerSenha(false); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function salvarAcesso(u: Usuario, mudanca: Partial<Pick<Usuario, 'papel' | 'ativo'>>) {
    try {
      await db.acessos.atualizar(u.id, { nome: u.nome, papel: mudanca.papel ?? u.papel, ativo: mudanca.ativo ?? u.ativo });
      await auditar('Acesso alterado', `${u.email}: ${JSON.stringify(mudanca)}`); await recarregar();
      toast.ok('Acesso atualizado.');
    } catch (e) { toast.erro((e as Error).message); await recarregar(); }
  }
  async function redefinir() {
    if (!senhaDe) return;
    try { await db.acessos.redefinirSenha(senhaDe.u.id, senhaDe.senha); await auditar('Senha redefinida', senhaDe.u.email); toast.ok('Senha redefinida.'); setSenhaDe(null); setVerSenha(false); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function excluirUsuario(u: Usuario) {
    if (!(await confirmar(`Remover definitivamente o acesso de ${u.email}?`, { perigo: true, rotulo: 'Remover' }))) return;
    try { await db.acessos.remover(u.id); await auditar('Acesso removido', u.email); toast.ok('Acesso removido.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function backup() {
    const dump: Record<string, unknown> = {};
    for (const k of ['cargos', 'escalas', 'funcionarios', 'registros', 'ocorrencias', 'feriados', 'ajustes', 'folhas'] as const) dump[k] = await db[k].list();
    dump.config = await db.config.get();
    const semPin = JSON.parse(JSON.stringify(dump, (k, v) => (k === 'pin_hash' ? undefined : v)));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(semPin, null, 2)], { type: 'application/json' }));
    a.download = `backup-almeida-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function restaurarDemo() {
    if (!(await confirmar('Apagar TODOS os dados deste navegador e voltar aos dados de demonstração?', { perigo: true, rotulo: 'Apagar e restaurar' }))) return;
    Object.keys(localStorage).filter(k => k.startsWith('almeida.v1.')).forEach(k => localStorage.removeItem(k));
    location.href = '/entrar';
  }

  const salvarBtn = <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}><button className="btn" onClick={salvar}>Salvar alterações</button></div>;

  return (
    <>
      <PageHeader titulo="Configurações" sub="Dados do escritório, regras de ponto e folha, acessos ao painel." />
      <div className="card">
        <div style={{ padding: '0 12px' }}>
          <Abas valor={aba} onChange={setAba} itens={[{ id: 'escritorio', rotulo: 'Escritório' }, { id: 'ponto', rotulo: 'Ponto' }, { id: 'folha', rotulo: 'Folha' }, { id: 'acessos', rotulo: 'Acessos' }, { id: 'auditoria', rotulo: 'Auditoria' }, { id: 'dados', rotulo: 'Dados' }]} />
        </div>
        <div className="card-pad stack">
          {aba === 'escritorio' && (<>
            <div className="grid c2">
              <Field label="Nome"><input className="input" value={c.escritorio.nome} onChange={e => setC({ ...c, escritorio: { ...c.escritorio, nome: e.target.value } })} /></Field>
              <Field label="CNPJ"><input className="input" value={c.escritorio.cnpj} onChange={e => setC({ ...c, escritorio: { ...c.escritorio, cnpj: e.target.value } })} /></Field>
              <Field label="Endereço"><input className="input" value={c.escritorio.endereco} onChange={e => setC({ ...c, escritorio: { ...c.escritorio, endereco: e.target.value } })} /></Field>
              <Field label="Cidade / UF"><input className="input" value={c.escritorio.cidade} onChange={e => setC({ ...c, escritorio: { ...c.escritorio, cidade: e.target.value } })} /></Field>
              <Field label="Telefone"><input className="input" value={c.escritorio.telefone} onChange={e => setC({ ...c, escritorio: { ...c.escritorio, telefone: e.target.value } })} /></Field>
              <Field label="E-mail"><input className="input" value={c.escritorio.email} onChange={e => setC({ ...c, escritorio: { ...c.escritorio, email: e.target.value } })} /></Field>
              <Field label="Registro da sociedade na OAB"><input className="input" value={c.escritorio.oab_sociedade} onChange={e => setC({ ...c, escritorio: { ...c.escritorio, oab_sociedade: e.target.value } })} /></Field>
            </div>{salvarBtn}</>)}

          {aba === 'ponto' && (<>
            <div className="grid c2">
              <Field label="Tolerância (min)" dica="Diferença até este valor conta como “no horário”."><input className="input" inputMode="numeric" value={c.ponto.tolerancia_min} onChange={e => setC({ ...c, ponto: { ...c.ponto, tolerancia_min: num(e.target.value) } })} /></Field>
              <Field label="Atraso / saída antecipada a partir de (min)" dica="Exige justificativa e é contado como ocorrência."><input className="input" inputMode="numeric" value={c.ponto.limite_atraso_min} onChange={e => setC({ ...c, ponto: { ...c.ponto, limite_atraso_min: num(e.target.value) } })} /></Field>
            </div>
            <label className="check"><input type="checkbox" checked={c.ponto.geofence_ativo} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_ativo: e.target.checked } })} />Exigir localização (GPS) dentro do raio do escritório para bater o ponto</label>
            <div className="grid c3">
              <Field label="Latitude"><input className="input" inputMode="decimal" value={c.ponto.geofence_lat} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_lat: num(e.target.value) } })} /></Field>
              <Field label="Longitude"><input className="input" inputMode="decimal" value={c.ponto.geofence_lng} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_lng: num(e.target.value) } })} /></Field>
              <Field label="Raio (metros)"><input className="input" inputMode="numeric" value={c.ponto.geofence_raio_m} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_raio_m: num(e.target.value) } })} /></Field>
            </div>
            <div><button className="btn ghost sm" onClick={minhaLocalizacao}><Crosshair size={16} />Usar minha localização atual</button>
              <p className="hint" style={{ marginTop: 6 }}>Abra esta tela no computador ou celular que está dentro do escritório e clique no botão. O padrão é o centro de Codó — ajuste antes de ativar.</p></div>
            {salvarBtn}</>)}

          {aba === 'folha' && (<>
            <Field label="Periodicidade do pagamento">
              <select className="select" style={{ maxWidth: 280 }} value={c.folha.periodicidade} onChange={e => setC({ ...c, folha: { ...c.folha, periodicidade: e.target.value as 'mensal' | 'quinzenal' } })}>
                <option value="mensal">Mensal</option><option value="quinzenal">Quinzenal (1ª e 2ª quinzena)</option>
              </select>
            </Field>
            <Field label="Adicional de hora extra (%)" dica="Usado para sugerir o valor ao lançar horas extras. Para advogado empregado, confira o contrato e a convenção coletiva (art. 20 do Estatuto da OAB)."><input className="input" style={{ maxWidth: 200 }} inputMode="numeric" value={c.folha.hora_extra_pct} onChange={e => setC({ ...c, folha: { ...c.folha, hora_extra_pct: num(e.target.value) } })} /></Field>
            <label className="check"><input type="checkbox" checked={c.folha.descontar_atrasos} onChange={e => setC({ ...c, folha: { ...c.folha, descontar_atrasos: e.target.checked } })} />Descontar atrasos e saídas antecipadas proporcionalmente aos minutos</label>
            <p className="hint">Regra fixa: diária = salário mensal ÷ dias de trabalho previstos na escala no mês (feriados fora). Falta = 1 diária descontada. Ausência com abono remunerado não desconta.</p>
            {salvarBtn}</>)}

          {aba === 'acessos' && (<>
            <div className="row between">
              <p className="muted" style={{ maxWidth: '60ch' }}>Quem pode entrar no painel. <strong>Administrador</strong> tem acesso total, inclusive a salários, folha e a esta tela. <strong>Gerência</strong> acompanha ponto, escalas e ocorrências, sem salários.</p>
              <button className="btn" onClick={() => { setNovo({ nome: '', email: '', papel: 'admin', senha: '' }); setVerSenha(false); }}>Novo acesso</button>
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              <div className="table-wrap"><table className="tbl">
                <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th /></tr></thead>
                <tbody>{usuarios.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.nome}</strong>{u.id === sessao?.id && <> <Badge tom="gold">você</Badge></>}</td>
                    <td className="muted">{u.email}</td>
                    <td>
                      <select className="select" style={{ minHeight: 38, maxWidth: 170 }} value={u.papel} aria-label={`Papel de ${u.nome}`} onChange={e => salvarAcesso(u, { papel: e.target.value as Papel })}>
                        <option value="admin">Administrador</option><option value="gerente">Gerência</option>
                      </select>
                    </td>
                    <td><button className={`btn sm ${u.ativo ? 'ghost' : ''}`} onClick={() => salvarAcesso(u, { ativo: !u.ativo })}>{u.ativo ? 'Ativo' : 'Inativo'}</button></td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <button className="icon-btn" title="Redefinir senha" aria-label={`Redefinir senha de ${u.email}`} onClick={() => { setSenhaDe({ u, senha: '' }); setVerSenha(false); }}><KeyRound size={18} /></button>
                      <button className="icon-btn" title="Remover" aria-label={`Remover ${u.email}`} onClick={() => excluirUsuario(u)}><Trash2 size={18} /></button>
                    </td>
                  </tr>
                ))}</tbody>
              </table>{!usuarios.length && <Vazio>Nenhum acesso cadastrado.</Vazio>}</div>
            </div></>)}

          {aba === 'auditoria' && (
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead>
              <tbody>{logs.map(l => <tr key={l.id}><td className="mono">{fmtData(isoParaBR(l.created_at).data)} {isoParaBR(l.created_at).hhmm}</td><td>{l.usuario}</td><td><strong>{l.acao}</strong></td><td className="muted">{l.detalhe}</td></tr>)}</tbody>
            </table>{!logs.length && <Vazio>Nenhuma ação registrada ainda.</Vazio>}</div>)}

          {aba === 'dados' && (<>
            <div className="row"><button className="btn ghost" onClick={backup}><Download size={17} />Baixar backup (JSON)</button>
              {db.modo === 'local' && <button className="btn danger ghost" onClick={restaurarDemo}><RotateCcw size={17} />Restaurar dados de demonstração</button>}</div>
            <p className="hint">Modo de dados: <strong>{db.modo === 'local' ? 'demonstração (navegador)' : 'Supabase'}</strong>. O backup não inclui PINs.</p></>)}
        </div>
      </div>

      {novo && (
        <Modal titulo="Novo acesso ao painel" onClose={() => setNovo(null)} rodape={<><button className="btn ghost" onClick={() => setNovo(null)}>Cancelar</button><button className="btn" onClick={criarUsuario}>Criar acesso</button></>}>
          <div className="stack">
            <Field label="Nome"><input className="input" value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} autoFocus /></Field>
            <Field label="E-mail (será o login)"><input className="input" type="email" inputMode="email" autoCapitalize="none" value={novo.email} onChange={e => setNovo({ ...novo, email: e.target.value })} /></Field>
            <div className="field">
              <label>Papel</label>
              <label className={`role-opt ${novo.papel === 'admin' ? 'on' : ''}`}><input type="radio" name="papel" checked={novo.papel === 'admin'} onChange={() => setNovo({ ...novo, papel: 'admin' })} /><span><strong>Administrador</strong><br /><span className="muted">Acesso total: salários, folha, configurações e gestão de acessos.</span></span></label>
              <label className={`role-opt ${novo.papel === 'gerente' ? 'on' : ''}`}><input type="radio" name="papel" checked={novo.papel === 'gerente'} onChange={() => setNovo({ ...novo, papel: 'gerente' })} /><span><strong>Gerência</strong><br /><span className="muted">Aprova ponto, registra ocorrências e vê escalas. Não vê salários nem folha.</span></span></label>
            </div>
            <Field label="Senha inicial (mín. 8 caracteres)" dica="Combine letras e números. Anote e repasse com segurança; o usuário pode pedir a troca depois.">
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <input className="input" type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={novo.senha} onChange={e => setNovo({ ...novo, senha: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(v => !v)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                <button type="button" className="icon-btn" aria-label="Gerar senha forte" title="Gerar senha forte" onClick={() => { setNovo({ ...novo, senha: gerarSenha() }); setVerSenha(true); }}><Wand2 size={18} /></button>
              </div>
            </Field>
          </div>
        </Modal>
      )}

      {senhaDe && (
        <Modal titulo="Redefinir senha" onClose={() => setSenhaDe(null)} rodape={<><button className="btn ghost" onClick={() => setSenhaDe(null)}>Cancelar</button><button className="btn" disabled={senhaDe.senha.length < 8} onClick={redefinir}>Salvar nova senha</button></>}>
          <div className="stack">
            <p>Usuário: <strong>{senhaDe.u.nome}</strong> <span className="muted">· {senhaDe.u.email}</span></p>
            <Field label="Nova senha (mín. 8 caracteres)">
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <input className="input" type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={senhaDe.senha} onChange={e => setSenhaDe({ ...senhaDe, senha: e.target.value })} autoFocus />
                <button type="button" className="icon-btn" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(v => !v)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                <button type="button" className="icon-btn" aria-label="Gerar senha forte" title="Gerar senha forte" onClick={() => { setSenhaDe({ ...senhaDe, senha: gerarSenha() }); setVerSenha(true); }}><Wand2 size={18} /></button>
              </div>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
