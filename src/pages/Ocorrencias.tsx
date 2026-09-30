import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData } from '@/lib/datetime';
import { OCORRENCIA_LABEL, type Ocorrencia, type TipoOcorrencia } from '@/lib/types';

export type FormOcorrencia = Partial<Ocorrencia>;

export function ModalOcorrencia({ inicial, onClose }: { inicial: FormOcorrencia; onClose(): void }) {
  const { db, funcionarios, recarregar, auditar } = useDados();
  const toast = useToast();
  const [f, setF] = useState<FormOcorrencia>(inicial);
  async function salvar() {
    if (!f.funcionario_id) return toast.erro('Escolha o funcionário.');
    if (!f.data_inicio || !f.data_fim) return toast.erro('Informe o período.');
    if (f.data_fim < f.data_inicio) return toast.erro('A data final não pode ser anterior à inicial.');
    try {
      const dados = { funcionario_id: f.funcionario_id, data_inicio: f.data_inicio, data_fim: f.data_fim, tipo: f.tipo as TipoOcorrencia, remunerado: f.remunerado ?? true, observacao: f.observacao?.trim() || null };
      if (f.id) await db.ocorrencias.update(f.id, dados); else await db.ocorrencias.insert(dados);
      await auditar(f.id ? 'Ocorrência editada' : 'Ocorrência registrada', `${funcionarios.find(x => x.id === f.funcionario_id)?.nome} · ${OCORRENCIA_LABEL[dados.tipo]} · ${fmtData(dados.data_inicio)}`);
      toast.ok('Ocorrência salva.'); onClose(); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  return (
    <Modal titulo={f.id ? 'Editar ocorrência' : 'Nova ocorrência / abono'} onClose={onClose}
      rodape={<><button className="btn ghost" onClick={onClose}>Cancelar</button><button className="btn" onClick={salvar}>Salvar</button></>}>
      <div className="stack">
        <Field label="Funcionário">
          <select className="select" value={f.funcionario_id ?? ''} onChange={e => setF({ ...f, funcionario_id: e.target.value })}>
            <option value="">Selecione…</option>{funcionarios.filter(x => x.ativo || x.id === f.funcionario_id).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select className="select" value={f.tipo} onChange={e => {
            const tipo = e.target.value as TipoOcorrencia;
            setF({ ...f, tipo, remunerado: tipo !== 'licenca' ? true : f.remunerado });
          }}>
            {(Object.keys(OCORRENCIA_LABEL) as TipoOcorrencia[]).map(t => <option key={t} value={t}>{OCORRENCIA_LABEL[t]}</option>)}
          </select>
        </Field>
        <div className="grid c2">
          <Field label="De"><input className="input" type="date" value={f.data_inicio ?? ''} onChange={e => setF({ ...f, data_inicio: e.target.value, data_fim: f.data_fim && f.data_fim >= e.target.value ? f.data_fim : e.target.value })} /></Field>
          <Field label="Até"><input className="input" type="date" min={f.data_inicio} value={f.data_fim ?? ''} onChange={e => setF({ ...f, data_fim: e.target.value })} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.remunerado ?? true} onChange={e => setF({ ...f, remunerado: e.target.checked })} />Dia(s) remunerado(s) — não desconta da folha</label>
        {f.remunerado === false && <p className="hint">Sem remuneração: cada dia útil do período será descontado como falta (1 diária).</p>}
        <Field label="Observação"><textarea className="textarea" value={f.observacao ?? ''} onChange={e => setF({ ...f, observacao: e.target.value })} placeholder="Ex.: CID informado ao RH, número do processo da audiência…" /></Field>
      </div>
    </Modal>
  );
}

export default function Ocorrencias() {
  const { db, ocorrencias, funcionarios, agora, recarregar, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [ed, setEd] = useState<FormOcorrencia | null>(null);
  const [filtro, setFiltro] = useState('');
  const nome = (id: string) => funcionarios.find(f => f.id === id)?.nome ?? '—';
  const lista = useMemo(() => [...ocorrencias].filter(o => !filtro || o.funcionario_id === filtro).sort((a, b) => b.data_inicio.localeCompare(a.data_inicio)), [ocorrencias, filtro]);

  async function excluir(o: Ocorrencia) {
    if (!(await confirmar(`Excluir a ocorrência de ${nome(o.funcionario_id)}? Os dias voltarão a contar como falta se não houver ponto.`, { perigo: true, rotulo: 'Excluir' }))) return;
    try { await db.ocorrencias.remove(o.id); await auditar('Ocorrência excluída', nome(o.funcionario_id)); await recarregar(); } catch (e) { toast.erro((e as Error).message); }
  }

  return (
    <>
      <PageHeader titulo="Ocorrências e abonos" sub="Atestados, audiências externas, férias e folgas: dias justificados não geram desconto.">
        <button className="btn gold" onClick={() => setEd({ tipo: 'atestado', remunerado: true, data_inicio: agora.data, data_fim: agora.data })}><Plus size={18} />Nova ocorrência</button>
      </PageHeader>
      <div className="card">
        <div className="card-head">
          <select className="select" style={{ maxWidth: 320 }} value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar por funcionário">
            <option value="">Todos os funcionários</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <span className="muted">{lista.length} registro(s)</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Funcionário</th><th>Tipo</th><th>Período</th><th>Folha</th><th>Observação</th><th /></tr></thead>
            <tbody>
              {lista.map(o => (
                <tr key={o.id}>
                  <td><strong>{nome(o.funcionario_id)}</strong></td>
                  <td>{OCORRENCIA_LABEL[o.tipo]}</td>
                  <td className="mono">{fmtData(o.data_inicio)}{o.data_fim !== o.data_inicio && ` → ${fmtData(o.data_fim)}`}</td>
                  <td>{o.remunerado ? <Badge tom="ok">Sem desconto</Badge> : <Badge tom="bad">Descontado</Badge>}</td>
                  <td className="muted">{o.observacao}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" aria-label="Editar" onClick={() => setEd(o)}><Pencil size={17} /></button>
                    <button className="icon-btn" aria-label="Excluir" onClick={() => excluir(o)}><Trash2 size={17} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lista.length && <Vazio tipo="documento" titulo="Nenhuma ocorrência">Atestados, audiências externas, férias e outras ausências aparecem aqui.</Vazio>}
        </div>
      </div>
      {ed && <ModalOcorrencia inicial={ed} onClose={() => setEd(null)} />}
    </>
  );
}
