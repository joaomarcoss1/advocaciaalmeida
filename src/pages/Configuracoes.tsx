import { useEffect, useState } from 'react';
import { Crosshair, Download, RotateCcw, Trash2 } from 'lucide-react';
import { Abas, Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { mesclarConfig } from '@/lib/config';
import { isoParaBR, fmtData } from '@/lib/datetime';
import type { Auditoria, Config, Papel, Usuario } from '@/lib/types';

type Aba = 'escritorio' | 'ponto' | 'folha' | 'acessos' | 'auditoria' | 'dados';

export default function Configuracoes() {
  const { db, config, usuarios, recarregar, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [aba, setAba] = useState<Aba>('escritorio');
  const [c, setC] = useState<Config>(config);
  const [novo, setNovo] = useState<{ nome: string; email: string; papel: Papel; senha: string } | null>(null);
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
  async function criarUsuario() {
    if (!novo) return;
    if (!novo.nome.trim() || !novo.email.trim()) return toast.erro('Informe nome e e-mail.');
    try { await db.usuarios.insert({ nome: novo.nome.trim(), email: novo.email, papel: novo.papel, senha: novo.senha } as Partial<Usuario>); await auditar('Acesso criado', `${novo.email} (${novo.papel})`); toast.ok('Acesso criado.'); setNovo(null); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function alternar(u: Usuario) { await db.usuarios.update(u.id, { ativo: !u.ativo }); await auditar(u.ativo ? 'Acesso desativado' : 'Acesso reativado', u.email); await recarregar(); }
  async function excluirUsuario(u: Usuario) {
    if (usuarios.filter(x => x.papel === 'admin' && x.ativo).length <= 1 && u.papel === 'admin') return toast.erro('Mantenha pelo menos um administrador ativo.');
    if (!(await confirmar(`Remover o acesso de ${u.email}?`, { perigo: true, rotulo: 'Remover' }))) return;
    await db.usuarios.remove(u.id); await auditar('Acesso removido', u.email); await recarregar();
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
            <div className="row between"><p className="muted">Quem pode entrar no painel. <strong>Administrador</strong> vê tudo; <strong>Gerência</strong> acompanha ponto, escalas e ocorrências, sem acesso a salários e folha.</p>
              {db.modo === 'local' && <button className="btn gold" onClick={() => setNovo({ nome: '', email: '', papel: 'gerente', senha: '' })}>Novo acesso</button>}</div>
            {db.modo === 'supabase' && <div className="demo-banner">Para criar um acesso: cadastre o usuário em <strong>Authentication → Users</strong> no Supabase e insira o papel na tabela <code>perfis</code> (passo a passo no README). Aqui você pode ativar, desativar e remover.</div>}
            <div className="table-wrap"><table className="tbl">
              <thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th /></tr></thead>
              <tbody>{usuarios.map(u => (
                <tr key={u.id}><td><strong>{u.nome}</strong></td><td>{u.email}</td><td><Badge tom={u.papel === 'admin' ? 'gold' : ''}>{u.papel === 'admin' ? 'Administrador' : 'Gerência'}</Badge></td>
                  <td><Badge tom={u.ativo ? 'ok' : 'mute'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                  <td className="right"><button className="btn ghost sm" onClick={() => alternar(u)}>{u.ativo ? 'Desativar' : 'Reativar'}</button>{' '}
                    <button className="icon-btn" aria-label={`Remover ${u.email}`} onClick={() => excluirUsuario(u)}><Trash2 size={17} /></button></td></tr>
              ))}</tbody>
            </table>{!usuarios.length && <Vazio>Nenhum acesso cadastrado.</Vazio>}</div></>)}

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
            <Field label="E-mail"><input className="input" type="email" value={novo.email} onChange={e => setNovo({ ...novo, email: e.target.value })} /></Field>
            <Field label="Papel"><select className="select" value={novo.papel} onChange={e => setNovo({ ...novo, papel: e.target.value as Papel })}><option value="gerente">Gerência</option><option value="admin">Administrador</option></select></Field>
            <Field label="Senha (mín. 6 caracteres)"><input className="input" type="password" autoComplete="new-password" value={novo.senha} onChange={e => setNovo({ ...novo, senha: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
