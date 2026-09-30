import { useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { Abas, Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { brParaIso, fmtData, hhmmParaMin, isoParaBR, primeiroDoMes } from '@/lib/datetime';
import { minParaHoras } from '@/lib/format';
import { previstoDoTipo, turnoDaData } from '@/lib/ponto';
import { STATUS_MARCACAO } from '@/lib/rotulos';
import { TIPO_MARCACAO_LABEL, type RegistroPonto, type TipoMarcacao } from '@/lib/types';

export function TabelaAprovacoes() {
  const { db, registros, funcionarios, recarregar, auditar } = useDados();
  const toast = useToast();
  const [rejeitar, setRejeitar] = useState<RegistroPonto | null>(null);
  const [motivo, setMotivo] = useState('');
  const pend = registros.filter(r => r.status_aprovacao === 'pendente').sort((a, b) => a.data.localeCompare(b.data));
  const nome = (id: string) => funcionarios.find(f => f.id === id)?.nome ?? '—';

  async function aprovar(r: RegistroPonto) {
    try { await db.aprovarPonto(r.id, 'aprovar'); await auditar('Ponto aprovado', `${nome(r.funcionario_id)} · ${fmtData(r.data)} · ${TIPO_MARCACAO_LABEL[r.tipo]}`); toast.ok('Ajuste aprovado.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function confirmarRejeicao() {
    if (!rejeitar) return;
    try {
      await db.aprovarPonto(rejeitar.id, 'rejeitar', motivo);
      await auditar('Ponto rejeitado', `${nome(rejeitar.funcionario_id)} · ${fmtData(rejeitar.data)} · ${motivo}`);
      toast.ok('Ajuste rejeitado.'); setRejeitar(null); setMotivo(''); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <>
      {pend.length ? (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Funcionário</th><th>Data</th><th>Marcação</th><th>Horário informado</th><th>Justificativa</th><th /></tr></thead>
            <tbody>
              {pend.map(r => (
                <tr key={r.id}>
                  <td><strong>{nome(r.funcionario_id)}</strong></td>
                  <td className="mono">{fmtData(r.data)}</td>
                  <td>{TIPO_MARCACAO_LABEL[r.tipo]}<div className="muted" style={{ fontSize: '.82rem' }}>previsto {r.horario_previsto ?? '—'}</div></td>
                  <td className="mono"><strong>{isoParaBR(r.horario_real).hhmm}</strong></td>
                  <td style={{ maxWidth: 320 }}>{r.justificativa}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => aprovar(r)}><Check size={16} />Aprovar</button>{' '}
                    <button className="btn sm danger ghost" onClick={() => { setRejeitar(r); setMotivo(''); }}><X size={16} />Rejeitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Vazio>Nenhum ajuste de ponto aguardando aprovação.</Vazio>}
      {rejeitar && (
        <Modal titulo="Rejeitar ajuste" onClose={() => setRejeitar(null)}
          rodape={<><button className="btn ghost" onClick={() => setRejeitar(null)}>Cancelar</button><button className="btn danger" disabled={motivo.trim().length < 3} onClick={confirmarRejeicao}>Rejeitar</button></>}>
          <div className="stack">
            <p><strong>{nome(rejeitar.funcionario_id)}</strong> · {fmtData(rejeitar.data)} · {TIPO_MARCACAO_LABEL[rejeitar.tipo]}</p>
            <Field label="Motivo da rejeição" dica="O funcionário verá este motivo na tela de ponto."><textarea className="textarea" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

export default function Registros() {
  const { sessao } = useAuth();
  const { db, registros, funcionarios, escalas, agora, config, recarregar, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const admin = sessao?.papel === 'admin';
  const [aba, setAba] = useState<'registros' | 'aprovacoes'>('registros');
  const [ini, setIni] = useState(primeiroDoMes(agora.data));
  const [fim, setFim] = useState(agora.data);
  const [fid, setFid] = useState('');
  const [somenteProblemas, setSomenteProblemas] = useState(false);
  const [manual, setManual] = useState<{ funcionario_id: string; data: string; tipo: TipoMarcacao; hora: string; justificativa: string } | null>(null);

  const nome = (id: string) => funcionarios.find(f => f.id === id)?.nome ?? '—';
  const pendentes = registros.filter(r => r.status_aprovacao === 'pendente').length;
  const lista = useMemo(() => registros
    .filter(r => r.data >= ini && r.data <= fim && (!fid || r.funcionario_id === fid))
    .filter(r => !somenteProblemas || r.status === 'atraso' || r.status === 'saida_antecipada' || r.status_aprovacao !== 'aprovado')
    .sort((a, b) => b.horario_real.localeCompare(a.horario_real)), [registros, ini, fim, fid, somenteProblemas]);

  async function lancar() {
    if (!manual) return;
    if (!manual.funcionario_id || !manual.data || !manual.hora) return toast.erro('Preencha funcionário, data e horário.');
    if (manual.justificativa.trim().length < 5) return toast.erro('Explique o motivo do lançamento manual (mín. 5 caracteres).');
    const f = funcionarios.find(x => x.id === manual.funcionario_id);
    if (registros.some(r => r.funcionario_id === manual.funcionario_id && r.data === manual.data && r.tipo === manual.tipo && r.status_aprovacao !== 'rejeitado'))
      return toast.erro('Já existe essa marcação para o funcionário nesta data.');
    const previsto = previstoDoTipo(turnoDaData(escalas.find(e => e.id === f?.escala_id), manual.data), manual.tipo);
    try {
      await db.registros.insert({
        funcionario_id: manual.funcionario_id, data: manual.data, tipo: manual.tipo, horario_previsto: previsto, horario_real: brParaIso(manual.data, manual.hora),
        diferenca_minutos: previsto ? hhmmParaMin(manual.hora) - hhmmParaMin(previsto) : 0, status: 'manual', justificativa: `[Lançado por ${sessao?.nome}] ${manual.justificativa.trim()}`,
        latitude: null, longitude: null, status_aprovacao: 'aprovado', retroativo: true, motivo_rejeicao: null, aprovado_por: sessao?.id ?? null, aprovado_em: new Date().toISOString(),
      });
      await auditar('Ponto lançado manualmente', `${f?.nome} · ${fmtData(manual.data)} · ${TIPO_MARCACAO_LABEL[manual.tipo]} ${manual.hora}`);
      toast.ok('Marcação lançada.'); setManual(null); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }

  async function remover(r: RegistroPonto) {
    if (!(await confirmar(`Excluir a marcação de ${nome(r.funcionario_id)} em ${fmtData(r.data)}? Isso pode gerar falta na folha.`, { perigo: true, rotulo: 'Excluir' }))) return;
    await db.registros.remove(r.id); await auditar('Ponto excluído', `${nome(r.funcionario_id)} · ${fmtData(r.data)} · ${TIPO_MARCACAO_LABEL[r.tipo]}`); await recarregar();
  }

  return (
    <>
      <PageHeader titulo="Registros de ponto" sub={`Tolerância de ${config.ponto.tolerancia_min} min · atraso a partir de ${config.ponto.limite_atraso_min} min`}>
        <button className="btn gold" onClick={() => setManual({ funcionario_id: '', data: agora.data, tipo: 'entrada', hora: '', justificativa: '' })}><Plus size={18} />Lançar marcação</button>
      </PageHeader>
      <div className="card">
        <div style={{ padding: '0 12px' }}>
          <Abas valor={aba} onChange={setAba} itens={[{ id: 'registros', rotulo: 'Registros' }, { id: 'aprovacoes', rotulo: 'Aprovações', contagem: pendentes }]} />
        </div>
        {aba === 'aprovacoes' ? <TabelaAprovacoes /> : (
          <>
            <div className="card-head">
              <div className="row">
                <Field label="De"><input className="input" type="date" value={ini} onChange={e => setIni(e.target.value)} /></Field>
                <Field label="Até"><input className="input" type="date" value={fim} onChange={e => setFim(e.target.value)} /></Field>
                <Field label="Funcionário">
                  <select className="select" value={fid} onChange={e => setFid(e.target.value)}><option value="">Todos</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select>
                </Field>
              </div>
              <label className="check"><input type="checkbox" checked={somenteProblemas} onChange={e => setSomenteProblemas(e.target.checked)} />Só atrasos e pendências</label>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Data</th><th>Funcionário</th><th>Marcação</th><th>Previsto</th><th>Real</th><th>Diferença</th><th>Situação</th><th>Justificativa</th>{admin && <th />}</tr></thead>
                <tbody>
                  {lista.slice(0, 400).map(r => {
                    const st = STATUS_MARCACAO[r.status];
                    return (
                      <tr key={r.id}>
                        <td className="mono">{fmtData(r.data)}</td>
                        <td><strong>{nome(r.funcionario_id)}</strong></td>
                        <td>{TIPO_MARCACAO_LABEL[r.tipo]}</td>
                        <td className="mono">{r.horario_previsto ?? '—'}</td>
                        <td className="mono"><strong>{isoParaBR(r.horario_real).hhmm}</strong></td>
                        <td className="mono">{r.diferenca_minutos ? `${r.diferenca_minutos > 0 ? '+' : '−'}${minParaHoras(r.diferenca_minutos)}` : '—'}</td>
                        <td>
                          {r.status_aprovacao === 'pendente' ? <Badge tom="warn">Aguardando aprovação</Badge>
                            : r.status_aprovacao === 'rejeitado' ? <Badge tom="bad">Rejeitado</Badge> : <Badge tom={st.tom}>{st.rotulo}</Badge>}
                          {r.retroativo && r.status_aprovacao === 'aprovado' && r.status !== 'manual' && <> <Badge tom="gold">Ajuste</Badge></>}
                        </td>
                        <td style={{ maxWidth: 280 }} className="muted">{r.motivo_rejeicao ? `Rejeitado: ${r.motivo_rejeicao}` : r.justificativa}</td>
                        {admin && <td className="right"><button className="icon-btn" aria-label="Excluir marcação" onClick={() => remover(r)}><Trash2 size={17} /></button></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!lista.length && <Vazio>Nenhum registro no filtro selecionado.</Vazio>}
              {lista.length > 400 && <p className="hint center" style={{ padding: 10 }}>Mostrando 400 de {lista.length}. Refine o período.</p>}
            </div>
          </>
        )}
      </div>

      {manual && (
        <Modal titulo="Lançar marcação manualmente" onClose={() => setManual(null)}
          rodape={<><button className="btn ghost" onClick={() => setManual(null)}>Cancelar</button><button className="btn" onClick={lancar}>Lançar</button></>}>
          <div className="stack">
            <p className="hint">Use quando o funcionário não pôde bater o ponto. A marcação entra aprovada, sem contar como atraso, e fica registrada na auditoria.</p>
            <Field label="Funcionário">
              <select className="select" value={manual.funcionario_id} onChange={e => setManual({ ...manual, funcionario_id: e.target.value })}>
                <option value="">Selecione…</option>{funcionarios.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
            <div className="grid c3">
              <Field label="Data"><input className="input" type="date" max={agora.data} value={manual.data} onChange={e => setManual({ ...manual, data: e.target.value })} /></Field>
              <Field label="Marcação"><select className="select" value={manual.tipo} onChange={e => setManual({ ...manual, tipo: e.target.value as TipoMarcacao })}>{(Object.keys(TIPO_MARCACAO_LABEL) as TipoMarcacao[]).map(t => <option key={t} value={t}>{TIPO_MARCACAO_LABEL[t]}</option>)}</select></Field>
              <Field label="Horário"><input className="input" type="time" value={manual.hora} onChange={e => setManual({ ...manual, hora: e.target.value })} /></Field>
            </div>
            <Field label="Motivo"><textarea className="textarea" value={manual.justificativa} onChange={e => setManual({ ...manual, justificativa: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
