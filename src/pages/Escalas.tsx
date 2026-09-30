import { useState } from 'react';
import { Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { ESCALAS_MODELO, escalaVazia, turnoVazio } from '@/lib/config';
import { DIA_CURTO, DIA_LABEL, DIAS_ESCALA, type Escala, type TurnoDia } from '@/lib/types';
import { horasSemanais, minutosJornada, temIntervalo } from '@/lib/ponto';
import { num } from '@/lib/format';

function resumo(e: Escala) {
  const ativos = DIAS_ESCALA.filter(d => e.dias[d]?.ativo);
  return ativos.length ? ativos.map(d => DIA_CURTO[d]).join(' · ') : 'Nenhum dia ativo';
}

export default function Escalas() {
  const { sessao } = useAuth();
  const { db, escalas, funcionarios, recarregar, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const somenteLeitura = sessao?.papel !== 'admin';
  const [ed, setEd] = useState<(Partial<Escala> & { dias: Escala['dias'] }) | null>(null);

  function setDia(d: number, patch: Partial<TurnoDia>) {
    if (!ed) return;
    setEd({ ...ed, dias: { ...ed.dias, [d]: { ...(ed.dias[d] ?? turnoVazio()), ...patch } } });
  }
  async function salvar() {
    if (!ed?.nome?.trim()) return toast.erro('Dê um nome à escala.');
    for (const d of DIAS_ESCALA) {
      const t = ed.dias[d];
      if (!t?.ativo) continue;
      if (!t.entrada || !t.saida) return toast.erro(`${DIA_LABEL[d]}: informe entrada e saída.`);
      if (t.entrada >= t.saida) return toast.erro(`${DIA_LABEL[d]}: a saída deve ser depois da entrada.`);
      if (!!t.saida_intervalo !== !!t.retorno_intervalo) return toast.erro(`${DIA_LABEL[d]}: preencha os dois horários do intervalo ou deixe ambos vazios.`);
      if (t.saida_intervalo && !(t.entrada < t.saida_intervalo && t.saida_intervalo < t.retorno_intervalo && t.retorno_intervalo < t.saida)) return toast.erro(`${DIA_LABEL[d]}: horários fora de ordem.`);
    }
    if (!DIAS_ESCALA.some(d => ed.dias[d]?.ativo)) return toast.erro('Ative pelo menos um dia de trabalho.');
    try {
      const dados = { nome: ed.nome.trim(), dias: ed.dias, ativo: ed.ativo ?? true };
      if (ed.id) await db.escalas.update(ed.id, dados); else await db.escalas.insert(dados);
      await auditar(ed.id ? 'Escala editada' : 'Escala criada', dados.nome);
      toast.ok('Escala salva.'); setEd(null); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function excluir(e: Escala) {
    if (funcionarios.some(f => f.escala_id === e.id)) return toast.erro('Há funcionários usando esta escala. Troque a escala deles antes de excluir.');
    if (!(await confirmar(`Excluir a escala "${e.nome}"?`, { perigo: true, rotulo: 'Excluir' }))) return;
    await db.escalas.remove(e.id); await auditar('Escala excluída', e.nome); await recarregar();
  }

  return (
    <>
      <PageHeader titulo="Escalas" sub="Expediente de segunda a sábado. A escala define os dias previstos, a diária e o que conta como falta.">
        {!somenteLeitura && <button className="btn gold" onClick={() => setEd({ ...escalaVazia() })}><Plus size={18} />Nova escala</button>}
      </PageHeader>
      <div className="grid c2">
        {escalas.map(e => (
          <div className="card card-pad stack" key={e.id}>
            <div className="row between">
              <div><h3 style={{ fontSize: '1.1rem' }}>{e.nome}</h3><div className="muted">{resumo(e)}</div></div>
              <Badge tom={e.ativo ? 'ok' : 'mute'}>{e.ativo ? 'Ativa' : 'Inativa'}</Badge>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Dia</th><th>Entrada</th><th>Intervalo</th><th>Saída</th><th className="num">Horas</th></tr></thead>
                <tbody>
                  {DIAS_ESCALA.map(d => {
                    const t = e.dias[d];
                    return t?.ativo ? (
                      <tr key={d}><td>{DIA_CURTO[d]}</td><td className="mono">{t.entrada}</td>
                        <td className="mono">{temIntervalo(t) ? `${t.saida_intervalo}–${t.retorno_intervalo}` : '—'}</td><td className="mono">{t.saida}</td>
                        <td className="num">{num(minutosJornada(t) / 60, 1)}h</td></tr>
                    ) : <tr key={d}><td>{DIA_CURTO[d]}</td><td colSpan={4} className="muted">Folga</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <div className="row between">
              <span className="muted">{num(horasSemanais(e), 1)}h por semana · {funcionarios.filter(f => f.escala_id === e.id && f.ativo).length} pessoa(s)</span>
              {!somenteLeitura && (
                <span>
                  <button className="icon-btn" aria-label="Duplicar" onClick={() => setEd({ nome: `${e.nome} (cópia)`, ativo: true, dias: JSON.parse(JSON.stringify(e.dias)) })}><Copy size={17} /></button>
                  <button className="icon-btn" aria-label="Editar" onClick={() => setEd({ ...e, dias: JSON.parse(JSON.stringify(e.dias)) })}><Pencil size={17} /></button>
                  <button className="icon-btn" aria-label="Excluir" onClick={() => excluir(e)}><Trash2 size={17} /></button>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {!escalas.length && <div className="card"><Vazio>Nenhuma escala cadastrada.</Vazio></div>}

      {ed && (
        <Modal largo titulo={ed.id ? 'Editar escala' : 'Nova escala'} onClose={() => setEd(null)}
          rodape={<><button className="btn ghost" onClick={() => setEd(null)}>Cancelar</button><button className="btn" onClick={salvar}>Salvar escala</button></>}>
          <div className="stack">
            <div className="grid c2">
              <Field label="Nome da escala"><input className="input" value={ed.nome ?? ''} onChange={e => setEd({ ...ed, nome: e.target.value })} autoFocus /></Field>
              <Field label="Começar de um modelo">
                <select className="select" value="" onChange={e => { const m = ESCALAS_MODELO[Number(e.target.value)]; if (m) setEd({ ...ed, dias: JSON.parse(JSON.stringify(m.dias)), nome: ed.nome || m.nome }); }}>
                  <option value="">Escolher…</option>
                  {ESCALAS_MODELO.map((m, i) => <option key={i} value={i}>{m.nome}</option>)}
                </select>
              </Field>
            </div>
            <div className="escala-grid">
              <div className="escala-row head"><span>Dia</span><span>Entrada</span><span>Saída p/ intervalo</span><span>Retorno</span><span>Saída</span></div>
              {DIAS_ESCALA.map(d => {
                const t = ed.dias[d] ?? turnoVazio();
                return (
                  <div className="escala-row" key={d}>
                    <label className="check"><input type="checkbox" checked={t.ativo} onChange={e => setDia(d, e.target.checked ? { ativo: true, entrada: t.entrada || '08:00', saida: t.saida || '18:00' } : { ativo: false })} /><strong>{DIA_LABEL[d]}</strong></label>
                    {([['entrada', 'Entrada'], ['saida_intervalo', 'Saída p/ intervalo'], ['retorno_intervalo', 'Retorno'], ['saida', 'Saída']] as const).map(([k, rot]) => (
                      <label key={k} className="tm"><span>{rot}</span>
                        <input className="input" type="time" disabled={!t.ativo} aria-label={`${DIA_LABEL[d]} ${rot}`} value={t[k]} onChange={e => setDia(d, { [k]: e.target.value })} /></label>
                    ))}
                  </div>
                );
              })}
            </div>
            <p className="hint">Deixe o intervalo em branco para jornada contínua (ex.: sábado de manhã). Domingo não faz parte da escala.</p>
            <label className="check"><input type="checkbox" checked={ed.ativo ?? true} onChange={e => setEd({ ...ed, ativo: e.target.checked })} />Escala ativa</label>
          </div>
        </Modal>
      )}
    </>
  );
}
