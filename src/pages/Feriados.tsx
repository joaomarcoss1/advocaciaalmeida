import { useMemo, useState } from 'react';
import { CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useAuth } from '@/context/Auth';
import { useDados } from '@/context/Dados';
import { DIA_LABEL } from '@/lib/types';
import { diaSemana, fmtData } from '@/lib/datetime';
import { feriadosPadrao, sugestoesMunicipais } from '@/lib/feriados';
import { FERIADO_LABEL, type Feriado, type TipoFeriado } from '@/lib/types';

export default function Feriados() {
  const { sessao } = useAuth();
  const { db, feriados, agora, recarregar, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const admin = sessao?.papel === 'admin';
  const [ano, setAno] = useState(Number(agora.data.slice(0, 4)));
  const [ed, setEd] = useState<Partial<Feriado> | null>(null);

  const doAno = useMemo(() => feriados.filter(f => f.data.startsWith(String(ano))).sort((a, b) => a.data.localeCompare(b.data)), [feriados, ano]);
  const faltamPadrao = feriadosPadrao(ano).filter(p => !feriados.some(f => f.data === p.data));
  const municipais = sugestoesMunicipais(ano).filter(p => !feriados.some(f => f.data === p.data));

  async function importar() {
    for (const p of faltamPadrao) await db.feriados.insert(p);
    await auditar('Feriados importados', String(ano)); toast.ok(`${faltamPadrao.length} feriado(s) adicionados.`); await recarregar();
  }
  async function salvar() {
    if (!ed?.data || !ed.nome?.trim()) return toast.erro('Informe a data e o nome.');
    if (feriados.some(f => f.data === ed.data && f.id !== ed.id)) return toast.erro('Já existe um feriado nesta data.');
    try {
      const dadosFeriado = { data: ed.data, nome: ed.nome.trim(), tipo: (ed.tipo ?? 'municipal') as TipoFeriado };
      if (ed.id) await db.feriados.update(ed.id, dadosFeriado); else await db.feriados.insert(dadosFeriado);
      await auditar(ed.id ? 'Feriado editado' : 'Feriado criado', `${ed.nome} ${fmtData(ed.data)}`); setEd(null); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function excluir(f: Feriado) {
    if (!(await confirmar(`Remover "${f.nome}"? O dia voltará a ser dia de trabalho para as escalas que o incluem.`, { perigo: true, rotulo: 'Remover' }))) return;
    await db.feriados.remove(f.id); await auditar('Feriado removido', f.nome); await recarregar();
  }

  return (
    <>
      <PageHeader titulo="Feriados e recessos" sub="Dias sem expediente: não contam como falta e não entram no divisor da diária.">
        <select className="select" style={{ width: 110 }} value={ano} onChange={e => setAno(Number(e.target.value))} aria-label="Ano">
          {[ano - 1, ano, ano + 1].filter((v, i, a) => a.indexOf(v) === i).map(a => <option key={a}>{a}</option>)}
        </select>
        {admin && <button className="btn gold" onClick={() => setEd({ tipo: 'municipal', data: `${ano}-01-01` })}><Plus size={18} />Novo</button>}
      </PageHeader>

      {admin && faltamPadrao.length > 0 && (
        <div className="card card-pad row between" style={{ marginBottom: 14, background: 'var(--gold-tint)' }}>
          <div><strong>{faltamPadrao.length} feriado(s) de {ano} ainda não cadastrados</strong><div className="muted">Nacionais, pontos facultativos e a data estadual do Maranhão (28/07).</div></div>
          <button className="btn" onClick={importar}><CalendarPlus size={18} />Importar feriados de {ano}</button>
        </div>
      )}
      {admin && municipais.map(m => (
        <div className="card card-pad row between" key={m.data} style={{ marginBottom: 14 }}>
          <div><strong>Sugestão local: {m.nome} ({fmtData(m.data)})</strong><div className="muted">{m.aviso}</div></div>
          <button className="btn ghost" onClick={() => setEd({ data: m.data, nome: m.nome, tipo: 'municipal' })}>Revisar e adicionar</button>
        </div>
      ))}

      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>Data</th><th>Dia</th><th>Feriado</th><th>Tipo</th><th /></tr></thead>
          <tbody>
            {doAno.map(f => (
              <tr key={f.id}>
                <td className="mono">{fmtData(f.data)}</td><td>{DIA_LABEL[diaSemana(f.data)]}</td><td><strong>{f.nome}</strong></td>
                <td><Badge tom={f.tipo === 'nacional' ? '' : f.tipo === 'municipal' ? 'gold' : 'mute'}>{FERIADO_LABEL[f.tipo]}</Badge></td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}>{admin && <><button className="icon-btn" aria-label={`Editar ${f.nome}`} onClick={() => setEd(f)}><Pencil size={17} /></button><button className="icon-btn" aria-label={`Remover ${f.nome}`} onClick={() => excluir(f)}><Trash2 size={17} /></button></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!doAno.length && <Vazio>Nenhum feriado cadastrado em {ano}.</Vazio>}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>Pontos facultativos (Carnaval, Corpus Christi) só valem se o escritório fechar: remova os que não forem adotados. O recesso forense (20/12 a 20/01) suspende prazos, mas não fecha o escritório automaticamente — cadastre aqui os dias em que não haverá expediente.</p>

      {ed && (
        <Modal titulo={ed.id ? "Editar feriado / recesso" : "Novo feriado / recesso"} onClose={() => setEd(null)} rodape={<><button className="btn ghost" onClick={() => setEd(null)}>Cancelar</button><button className="btn" onClick={salvar}>Salvar</button></>}>
          <div className="stack">
            <Field label="Data"><input className="input" type="date" value={ed.data ?? ''} onChange={e => setEd({ ...ed, data: e.target.value })} /></Field>
            <Field label="Nome"><input className="input" value={ed.nome ?? ''} onChange={e => setEd({ ...ed, nome: e.target.value })} autoFocus /></Field>
            <Field label="Tipo">
              <select className="select" value={ed.tipo} onChange={e => setEd({ ...ed, tipo: e.target.value as TipoFeriado })}>
                {(Object.keys(FERIADO_LABEL) as TipoFeriado[]).map(t => <option key={t} value={t}>{FERIADO_LABEL[t]}</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
