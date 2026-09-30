import { useEffect, useMemo, useState } from 'react';
import { Check, Download, FileText, ImageIcon, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Badge, Field, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { useAuth } from '@/context/Auth';
import type { ArquivoAnexo } from '@/data/db';
import { filaDeAnalise } from '@/lib/analises';
import { base64ParaBlob, fmtTamanho } from '@/lib/anexos';
import { fmtData, isoParaBR } from '@/lib/datetime';
import { impactoAtraso, impactoOcorrencia } from '@/lib/folha';
import { brl, minParaHoras } from '@/lib/format';
import { ANALISE_LABEL, OCORRENCIA_LABEL, type AnexoMeta, type Ocorrencia, type RegistroPonto, type StatusAnalise, type TipoOcorrencia } from '@/lib/types';

const TOM_ANALISE: Record<StatusAnalise, 'warn' | 'ok' | 'bad'> = { pendente: 'warn', aceita: 'ok', recusada: 'bad' };

/** Arquivos anexados a um item; o administrador vê a foto ou baixa o PDF (o conteúdo só é buscado ao clicar). */
function Anexos({ metas }: { metas: AnexoMeta[] }) {
  const { db } = useDados();
  const toast = useToast();
  const [ver, setVer] = useState<{ arq: ArquivoAnexo; url: string } | null>(null);
  useEffect(() => () => { if (ver) URL.revokeObjectURL(ver.url); }, [ver]);
  if (!metas.length) return <span className="muted" style={{ fontSize: '.86rem' }}>Sem anexo</span>;
  async function abrir(m: AnexoMeta) {
    try {
      const arq = await db.anexos.obter(m.id);
      const url = URL.createObjectURL(base64ParaBlob(arq.conteudo, arq.mime));
      if (arq.mime === 'application/pdf') {
        const a = document.createElement('a'); a.href = url; a.download = arq.nome; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } else setVer({ arq, url });
    } catch (e) { toast.erro((e as Error).message); }
  }
  return (
    <>
      <div className="anexos-chips">
        {metas.map(m => (
          <button key={m.id} type="button" className="anexo-chip" onClick={() => abrir(m)} title={`${m.nome} · ${fmtTamanho(m.tamanho)}`}>
            {m.mime === 'application/pdf' ? <FileText size={15} /> : <ImageIcon size={15} />}<span>{m.nome}</span>
            {m.mime === 'application/pdf' ? <Download size={13} /> : null}
          </button>
        ))}
      </div>
      {ver && (
        <Modal largo titulo={ver.arq.nome} onClose={() => setVer(null)} rodape={<a className="btn" href={ver.url} download={ver.arq.nome}><Download />Baixar</a>}>
          <img src={ver.url} alt={`Anexo: ${ver.arq.nome}`} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
        </Modal>
      )}
    </>
  );
}


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
  const { db, ocorrencias, registros, funcionarios, escalas, feriados, agora, recarregar, auditar } = useDados();
  const { sessao } = useAuth();
  const admin = sessao?.papel === 'admin';
  const toast = useToast();
  const confirmar = useConfirm();
  const [ed, setEd] = useState<FormOcorrencia | null>(null);
  const [filtro, setFiltro] = useState('');
  const [anexos, setAnexos] = useState<AnexoMeta[]>([]);
  const [recusa, setRecusa] = useState<{ tipo: 'oc'; item: Ocorrencia } | { tipo: 'reg'; item: RegistroPonto } | null>(null);
  const [motivo, setMotivo] = useState('');
  useEffect(() => { if (admin) db.anexos.listar().then(setAnexos).catch(() => setAnexos([])); }, [admin, db, ocorrencias.length, registros.length]);

  const nome = (id: string) => funcionarios.find(f => f.id === id)?.nome ?? '—';
  const func = (id: string) => funcionarios.find(f => f.id === id);
  const escalaDe = (id: string) => escalas.find(e => e.id === func(id)?.escala_id) ?? null;
  const fila = useMemo(() => filaDeAnalise(ocorrencias, registros), [ocorrencias, registros]);
  const lista = useMemo(() => [...ocorrencias].filter(o => !filtro || o.funcionario_id === filtro).sort((a, b) => b.data_inicio.localeCompare(a.data_inicio)), [ocorrencias, filtro]);
  const limite = new Date(new Date(agora.iso).getTime() - 90 * 86400_000).toISOString().slice(0, 10);
  const atrasos = useMemo(() => registros
    .filter(r => r.analise && r.data >= limite && (!filtro || r.funcionario_id === filtro))
    .sort((a, b) => b.horario_real.localeCompare(a.horario_real)), [registros, filtro, limite]);
  const metasDe = (chave: 'ocorrencia_id' | 'registro_id', id: string) => anexos.filter(a => a[chave] === id);

  async function decidirOc(o: Ocorrencia, status: 'aceita' | 'recusada', mot?: string) {
    try {
      await db.ocorrencias.update(o.id, { status_analise: status, motivo_decisao: mot?.trim() || null });
      await auditar(status === 'aceita' ? 'Atestado aceito' : 'Atestado recusado', `${nome(o.funcionario_id)} · ${OCORRENCIA_LABEL[o.tipo]} · ${fmtData(o.data_inicio)}${mot ? ` · ${mot}` : ''}`);
      toast.ok(status === 'aceita' ? 'Aceito: o(s) dia(s) serão pagos normalmente.' : 'Recusado: o(s) dia(s) serão descontados da folha.');
      await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function decidirReg(r: RegistroPonto, status: 'aceita' | 'recusada', mot?: string) {
    try {
      await db.registros.update(r.id, { analise: status, motivo_decisao: mot?.trim() || null });
      await auditar(status === 'aceita' ? 'Atraso aceito' : 'Atraso recusado', `${nome(r.funcionario_id)} · ${fmtData(r.data)} · ${minParaHoras(Math.abs(r.diferenca_minutos ?? 0))}${mot ? ` · ${mot}` : ''}`);
      toast.ok(status === 'aceita' ? 'Aceito: sem desconto.' : 'Recusado: será descontado apenas o tempo de atraso.');
      await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function confirmarRecusa() {
    if (!recusa) return;
    if (recusa.tipo === 'oc') await decidirOc(recusa.item, 'recusada', motivo); else await decidirReg(recusa.item, 'recusada', motivo);
    setRecusa(null); setMotivo('');
  }
  async function excluir(o: Ocorrencia) {
    if (!(await confirmar(`Excluir a ocorrência de ${nome(o.funcionario_id)}? Os dias voltarão a contar como falta se não houver ponto.`, { perigo: true, rotulo: 'Excluir' }))) return;
    try { await db.ocorrencias.remove(o.id); await auditar('Ocorrência excluída', nome(o.funcionario_id)); await recarregar(); } catch (e) { toast.erro((e as Error).message); }
  }

  const Botoes = ({ atual, onAceitar, onRecusar }: { atual?: StatusAnalise | null; onAceitar(): void; onRecusar(): void }) => (
    admin ? (
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        {atual !== 'aceita' && <button className="btn sm" onClick={onAceitar}><Check />Aceitar</button>}
        {atual !== 'recusada' && <button className="btn ghost danger sm" onClick={onRecusar}><X />Recusar</button>}
      </div>
    ) : <span className="hint">Decisão do administrador</span>
  );

  return (
    <>
      <PageHeader titulo="Ocorrências e abonos" sub="Atestados, atrasos e ausências: o administrador aceita (dia pago / sem desconto) ou recusa (desconta da folha).">
        <button className="btn gold" onClick={() => setEd({ tipo: 'atestado', remunerado: true, data_inicio: agora.data, data_fim: agora.data })}><Plus size={18} />Nova ocorrência</button>
      </PageHeader>

      {fila.total > 0 && (
        <section className="card analise" aria-label="Aguardando análise">
          <div className="card-head">
            <span className="section-title">Aguardando análise <span className="count-badge">{fila.total}</span></span>
            <span className="hint">Até decidir, a folha usa o desconto provisório.</span>
          </div>
          <div className="analise-lista">
            {fila.ocorrencias.map(o => {
              const f = func(o.funcionario_id);
              const imp = f ? impactoOcorrencia(f, escalaDe(o.funcionario_id), feriados, o) : null;
              return (
                <article key={o.id} className="analise-item">
                  <div className="analise-topo">
                    <span className="avatar">{nome(o.funcionario_id).split(' ').map(x => x[0]).slice(0, 2).join('')}</span>
                    <div className="grow">
                      <strong>{nome(o.funcionario_id)}</strong>
                      <div className="muted" style={{ fontSize: '.88rem' }}>{OCORRENCIA_LABEL[o.tipo]} · {fmtData(o.data_inicio)}{o.data_fim !== o.data_inicio && ` → ${fmtData(o.data_fim)}`}{imp && ` · ${imp.dias} dia(s) útil(eis)`}</div>
                    </div>
                    <Badge tom="warn">Falta com justificativa</Badge>
                  </div>
                  {o.observacao && <p className="analise-obs">“{o.observacao}”</p>}
                  <div className="analise-anexos"><Paperclip size={14} /> {admin ? <Anexos metas={metasDe('ocorrencia_id', o.id)} /> : <span className="muted">Anexos visíveis ao administrador</span>}</div>
                  <div className="analise-efeito">
                    <span><strong>Aceitar:</strong> a diária é paga normalmente.</span>
                    <span><strong>Recusar:</strong> desconta {imp ? `${imp.dias} diária(s)${admin ? ` (${brl(imp.valor)})` : ''}` : 'a(s) diária(s)'} da folha.</span>
                  </div>
                  <Botoes atual="pendente" onAceitar={() => decidirOc(o, 'aceita')} onRecusar={() => { setRecusa({ tipo: 'oc', item: o }); setMotivo(''); }} />
                </article>
              );
            })}
            {fila.atrasos.map(r => {
              const f = func(r.funcionario_id);
              const imp = f ? impactoAtraso(f, escalaDe(r.funcionario_id), feriados, r) : null;
              const saida = r.status === 'saida_antecipada';
              return (
                <article key={r.id} className="analise-item">
                  <div className="analise-topo">
                    <span className="avatar">{nome(r.funcionario_id).split(' ').map(x => x[0]).slice(0, 2).join('')}</span>
                    <div className="grow">
                      <strong>{nome(r.funcionario_id)}</strong>
                      <div className="muted" style={{ fontSize: '.88rem' }}>{saida ? 'Saída antecipada' : 'Atraso'} de {minParaHoras(Math.abs(r.diferenca_minutos ?? 0))} · {fmtData(r.data)} · previsto {r.horario_previsto ?? '—'}, registrado {isoParaBR(r.horario_real).hhmm}</div>
                    </div>
                    <Badge tom="warn">{saida ? 'Saída antecipada' : 'Atraso'}</Badge>
                  </div>
                  {r.justificativa && <p className="analise-obs">“{r.justificativa}”</p>}
                  <div className="analise-anexos"><Paperclip size={14} /> {admin ? <Anexos metas={metasDe('registro_id', r.id)} /> : <span className="muted">Anexos visíveis ao administrador</span>}</div>
                  <div className="analise-efeito">
                    <span><strong>Aceitar:</strong> sem desconto.</span>
                    <span><strong>Recusar:</strong> desconta só {minParaHoras(imp?.minutos ?? 0)} de {saida ? 'saída antecipada' : 'atraso'}{imp && admin ? ` (${brl(imp.valor)})` : ''}, não a diária.</span>
                  </div>
                  <Botoes atual="pendente" onAceitar={() => decidirReg(r, 'aceita')} onRecusar={() => { setRecusa({ tipo: 'reg', item: r }); setMotivo(''); }} />
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="card" style={{ marginTop: fila.total ? 18 : 0 }}>
        <div className="card-head">
          <select className="select" style={{ maxWidth: 320 }} value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar por funcionário">
            <option value="">Todos os funcionários</option>{funcionarios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
          <span className="muted">{lista.length} registro(s)</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Funcionário</th><th>Tipo</th><th>Período</th><th>Situação</th><th>Folha</th><th>Observação</th><th /></tr></thead>
            <tbody>
              {lista.map(o => {
                const st = o.status_analise ?? 'aceita';
                return (
                  <tr key={o.id}>
                    <td><strong>{nome(o.funcionario_id)}</strong>{o.origem === 'funcionario' && <div className="muted" style={{ fontSize: '.8rem' }}>enviado pelo funcionário</div>}</td>
                    <td>{OCORRENCIA_LABEL[o.tipo]}</td>
                    <td className="mono">{fmtData(o.data_inicio)}{o.data_fim !== o.data_inicio && ` → ${fmtData(o.data_fim)}`}</td>
                    <td><Badge tom={TOM_ANALISE[st]}>{o.origem === 'funcionario' || st !== 'aceita' ? ANALISE_LABEL[st] : 'Registrada'}</Badge></td>
                    <td>{st === 'recusada' ? <Badge tom="bad">Descontado</Badge> : st === 'pendente' ? <Badge tom="warn">Desconto provisório</Badge> : o.remunerado ? <Badge tom="ok">Sem desconto</Badge> : <Badge tom="bad">Descontado</Badge>}</td>
                    <td className="muted">{o.motivo_decisao ? `Recusa: ${o.motivo_decisao}` : o.observacao}{admin && metasDe('ocorrencia_id', o.id).length > 0 && <div style={{ marginTop: 4 }}><Anexos metas={metasDe('ocorrencia_id', o.id)} /></div>}</td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      {admin && o.origem === 'funcionario' && st !== 'pendente' && (
                        <button className="btn ghost sm" onClick={() => (st === 'aceita' ? (setRecusa({ tipo: 'oc', item: o }), setMotivo('')) : decidirOc(o, 'aceita'))}>{st === 'aceita' ? 'Recusar' : 'Aceitar'}</button>
                      )}
                      <button className="icon-btn" aria-label="Editar" onClick={() => setEd(o)}><Pencil size={17} /></button>
                      <button className="icon-btn" aria-label="Excluir" onClick={() => excluir(o)}><Trash2 size={17} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!lista.length && <Vazio tipo="documento" titulo="Nenhuma ocorrência">Atestados, audiências externas, férias e outras ausências aparecem aqui.</Vazio>}
        </div>
      </div>

      {atrasos.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="card-head"><span className="section-title">Atrasos e saídas antecipadas (últimos 90 dias)</span><span className="muted">{atrasos.length} registro(s)</span></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Funcionário</th><th>Data</th><th>Marcação</th><th className="num">Tempo</th><th>Justificativa</th><th>Situação</th><th /></tr></thead>
              <tbody>
                {atrasos.map(r => (
                  <tr key={r.id}>
                    <td><strong>{nome(r.funcionario_id)}</strong></td>
                    <td className="mono">{fmtData(r.data)}</td>
                    <td>{r.status === 'saida_antecipada' ? 'Saída antecipada' : 'Atraso'} · {isoParaBR(r.horario_real).hhmm}</td>
                    <td className="num">{minParaHoras(Math.abs(r.diferenca_minutos ?? 0))}</td>
                    <td className="muted">{r.motivo_decisao ? `Recusa: ${r.motivo_decisao}` : r.justificativa}{admin && metasDe('registro_id', r.id).length > 0 && <div style={{ marginTop: 4 }}><Anexos metas={metasDe('registro_id', r.id)} /></div>}</td>
                    <td><Badge tom={TOM_ANALISE[r.analise ?? 'pendente']}>{ANALISE_LABEL[r.analise ?? 'pendente']}</Badge></td>
                    <td className="right">{admin && r.analise !== 'pendente' && (
                      <button className="btn ghost sm" onClick={() => (r.analise === 'aceita' ? (setRecusa({ tipo: 'reg', item: r }), setMotivo('')) : decidirReg(r, 'aceita'))}>{r.analise === 'aceita' ? 'Recusar' : 'Aceitar'}</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ed && <ModalOcorrencia inicial={ed} onClose={() => setEd(null)} />}
      {recusa && (
        <Modal titulo="Recusar" onClose={() => setRecusa(null)} rodape={<><button className="btn ghost" onClick={() => setRecusa(null)}>Cancelar</button><button className="btn danger" onClick={confirmarRecusa}>Confirmar recusa</button></>}>
          <div className="stack">
            <p>
              {recusa.tipo === 'oc'
                ? <>Ao recusar, o(s) dia(s) de <strong>{nome(recusa.item.funcionario_id)}</strong> serão descontados da folha (falta).</>
                : <>Ao recusar, será descontado da folha de <strong>{nome(recusa.item.funcionario_id)}</strong> apenas o tempo de {recusa.item.status === 'saida_antecipada' ? 'saída antecipada' : 'atraso'} ({minParaHoras(Math.abs(recusa.item.diferenca_minutos ?? 0))}), não a diária inteira.</>}
            </p>
            <Field label="Motivo da recusa (opcional, fica registrado)"><textarea className="textarea" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: atestado sem data, documento ilegível…" autoFocus /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
