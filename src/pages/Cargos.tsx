import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { CATEGORIA_LABEL, type CategoriaCargo, type Cargo } from '@/lib/types';

const vazio = (): Partial<Cargo> => ({ nome: '', categoria: 'administrativo', descricao: '', ativo: true });

export default function Cargos() {
  const { db, cargos, funcionarios, recarregar, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [ed, setEd] = useState<Partial<Cargo> | null>(null);

  async function salvar() {
    if (!ed?.nome?.trim()) return toast.erro('Informe o nome do cargo.');
    try {
      const dados = { nome: ed.nome.trim(), categoria: ed.categoria as CategoriaCargo, descricao: ed.descricao?.trim() || null, ativo: ed.ativo ?? true };
      if (ed.id) await db.cargos.update(ed.id, dados); else await db.cargos.insert(dados);
      await auditar(ed.id ? 'Cargo editado' : 'Cargo criado', dados.nome);
      toast.ok('Cargo salvo.'); setEd(null); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function excluir(c: Cargo) {
    if (funcionarios.some(f => f.cargo_id === c.id)) return toast.erro('Há funcionários neste cargo. Desative-o em vez de excluir.');
    if (!(await confirmar(`Excluir o cargo "${c.nome}"?`, { perigo: true, rotulo: 'Excluir' }))) return;
    await db.cargos.remove(c.id); await auditar('Cargo excluído', c.nome); await recarregar();
  }

  return (
    <>
      <PageHeader titulo="Cargos" sub="Funções da equipe. Cargos da categoria Gerência aparecem como responsáveis pela aprovação de ponto.">
        <button className="btn gold" onClick={() => setEd(vazio())}><Plus size={18} />Novo cargo</button>
      </PageHeader>
      <div className="card table-wrap">
        <table className="tbl">
          <thead><tr><th>Cargo</th><th>Categoria</th><th>Descrição</th><th className="num">Pessoas</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {cargos.map(c => (
              <tr key={c.id}>
                <td><strong>{c.nome}</strong></td>
                <td><Badge tom={c.categoria === 'gerencia' ? 'gold' : ''}>{CATEGORIA_LABEL[c.categoria]}</Badge></td>
                <td className="muted">{c.descricao}</td>
                <td className="num">{funcionarios.filter(f => f.cargo_id === c.id && f.ativo).length}</td>
                <td><Badge tom={c.ativo ? 'ok' : 'mute'}>{c.ativo ? 'Ativo' : 'Inativo'}</Badge></td>
                <td className="right" style={{ whiteSpace: 'nowrap' }}>
                  <button className="icon-btn" aria-label={`Editar ${c.nome}`} onClick={() => setEd(c)}><Pencil size={17} /></button>
                  <button className="icon-btn" aria-label={`Excluir ${c.nome}`} onClick={() => excluir(c)}><Trash2 size={17} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargos.length && <Vazio tipo="cargos" titulo="Nenhum cargo ainda">Cargos organizam a equipe e definem a função de cada pessoa.</Vazio>}
      </div>
      {ed && (
        <Modal titulo={ed.id ? 'Editar cargo' : 'Novo cargo'} onClose={() => setEd(null)}
          rodape={<><button className="btn ghost" onClick={() => setEd(null)}>Cancelar</button><button className="btn" onClick={salvar}>Salvar</button></>}>
          <div className="stack">
            <Field label="Nome do cargo"><input className="input" value={ed.nome ?? ''} onChange={e => setEd({ ...ed, nome: e.target.value })} autoFocus /></Field>
            <Field label="Categoria">
              <select className="select" value={ed.categoria} onChange={e => setEd({ ...ed, categoria: e.target.value as CategoriaCargo })}>
                {(Object.keys(CATEGORIA_LABEL) as CategoriaCargo[]).map(k => <option key={k} value={k}>{CATEGORIA_LABEL[k]}</option>)}
              </select>
            </Field>
            <Field label="Descrição"><textarea className="textarea" value={ed.descricao ?? ''} onChange={e => setEd({ ...ed, descricao: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={ed.ativo ?? true} onChange={e => setEd({ ...ed, ativo: e.target.checked })} />Cargo ativo</label>
          </div>
        </Modal>
      )}
    </>
  );
}
