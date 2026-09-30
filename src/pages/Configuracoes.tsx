import { Fragment, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, Crosshair, ExternalLink, LocateFixed, Download, Eye, EyeOff, KeyRound, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { Abas, Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { mesclarConfig } from '@/lib/config';
import { isoParaBR, fmtData } from '@/lib/datetime';
import { fmtDistancia, lerPosicao, linkMapa, type Posicao } from '@/lib/geo';
import { distanciaMetros } from '@/lib/ponto';
import { forcaSenha, gerarSenha, validarSenha } from '@/lib/seguranca';
import type { Auditoria, Config, Papel, Usuario } from '@/lib/types';

type Aba = 'escritorio' | 'ponto' | 'folha' | 'acessos' | 'seguranca' | 'auditoria' | 'dados';

const FORCA = ['Muito fraca', 'Fraca', 'Razoável', 'Boa', 'Forte'];
function Medidor({ senha }: { senha: string }) {
  if (!senha) return null;
  const f = validarSenha(senha) ? Math.min(forcaSenha(senha), 1) : forcaSenha(senha);
  return (
    <div className="medidor" role="status" aria-label={`Força da senha: ${FORCA[f]}`}>
      <span className="barras">{[1, 2, 3, 4].map(n => <i key={n} className={n <= f ? `on f${f}` : ''} />)}</span>
      <span className="hint">{validarSenha(senha) || FORCA[f]}</span>
    </div>
  );
}

function SegurancaConta() {
  const { db, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [est, setEst] = useState<{ ativo: boolean; fatores: { id: string; nome: string; criado: string }[] } | null>(null);
  const [cad, setCad] = useState<{ fatorId: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const carregar = () => db.auth.mfa.estado().then(setEst).catch(e => toast.erro((e as Error).message));
  useEffect(() => { if (db.auth.mfa.disponivel) carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!db.auth.mfa.disponivel) return <div className="notice gold">A verificação em duas etapas usa o Supabase Auth e não existe no modo demonstração.</div>;

  async function iniciar() {
    setOcupado(true);
    try { setCad(await db.auth.mfa.iniciar()); setCodigo(''); } catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function confirmarCad() {
    if (!cad) return;
    setOcupado(true);
    try { await db.auth.mfa.confirmar(cad.fatorId, codigo); await auditar('2FA ativado', 'Verificação em duas etapas ativada'); toast.ok('Verificação em duas etapas ativada.'); setCad(null); await carregar(); }
    catch (e) { toast.erro((e as Error).message); } finally { setOcupado(false); }
  }
  async function desativar(id: string) {
    if (!(await confirmar('Desativar a verificação em duas etapas? Sua conta voltará a depender só da senha.', { perigo: true, rotulo: 'Desativar' }))) return;
    try { await db.auth.mfa.remover(id); await auditar('2FA desativado', 'Verificação em duas etapas removida'); toast.ok('Verificação em duas etapas desativada.'); await carregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <div>
        <div className="section-title"><ShieldCheck size={15} style={{ verticalAlign: 'middle' }} /> Verificação em duas etapas (sua conta)</div>
        <p className="hint" style={{ marginTop: 6 }}>Além da senha, o login exige um código de 6 números gerado no celular (Google Authenticator, Microsoft Authenticator, Authy…). Com ela ativa, quem descobrir sua senha não consegue entrar nem ler dados pela API.</p>
      </div>
      {!est ? <p className="muted">Carregando…</p> : est.ativo && !cad ? (
        <>
          <div className="notice ok" role="status"><strong>Ativada.</strong> Sua conta está protegida por senha + código.</div>
          {est.fatores.map(f => (
            <div key={f.id} className="row between card card-pad" style={{ boxShadow: 'none' }}>
              <span><strong>{f.nome}</strong><br /><span className="muted" style={{ fontSize: '.85rem' }}>Cadastrado em {new Date(f.criado).toLocaleDateString('pt-BR')}</span></span>
              <button className="btn ghost danger sm" onClick={() => desativar(f.id)}>Desativar</button>
            </div>
          ))}
          <p className="hint">Perdeu o celular? Outro administrador master pode remover o autenticador da sua conta no Supabase (Authentication → Users), e você entra só com a senha para cadastrar de novo.</p>
        </>
      ) : cad ? (
        <div className="card card-pad stack" style={{ boxShadow: 'none' }}>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Abra o aplicativo autenticador e escolha <em>Adicionar conta</em>.</li>
            <li>Leia o QR Code abaixo (ou digite a chave manualmente).</li>
            <li>Digite o código de 6 números que o aplicativo mostrar.</li>
          </ol>
          <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <img src={cad.qr} alt="QR Code para cadastrar o autenticador" width={168} height={168} style={{ background: '#fff', padding: 8, borderRadius: 10, border: '1px solid var(--line)' }} />
            <div><div className="section-title">Chave manual</div><code style={{ wordBreak: 'break-all', fontSize: '.9rem' }}>{cad.segredo}</code></div>
          </div>
          <Field label="Código de 6 números">
            <input className="input" style={{ maxWidth: 200, letterSpacing: '.3em', textAlign: 'center', fontSize: '1.2rem' }} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <div className="row"><button className="btn" disabled={ocupado || codigo.length !== 6} onClick={confirmarCad}>Confirmar e ativar</button><button className="btn ghost" onClick={() => setCad(null)}>Cancelar</button></div>
        </div>
      ) : (
        <>
          <div className="notice gold" role="status"><strong>Desativada.</strong> Recomendado para todos os administradores.</div>
          <div><button className="btn" disabled={ocupado} onClick={iniciar}>Ativar verificação em duas etapas</button></div>
        </>
      )}
    </div>
  );
}

export default function Configuracoes() {
  const { db, config, usuarios, recarregar, auditar } = useDados();
  const { sessao } = useAuth();
  const toast = useToast();
  const confirmar = useConfirm();
  const [params] = useSearchParams();
  const abaInicial = params.get('aba');
  const [aba, setAba] = useState<Aba>(['escritorio', 'ponto', 'folha', 'acessos', 'seguranca', 'auditoria', 'dados'].includes(abaInicial ?? '') ? (abaInicial as Aba) : 'escritorio');
  const [c, setC] = useState<Config>(config);
  const [novo, setNovo] = useState<{ nome: string; email: string; papel: Papel; senha: string } | null>(null);
  const [verSenha, setVerSenha] = useState(false);
  const [senhaDe, setSenhaDe] = useState<{ u: Usuario; senha: string } | null>(null);
  const [logs, setLogs] = useState<Auditoria[]>([]);
  useEffect(() => setC(config), [config]);
  useEffect(() => { if (aba === 'auditoria') db.auditoria.list().then(l => setLogs(l.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 400))); }, [aba, db]);
  const [filtroLog, setFiltroLog] = useState('');
  const [logAberto, setLogAberto] = useState<string | null>(null);
  const logsVisiveis = logs.filter(l => !filtroLog.trim() || `${l.usuario} ${l.acao} ${l.detalhe}`.toLowerCase().includes(filtroLog.trim().toLowerCase()));

  async function salvar() {
    try { await db.config.save(mesclarConfig(c)); await auditar('Configurações alteradas', aba); toast.ok('Configurações salvas.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')) || 0);
  const [lendoGps, setLendoGps] = useState(false);
  const [teste, setTeste] = useState<{ dist: number; precisao: number } | null>(null);
  async function posicaoAtual(): Promise<Posicao | null> {
    setLendoGps(true);
    try { return await lerPosicao(); }
    catch (e) { toast.erro((e as { mensagem?: string }).mensagem ?? 'Não foi possível obter a localização.'); return null; }
    finally { setLendoGps(false); }
  }
  /** Redefine o centro da cerca para onde o administrador está agora e salva na hora. */
  async function definirMinhaLocalizacao() {
    const p = await posicaoAtual();
    if (!p) return;
    const lat = Number(p.lat.toFixed(6)), lng = Number(p.lng.toFixed(6));
    const ok = await confirmar(
      `Definir esta localização como o escritório? Novo centro: ${lat}, ${lng} (precisão ±${Math.round(p.precisao)} m). A partir de agora o ponto só poderá ser batido a até ${c.ponto.geofence_raio_m} m daqui.${p.precisao > 150 ? ' Atenção: o sinal de GPS está impreciso; se puder, faça isso ao ar livre ou com o Wi-Fi ligado.' : ''}`,
      { rotulo: 'Definir e salvar' });
    if (!ok) return;
    const novo = mesclarConfig({ ...c, ponto: { ...c.ponto, geofence_ativo: true, geofence_lat: lat, geofence_lng: lng } });
    try {
      await db.config.save(novo);
      await auditar('Localização do escritório redefinida', `${lat}, ${lng} · raio ${novo.ponto.geofence_raio_m} m`);
      setC(novo); setTeste(null); toast.ok('Nova localização do escritório salva.'); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function testarDistancia() {
    const p = await posicaoAtual();
    if (p) setTeste({ dist: distanciaMetros(p.lat, p.lng, c.ponto.geofence_lat, c.ponto.geofence_lng), precisao: p.precisao });
  }
  async function criarUsuario() {
    if (!novo) return;
    const problema = validarSenha(novo.senha);
    if (problema) return toast.erro(problema);
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
          <Abas valor={aba} onChange={setAba} itens={[{ id: 'escritorio', rotulo: 'Escritório' }, { id: 'ponto', rotulo: 'Ponto' }, { id: 'folha', rotulo: 'Folha' }, { id: 'acessos', rotulo: 'Acessos' }, { id: 'seguranca', rotulo: 'Segurança' }, { id: 'auditoria', rotulo: 'Auditoria' }, { id: 'dados', rotulo: 'Dados' }]} />
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
            <div className="card card-pad stack" style={{ boxShadow: 'none', background: 'var(--navy-tint)' }}>
              <label className="check"><input type="checkbox" checked={c.ponto.geofence_ativo} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_ativo: e.target.checked } })} /><strong>Bloquear o ponto fora do escritório (GPS)</strong></label>
              <p className="hint" style={{ margin: 0 }}>O funcionário só consegue registrar o ponto se o aparelho estiver dentro do raio abaixo. A conferência é refeita no servidor a cada registro.</p>
              <Field label="Endereço do escritório (referência)"><input className="input" value={c.ponto.geofence_endereco} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_endereco: e.target.value } })} /></Field>
              <div className="grid c3">
                <Field label="Latitude"><input className="input" inputMode="decimal" value={c.ponto.geofence_lat} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_lat: num(e.target.value) } })} /></Field>
                <Field label="Longitude"><input className="input" inputMode="decimal" value={c.ponto.geofence_lng} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_lng: num(e.target.value) } })} /></Field>
                <Field label="Raio permitido (metros)"><input className="input" inputMode="numeric" value={c.ponto.geofence_raio_m} onChange={e => setC({ ...c, ponto: { ...c.ponto, geofence_raio_m: num(e.target.value) } })} /></Field>
              </div>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" disabled={lendoGps} onClick={definirMinhaLocalizacao}><LocateFixed size={16} />{lendoGps ? 'Obtendo localização…' : 'Usar minha localização'}</button>
                <button className="btn ghost" disabled={lendoGps} onClick={testarDistancia}><Crosshair size={16} />Testar minha distância</button>
                <a className="btn ghost" href={linkMapa(c.ponto.geofence_lat, c.ponto.geofence_lng)} target="_blank" rel="noreferrer"><ExternalLink size={16} />Ver no mapa</a>
              </div>
              {teste && (
                <div className={`notice ${teste.dist <= c.ponto.geofence_raio_m ? 'ok' : 'bad'}`} role="status">
                  Você está a <strong>{fmtDistancia(teste.dist)}</strong> do centro (limite {fmtDistancia(c.ponto.geofence_raio_m)}) — {teste.dist <= c.ponto.geofence_raio_m ? 'dentro da área, o ponto seria permitido.' : 'fora da área, o ponto seria bloqueado.'} Precisão do GPS: ±{Math.round(teste.precisao)} m.
                </div>
              )}
              <p className="hint" style={{ margin: 0 }}><strong>Usar minha localização</strong> define o centro da cerca onde você está agora e salva na hora. Faça isso de dentro do escritório, de preferência com o GPS/Wi-Fi ligado. Alterações de raio, coordenadas ou endereço digitados valem ao clicar em <em>Salvar</em>.</p>
            </div>
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
              <p className="muted" style={{ maxWidth: '60ch' }}>Quem pode entrar no painel. <strong>Administrador master</strong> tem acesso total, inclusive a salários, folha e a esta tela, e pode promover outros usuários a master. <strong>Gerência</strong> acompanha ponto, escalas e ocorrências, sem salários.</p>
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
                        <option value="admin">Administrador master</option><option value="gerente">Gerência</option>
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

          {aba === 'seguranca' && <SegurancaConta />}

          {aba === 'auditoria' && (<>
            <div className="row between" style={{ gap: 12, flexWrap: 'wrap' }}>
              <input className="input" style={{ maxWidth: 340 }} placeholder="Filtrar por pessoa, ação ou texto…" value={filtroLog} onChange={e => setFiltroLog(e.target.value)} aria-label="Filtrar auditoria" />
              <span className="hint">Registro automático e permanente: não pode ser editado nem apagado. Mostrando {logsVisiveis.length} de {logs.length} mais recentes.</span>
            </div>
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th><th /></tr></thead>
              <tbody>{logsVisiveis.map(l => (
                <Fragment key={l.id}>
                  <tr>
                    <td className="mono">{fmtData(isoParaBR(l.created_at).data)} {isoParaBR(l.created_at).hhmm}</td><td>{l.usuario}</td><td><strong>{l.acao}</strong></td><td className="muted">{l.detalhe}</td>
                    <td className="right">{(l.antes || l.depois) && <button className="btn ghost sm" onClick={() => setLogAberto(logAberto === l.id ? null : l.id)} aria-expanded={logAberto === l.id}>{logAberto === l.id ? 'Ocultar' : 'Ver mudança'}</button>}</td>
                  </tr>
                  {logAberto === l.id && (
                    <tr><td colSpan={5}><div className="diff">
                      {Object.keys({ ...(l.antes ?? {}), ...(l.depois ?? {}) }).map(k => (
                        <div key={k}><span className="k">{k}</span>
                          {l.antes && k in l.antes && <span className="de">{String(l.antes[k] ?? '—')}</span>}
                          {l.antes && l.depois && <span className="seta">→</span>}
                          {l.depois && k in l.depois && <span className="para">{String(l.depois[k] ?? '—')}</span>}</div>
                      ))}
                    </div></td></tr>
                  )}
                </Fragment>))}</tbody>
            </table>{!logsVisiveis.length && <Vazio tipo="documento" titulo="Nenhuma ação registrada">As alterações feitas no sistema aparecem aqui automaticamente.</Vazio>}</div></>)}

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
              <label className={`role-opt ${novo.papel === 'admin' ? 'on' : ''}`}><input type="radio" name="papel" checked={novo.papel === 'admin'} onChange={() => setNovo({ ...novo, papel: 'admin' })} /><span><strong>Administrador master</strong><br /><span className="muted">Acesso total: salários, folha, configurações e gestão de acessos (pode criar outros masters).</span></span></label>
              <label className={`role-opt ${novo.papel === 'gerente' ? 'on' : ''}`}><input type="radio" name="papel" checked={novo.papel === 'gerente'} onChange={() => setNovo({ ...novo, papel: 'gerente' })} /><span><strong>Gerência</strong><br /><span className="muted">Aprova ponto, registra ocorrências e vê escalas. Não vê salários nem folha.</span></span></label>
            </div>
            <Field label="Senha inicial (mín. 10 caracteres)" dica="Use letras e números; quanto mais longa, melhor. Anote e repasse com segurança. Com a verificação em duas etapas ativada, a senha sozinha não basta para entrar.">
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <input className="input" type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={novo.senha} onChange={e => setNovo({ ...novo, senha: e.target.value })} />
                <button type="button" className="icon-btn" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(v => !v)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                <button type="button" className="icon-btn" aria-label="Gerar senha forte" title="Gerar senha forte" onClick={() => { setNovo({ ...novo, senha: gerarSenha() }); setVerSenha(true); }}><Wand2 size={18} /></button>
              </div>
              <Medidor senha={novo.senha} />
            </Field>
          </div>
        </Modal>
      )}

      {senhaDe && (
        <Modal titulo="Redefinir senha" onClose={() => setSenhaDe(null)} rodape={<><button className="btn ghost" onClick={() => setSenhaDe(null)}>Cancelar</button><button className="btn" disabled={!!validarSenha(senhaDe.senha)} onClick={redefinir}>Salvar nova senha</button></>}>
          <div className="stack">
            <p>Usuário: <strong>{senhaDe.u.nome}</strong> <span className="muted">· {senhaDe.u.email}</span></p>
            <Field label="Nova senha (mín. 10 caracteres, com letras e números)">
              <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <input className="input" type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={senhaDe.senha} onChange={e => setSenhaDe({ ...senhaDe, senha: e.target.value })} autoFocus />
                <button type="button" className="icon-btn" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(v => !v)}>{verSenha ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                <button type="button" className="icon-btn" aria-label="Gerar senha forte" title="Gerar senha forte" onClick={() => { setSenhaDe({ ...senhaDe, senha: gerarSenha() }); setVerSenha(true); }}><Wand2 size={18} /></button>
              </div>
              <Medidor senha={senhaDe.senha} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
