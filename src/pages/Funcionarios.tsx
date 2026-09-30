import { useMemo, useState } from 'react';
import { KeyRound, Pencil, Plus, Search, Trash2, UserMinus, UserPlus } from 'lucide-react';
import { Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { brl, iniciais, mascaraCpf, mascaraTelefone, semAcento } from '@/lib/format';
import { VINCULO_LABEL, type Funcionario, type Vinculo } from '@/lib/types';
import { fmtData } from '@/lib/datetime';

type Form = Partial<Funcionario> & { salarioTxt?: string };
const vazio = (hoje: string): Form => ({
  nome: '', cpf: '', email: '', telefone: '', cargo_id: null, escala_id: null, vinculo: 'clt', salarioTxt: '', data_admissao: hoje,
  oab: '', pix: '', banco: '', agencia: '', conta: '', tipo_conta: 'Corrente', observacoes: '', ativo: true,
});
const nulo = (v?: string | null) => (v && v.trim() ? v.trim() : null);

export default function Funcionarios() {
  const { db, funcionarios, cargos, escalas, registros, agora, recarregar, auditar } = useDados();
  const toast = useToast();
  const confirmar = useConfirm();
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'ativos' | 'inativos' | 'todos'>('ativos');
  const [ed, setEd] = useState<Form | null>(null);
  const [pinDe, setPinDe] = useState<Funcionario | null>(null);
  const [pin, setPin] = useState('');

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    return funcionarios
      .filter(f => (filtro === 'todos' ? true : filtro === 'ativos' ? f.ativo : !f.ativo))
      .filter(f => !q || semAcento(f.nome).includes(q) || (f.cpf ?? '').includes(q))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [funcionarios, busca, filtro]);

  const cargoNome = (id: string | null) => cargos.find(c => c.id === id)?.nome ?? '—';
  const escalaNome = (id: string | null) => escalas.find(e => e.id === id)?.nome.split('·')[0].trim() ?? '—';

  async function salvar() {
    if (!ed) return;
    if (!ed.nome?.trim()) return toast.erro('Informe o nome.');
    const salario = Number(String(ed.salarioTxt ?? ed.salario_mensal ?? '').replace(/\./g, '').replace(',', '.')) || 0;
    if (salario <= 0) return toast.erro('Informe o salário mensal — é a base do cálculo da diária.');
    if (!ed.escala_id) return toast.erro('Escolha a escala de trabalho — sem ela não há dias previstos para calcular a diária.');
    if (!ed.data_admissao) return toast.erro('Informe a data de admissão.');
    try {
      const dados: Partial<Funcionario> = {
        nome: ed.nome.trim(), cpf: nulo(ed.cpf), email: nulo(ed.email), telefone: nulo(ed.telefone), cargo_id: ed.cargo_id || null,
        escala_id: ed.escala_id, vinculo: ed.vinculo as Vinculo, salario_mensal: salario, data_admissao: ed.data_admissao,
        data_desligamento: ed.data_desligamento || null, oab: nulo(ed.oab), pix: nulo(ed.pix), banco: nulo(ed.banco), agencia: nulo(ed.agencia),
        conta: nulo(ed.conta), tipo_conta: nulo(ed.tipo_conta), observacoes: nulo(ed.observacoes), ativo: ed.ativo ?? true,
      };
      if (ed.id) await db.funcionarios.update(ed.id, dados);
      else await db.funcionarios.insert({ ...dados, tem_pin: false });
      await auditar(ed.id ? 'Funcionário editado' : 'Funcionário criado', dados.nome);
      toast.ok(ed.id ? 'Cadastro atualizado.' : 'Funcionário cadastrado. Defina o PIN para liberar o registro de ponto.');
      setEd(null); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }

  async function salvarPin() {
    if (!pinDe) return;
    try {
      await db.definirPin(pinDe.id, pin);
      await auditar('PIN redefinido', pinDe.nome);
      toast.ok(`PIN de ${pinDe.nome} definido.`); setPinDe(null); setPin(''); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }

  async function alternarAtivo(f: Funcionario) {
    if (f.ativo) {
      if (!(await confirmar(`Desligar ${f.nome}? A data de desligamento será hoje e o ponto será bloqueado. O histórico é mantido.`, { perigo: true, rotulo: 'Desligar' }))) return;
      await db.funcionarios.update(f.id, { ativo: false, data_desligamento: agora.data });
    } else {
      await db.funcionarios.update(f.id, { ativo: true, data_desligamento: null });
    }
    await auditar(f.ativo ? 'Funcionário desligado' : 'Funcionário reativado', f.nome);
    await recarregar();
  }

  async function excluir(f: Funcionario) {
    if (registros.some(r => r.funcionario_id === f.id)) return toast.erro('Este funcionário tem registros de ponto. Use "Desligar" para manter o histórico.');
    if (!(await confirmar(`Excluir definitivamente ${f.nome}?`, { perigo: true, rotulo: 'Excluir' }))) return;
    await db.funcionarios.remove(f.id); await auditar('Funcionário excluído', f.nome); await recarregar();
  }

  const set = (p: Form) => setEd(e => ({ ...e, ...p }));

  return (
    <>
      <PageHeader titulo="Funcionários" sub="Cadastro da equipe: cargo, escala, salário (base da diária) e PIN de ponto.">
        <button className="btn gold" onClick={() => setEd(vazio(agora.data))}><Plus size={18} />Novo funcionário</button>
      </PageHeader>
      <div className="card">
        <div className="card-head">
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
            <Search size={17} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
            <input className="input" style={{ paddingLeft: 36 }} placeholder="Buscar por nome ou CPF" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div className="seg" role="group" aria-label="Filtro de situação">
            {(['ativos', 'inativos', 'todos'] as const).map(k => <button key={k} className={filtro === k ? 'on' : ''} onClick={() => setFiltro(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Nome</th><th>Cargo</th><th>Escala</th><th>Vínculo</th><th className="num">Salário mensal</th><th>PIN</th><th>Situação</th><th /></tr></thead>
            <tbody>
              {lista.map(f => (
                <tr key={f.id}>
                  <td className="nome"><div className="row" style={{ flexWrap: 'nowrap' }}><span className="avatar" style={{ width: 34, height: 34, fontSize: '.85rem' }}>{iniciais(f.nome)}</span>
                    <div><strong>{f.nome}</strong>{f.oab && <div className="muted" style={{ fontSize: '.82rem' }}>{f.oab}</div>}</div></div></td>
                  <td>{cargoNome(f.cargo_id)}</td>
                  <td>{f.escala_id ? escalaNome(f.escala_id) : <Badge tom="warn">Sem escala</Badge>}</td>
                  <td>{VINCULO_LABEL[f.vinculo]}</td>
                  <td className="num">{brl(f.salario_mensal)}</td>
                  <td>{f.tem_pin ? <Badge tom="ok">Definido</Badge> : <Badge tom="warn">Pendente</Badge>}</td>
                  <td>{f.ativo ? <Badge tom="ok">Ativo</Badge> : <Badge tom="mute">Desligado {fmtData(f.data_desligamento)}</Badge>}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}>
                    <button className="icon-btn" title="Definir PIN" aria-label={`Definir PIN de ${f.nome}`} onClick={() => { setPinDe(f); setPin(''); }}><KeyRound size={17} /></button>
                    <button className="icon-btn" title="Editar" aria-label={`Editar ${f.nome}`} onClick={() => setEd({ ...f, salarioTxt: String(f.salario_mensal).replace('.', ',') })}><Pencil size={17} /></button>
                    <button className="icon-btn" title={f.ativo ? 'Desligar' : 'Reativar'} aria-label={f.ativo ? `Desligar ${f.nome}` : `Reativar ${f.nome}`} onClick={() => alternarAtivo(f)}>{f.ativo ? <UserMinus size={17} /> : <UserPlus size={17} />}</button>
                    <button className="icon-btn" title="Excluir" aria-label={`Excluir ${f.nome}`} onClick={() => excluir(f)}><Trash2 size={17} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!lista.length && <Vazio>Nenhum funcionário encontrado.</Vazio>}
        </div>
      </div>

      {pinDe && (
        <Modal titulo="Definir PIN de ponto" onClose={() => setPinDe(null)}
          rodape={<><button className="btn ghost" onClick={() => setPinDe(null)}>Cancelar</button><button className="btn" disabled={!/^\d{4,8}$/.test(pin)} onClick={salvarPin}>Salvar PIN</button></>}>
          <div className="stack">
            <p>Funcionário: <strong>{pinDe.nome}</strong></p>
            <Field label="Novo PIN (4 a 8 números)" dica="O PIN é guardado com criptografia e não pode ser consultado depois. Entregue-o ao funcionário e peça para não compartilhar.">
              <input className="input pin-input" inputMode="numeric" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
            </Field>
          </div>
        </Modal>
      )}

      {ed && (
        <Modal largo titulo={ed.id ? 'Editar funcionário' : 'Novo funcionário'} onClose={() => setEd(null)}
          rodape={<><button className="btn ghost" onClick={() => setEd(null)}>Cancelar</button><button className="btn" onClick={salvar}>Salvar</button></>}>
          <div className="stack">
            <div className="section-title">Dados pessoais</div>
            <div className="grid c3">
              <div style={{ gridColumn: 'span 2' }}><Field label="Nome completo"><input className="input" value={ed.nome ?? ''} onChange={e => set({ nome: e.target.value })} autoFocus /></Field></div>
              <Field label="CPF"><input className="input" value={ed.cpf ?? ''} onChange={e => set({ cpf: mascaraCpf(e.target.value) })} inputMode="numeric" /></Field>
              <Field label="E-mail"><input className="input" type="email" value={ed.email ?? ''} onChange={e => set({ email: e.target.value })} /></Field>
              <Field label="Telefone / WhatsApp"><input className="input" value={ed.telefone ?? ''} onChange={e => set({ telefone: mascaraTelefone(e.target.value) })} inputMode="tel" /></Field>
              <Field label="Nº da OAB (se advogado)"><input className="input" value={ed.oab ?? ''} onChange={e => set({ oab: e.target.value })} placeholder="OAB/MA 00.000" /></Field>
            </div>
            <div className="section-title">Vínculo e jornada</div>
            <div className="grid c3">
              <Field label="Cargo">
                <select className="select" value={ed.cargo_id ?? ''} onChange={e => set({ cargo_id: e.target.value || null })}>
                  <option value="">Selecione…</option>{cargos.filter(c => c.ativo || c.id === ed.cargo_id).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
              <Field label="Escala de trabalho">
                <select className="select" value={ed.escala_id ?? ''} onChange={e => set({ escala_id: e.target.value || null })}>
                  <option value="">Selecione…</option>{escalas.filter(x => x.ativo || x.id === ed.escala_id).map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
                </select>
              </Field>
              <Field label="Tipo de vínculo">
                <select className="select" value={ed.vinculo} onChange={e => set({ vinculo: e.target.value as Vinculo })}>
                  {(Object.keys(VINCULO_LABEL) as Vinculo[]).map(v => <option key={v} value={v}>{VINCULO_LABEL[v]}</option>)}
                </select>
              </Field>
              <Field label="Salário mensal (R$)" dica="Base do cálculo da diária."><input className="input" inputMode="decimal" value={ed.salarioTxt ?? ''} onChange={e => set({ salarioTxt: e.target.value })} placeholder="0,00" /></Field>
              <Field label="Admissão"><input className="input" type="date" value={ed.data_admissao ?? ''} onChange={e => set({ data_admissao: e.target.value })} /></Field>
              <Field label="Desligamento"><input className="input" type="date" value={ed.data_desligamento ?? ''} onChange={e => set({ data_desligamento: e.target.value || null })} /></Field>
            </div>
            <div className="section-title">Dados para pagamento</div>
            <div className="grid c3">
              <Field label="Chave PIX"><input className="input" value={ed.pix ?? ''} onChange={e => set({ pix: e.target.value })} /></Field>
              <Field label="Banco"><input className="input" value={ed.banco ?? ''} onChange={e => set({ banco: e.target.value })} /></Field>
              <Field label="Tipo de conta"><select className="select" value={ed.tipo_conta ?? 'Corrente'} onChange={e => set({ tipo_conta: e.target.value })}><option>Corrente</option><option>Poupança</option></select></Field>
              <Field label="Agência"><input className="input" value={ed.agencia ?? ''} onChange={e => set({ agencia: e.target.value })} /></Field>
              <Field label="Conta"><input className="input" value={ed.conta ?? ''} onChange={e => set({ conta: e.target.value })} /></Field>
            </div>
            <Field label="Observações"><textarea className="textarea" value={ed.observacoes ?? ''} onChange={e => set({ observacoes: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={ed.ativo ?? true} onChange={e => set({ ativo: e.target.checked })} />Funcionário ativo</label>
          </div>
        </Modal>
      )}
    </>
  );
}
