import { useMemo, useState } from 'react';
import { Calculator, FileDown, FileSpreadsheet, Lock, LockOpen, Plus, ReceiptText, Trash2, Wallet } from 'lucide-react';
import { Badge, Field, Kpi, Modal, PageHeader, useConfirm, useToast, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData, nomeMes, addDays } from '@/lib/datetime';
import type { LinhaExport } from '@/lib/export';

// PDF/Excel pesam ~1 MB: só são baixados quando o usuário exporta.
const exportar = () => import('@/lib/export');
import { periodosDoMes, valorHoraExtra, type FolhaCalculada } from '@/lib/folha';
import { calcularPeriodo, type LinhaFolha } from '@/lib/folhaLote';
import { brl, minParaHoras } from '@/lib/format';
import { minutosJornada } from '@/lib/ponto';
import { SITUACAO_DIA } from '@/lib/rotulos';
import { AJUSTE_LABEL, AJUSTE_POSITIVO, DIAS_ESCALA, type AjusteFolha, type Folha, type StatusFolha, type TipoAjuste } from '@/lib/types';

interface Linha extends LinhaFolha { salva?: Folha; efetivo: FolhaCalculada; travada: boolean; desatualizada: boolean }
const STATUS: Record<StatusFolha, { rotulo: string; tom: 'warn' | 'gold' | 'ok' }> = { aberta: { rotulo: 'Aberta', tom: 'warn' }, fechada: { rotulo: 'Fechada', tom: 'gold' }, paga: { rotulo: 'Paga', tom: 'ok' } };

export default function Folha() {
  const dados = useDados();
  const { db, funcionarios, cargos, folhas, ajustes, config, agora, recarregar, auditar } = dados;
  const toast = useToast();
  const confirmar = useConfirm();
  const [mes, setMes] = useState(agora.data.slice(0, 7));
  const [qz, setQz] = useState(agora.data.slice(8) > '15' ? 1 : 0);
  const [pagamento, setPagamento] = useState<'pix' | 'banco'>('pix');
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [ajuste, setAjuste] = useState<Partial<AjusteFolha> & { horasTxt?: string; valorTxt?: string } | null>(null);

  const periodos = periodosDoMes(`${mes}-01`, config.folha.periodicidade);
  const per = periodos[Math.min(qz, periodos.length - 1)];
  const rotuloPeriodo = `${per.rotulo !== 'Mês completo' ? `${per.rotulo} de ` : ''}${nomeMes(per.inicio)} (${fmtData(per.inicio)} a ${fmtData(per.fim)})`;
  const emAndamento = per.fim >= agora.data;

  const linhas: Linha[] = useMemo(() => calcularPeriodo(dados, per.inicio, per.fim).map(l => {
    const salva = folhas.find(f => f.funcionario_id === l.func.id && f.periodo_inicio === per.inicio && f.periodo_fim === per.fim);
    const travada = !!salva && salva.status !== 'aberta';
    return {
      ...l, salva, travada,
      efetivo: travada ? salva! : l.calc,
      desatualizada: !!salva && !travada && Math.abs(salva.valor_final - l.calc.valor_final) > 0.005,
    };
  }), [dados, folhas, per.inicio, per.fim]);

  const cargoDe = (id: string | null) => cargos.find(c => c.id === id)?.nome ?? '—';
  const totalLiquido = linhas.reduce((s, l) => s + l.efetivo.valor_final, 0);
  const totalFaltas = linhas.reduce((s, l) => s + l.efetivo.desconto_faltas, 0);
  const nFaltas = linhas.reduce((s, l) => s + l.efetivo.faltas, 0);
  const abertas = linhas.filter(l => !l.travada);
  const fechadas = linhas.filter(l => l.salva?.status === 'fechada');

  const paraSalvar = (l: Linha, status: StatusFolha) => ({ ...l.calc, status, observacoes: l.salva?.observacoes ?? null }) as Omit<Folha, 'id' | 'created_at' | 'updated_at'>;

  async function gerar() {
    if (emAndamento && !(await confirmar('O período ainda não terminou: dias futuros entram como previstos e pagos, e o valor pode mudar até o fim do período. Gerar como prévia mesmo assim?', { rotulo: 'Gerar prévia' }))) return;
    try { await db.folhas.upsertMany(abertas.map(l => paraSalvar(l, 'aberta'))); await auditar('Folha gerada', rotuloPeriodo); toast.ok(`Folha de ${abertas.length} funcionário(s) calculada.`); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function fechar() {
    if (emAndamento) return toast.erro('Só é possível fechar a folha depois do último dia do período.');
    if (!(await confirmar('Fechar a folha congela os valores calculados (faltas, descontos e ajustes) deste período. Continuar?', { rotulo: 'Fechar folha' }))) return;
    try { await db.folhas.upsertMany(abertas.map(l => paraSalvar(l, 'fechada'))); await auditar('Folha fechada', rotuloPeriodo); toast.ok('Folha fechada.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function pagar() {
    if (!(await confirmar(`Marcar ${fechadas.length} folha(s) como paga(s)?`, { rotulo: 'Marcar como paga' }))) return;
    try { for (const l of fechadas) await db.folhas.update(l.salva!.id, { status: 'paga' }); await auditar('Folha paga', rotuloPeriodo); toast.ok('Pagamento registrado.'); await recarregar(); }
    catch (e) { toast.erro((e as Error).message); }
  }
  async function reabrir(l: Linha) {
    if (!l.salva) return;
    if (!(await confirmar(`Reabrir a folha de ${l.func.nome}? Os valores voltam a ser recalculados.`, { rotulo: 'Reabrir', perigo: true }))) return;
    await db.folhas.update(l.salva.id, { status: 'aberta' }); await auditar('Folha reaberta', `${l.func.nome} · ${rotuloPeriodo}`); await recarregar();
  }

  const paraExportar = (): LinhaExport[] => linhas.map(l => ({ func: l.func, cargo: cargoDe(l.func.cargo_id), calc: l.efetivo, ajustes: ajustesDe(l.func.id) }));
  const cab = { escritorio: config.escritorio, periodo: rotuloPeriodo };
  function ajustesDe(fid: string) { return ajustes.filter(a => a.funcionario_id === fid && a.data >= per.inicio && a.data <= per.fim).sort((a, b) => a.data.localeCompare(b.data)); }

  function novoAjuste(fid = '') {
    const data = agora.data >= per.inicio && agora.data <= per.fim ? agora.data : per.fim;
    setAjuste({ funcionario_id: fid, tipo: 'adicional', data, motivo: '' });
  }
  function sugerirHoraExtra(a: NonNullable<typeof ajuste>, horasTxt: string) {
    const l = linhas.find(x => x.func.id === a.funcionario_id);
    const horas = Number(horasTxt.replace(',', '.')) || 0;
    if (!l) return { ...a, horasTxt };
    const dias = DIAS_ESCALA.filter(d => l.escala?.dias[d]?.ativo);
    const jornada = dias.length ? dias.reduce((s, d) => s + minutosJornada(l.escala!.dias[d]), 0) / dias.length : 0;
    const v = valorHoraExtra(l.calc.valor_diaria, jornada, config.folha.hora_extra_pct) * horas;
    return { ...a, horasTxt, valorTxt: horas > 0 && v > 0 ? v.toFixed(2).replace('.', ',') : a.valorTxt };
  }
  async function salvarAjuste() {
    if (!ajuste?.funcionario_id) return toast.erro('Escolha o funcionário.');
    const valor = Number(String(ajuste.valorTxt ?? '').replace(/\./g, '').replace(',', '.'));
    if (!(valor > 0)) return toast.erro('Informe um valor maior que zero.');
    if (!ajuste.motivo?.trim()) return toast.erro('Informe o motivo.');
    const trav = folhas.find(f => f.funcionario_id === ajuste.funcionario_id && f.status !== 'aberta' && ajuste.data! >= f.periodo_inicio && ajuste.data! <= f.periodo_fim);
    if (trav) return toast.erro('A folha deste período está fechada. Reabra-a para lançar ajustes.');
    try {
      await db.ajustes.insert({
        funcionario_id: ajuste.funcionario_id, data: ajuste.data!, tipo: ajuste.tipo as TipoAjuste, valor, motivo: ajuste.motivo.trim(),
        quantidade_horas: ajuste.tipo === 'hora_extra' ? Number(String(ajuste.horasTxt ?? '').replace(',', '.')) || null : null, observacao: null,
      });
      await auditar('Ajuste lançado', `${funcionarios.find(f => f.id === ajuste.funcionario_id)?.nome} · ${AJUSTE_LABEL[ajuste.tipo as TipoAjuste]} ${brl(valor)}`);
      toast.ok('Ajuste lançado. A prévia já foi recalculada.'); setAjuste(null); await recarregar();
    } catch (e) { toast.erro((e as Error).message); }
  }
  async function removerAjuste(a: AjusteFolha) {
    const trav = folhas.find(f => f.funcionario_id === a.funcionario_id && f.status !== 'aberta' && a.data >= f.periodo_inicio && a.data <= f.periodo_fim);
    if (trav) return toast.erro('A folha deste período está fechada. Reabra-a para alterar ajustes.');
    if (!(await confirmar(`Remover o ajuste "${a.motivo}" (${brl(a.valor)})?`, { perigo: true, rotulo: 'Remover' }))) return;
    await db.ajustes.remove(a.id); await auditar('Ajuste removido', `${a.motivo} ${brl(a.valor)}`); await recarregar();
  }

  const det = linhas.find(l => l.func.id === detalhe);

  return (
    <>
      <PageHeader titulo="Folha de pagamento" sub="Diária = salário ÷ dias de trabalho previstos no mês. Cada falta desconta uma diária; dias abonados são pagos.">
        <button className="btn ghost" onClick={() => novoAjuste()}><Plus size={18} />Lançar ajuste</button>
      </PageHeader>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end', gap: 14 }}>
          <Field label="Mês de competência"><input className="input" type="month" value={mes} onChange={e => setMes(e.target.value || mes)} /></Field>
          {periodos.length > 1 && (
            <Field label="Período">
              <div className="seg">{periodos.map((p, i) => <button key={i} className={qz === i ? 'on' : ''} onClick={() => setQz(i)}>{p.rotulo}</button>)}</div>
            </Field>
          )}
          <div className="grow" />
          <button className="btn" onClick={gerar} disabled={!abertas.length}><Calculator size={18} />Gerar / recalcular</button>
          <button className="btn gold" onClick={fechar} disabled={!abertas.length || emAndamento}><Lock size={18} />Fechar folha</button>
          <button className="btn ghost" onClick={pagar} disabled={!fechadas.length}><Wallet size={18} />Marcar como paga</button>
        </div>
        {emAndamento && <div className="demo-banner" style={{ marginTop: 14 }}><strong>Prévia:</strong> o período termina em {fmtData(per.fim)}. Dias que ainda não aconteceram contam como previstos e pagos; faltas só são apuradas para dias já passados.</div>}
      </div>

      <div className="grid c4" style={{ marginBottom: 16 }}>
        <Kpi label="Líquido total" valor={brl(totalLiquido)} dica={`${linhas.length} funcionário(s)`} />
        <Kpi label="Descontos por faltas" valor={brl(totalFaltas)} dica={`${nFaltas} falta(s) no período`} alerta={nFaltas > 0} />
        <Kpi label="Ajustes (adic. − desc.)" valor={brl(linhas.reduce((s, l) => s + l.efetivo.adicionais - l.efetivo.descontos, 0))} />
        <Kpi label="Situação" valor={linhas.length && linhas.every(l => l.salva?.status === 'paga') ? 'Paga' : fechadas.length && !abertas.length ? 'Fechada' : linhas.some(l => l.salva) ? 'Aberta' : 'Prévia'} dica={`${fechadas.length} fechada(s) · ${linhas.filter(l => l.salva?.status === 'paga').length} paga(s)`} />
      </div>

      <div className="card">
        <div className="card-head">
          <span className="section-title">{rotuloPeriodo}</span>
          <div className="row">
            <div className="seg" role="group" aria-label="Forma de pagamento">
              <button className={pagamento === 'pix' ? 'on' : ''} onClick={() => setPagamento('pix')}>PIX</button>
              <button className={pagamento === 'banco' ? 'on' : ''} onClick={() => setPagamento('banco')}>Conta bancária</button>
            </div>
            <button className="btn ghost sm" disabled={!linhas.length} onClick={() => exportar().then(m => m.folhaPdf(paraExportar(), cab, pagamento))}><FileDown size={16} />PDF</button>
            <button className="btn ghost sm" disabled={!linhas.length} onClick={() => exportar().then(m => m.folhaXlsx(paraExportar(), cab, pagamento))}><FileSpreadsheet size={16} />Excel</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Funcionário</th><th className="num">Salário</th><th className="num">Diária</th><th className="num">Dias</th><th className="num">Faltas</th><th className="num">Desc. faltas</th><th className="num">Adic.</th><th className="num">Desc.</th><th className="num">Líquido</th><th>Status</th><th /></tr></thead>
            <tbody>
              {linhas.map(l => {
                const e = l.efetivo;
                return (
                  <tr key={l.func.id}>
                    <td className="nome"><strong>{l.func.nome}</strong><div className="muted" style={{ fontSize: '.82rem' }}>{cargoDe(l.func.cargo_id)}{!l.escala && <> · <span style={{ color: 'var(--bad)' }}>sem escala</span></>}</div></td>
                    <td className="num">{brl(e.salario_mensal)}</td>
                    <td className="num">{brl(e.valor_diaria)}</td>
                    <td className="num">{e.dias_trabalhados + e.dias_abonados}/{e.dias_previstos}</td>
                    <td className="num">{e.faltas ? <Badge tom="bad">{e.faltas}</Badge> : '0'}</td>
                    <td className="num" style={{ color: e.desconto_faltas ? 'var(--bad)' : undefined }}>{e.desconto_faltas ? `− ${brl(e.desconto_faltas + e.desconto_atrasos)}` : '—'}</td>
                    <td className="num">{e.adicionais ? brl(e.adicionais) : '—'}</td>
                    <td className="num">{e.descontos ? brl(e.descontos) : '—'}</td>
                    <td className="num"><strong>{brl(e.valor_final)}</strong></td>
                    <td>{l.salva ? <Badge tom={STATUS[l.salva.status].tom}>{STATUS[l.salva.status].rotulo}</Badge> : <Badge tom="mute">Prévia</Badge>}{l.desatualizada && <> <Badge tom="warn">Recalcular</Badge></>}</td>
                    <td className="right" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn ghost sm" onClick={() => setDetalhe(l.func.id)}>Detalhes</button>{' '}
                      <button className="icon-btn" title="Demonstrativo em PDF" aria-label={`Demonstrativo de ${l.func.nome}`} onClick={() => exportar().then(m => m.holeritePdf({ func: l.func, cargo: cargoDe(l.func.cargo_id), calc: l.efetivo, ajustes: ajustesDe(l.func.id) }, cab))}><ReceiptText size={17} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {linhas.length > 0 && <tfoot><tr><td colSpan={8} className="right">TOTAL LÍQUIDO</td><td className="num">{brl(totalLiquido)}</td><td colSpan={2} /></tr></tfoot>}
          </table>
          {!linhas.length && <Vazio>Nenhum funcionário com vínculo neste período.</Vazio>}
        </div>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>Os valores são de conferência gerencial: encargos legais (INSS, IRRF, FGTS, férias e 13º) não são calculados aqui. Confirme os cálculos com a contabilidade do escritório.</p>

      {det && (
        <Modal largo titulo={det.func.nome} onClose={() => setDetalhe(null)} rodape={<>
          {det.salva?.status === 'fechada' && <button className="btn ghost" onClick={() => { reabrir(det); setDetalhe(null); }}><LockOpen size={16} />Reabrir folha</button>}
          <button className="btn ghost" onClick={() => novoAjuste(det.func.id)}><Plus size={16} />Ajuste</button>
          <button className="btn" onClick={() => exportar().then(m => m.holeritePdf({ func: det.func, cargo: cargoDe(det.func.cargo_id), calc: det.efetivo, ajustes: ajustesDe(det.func.id) }, cab))}><ReceiptText size={16} />Demonstrativo PDF</button>
        </>}>
          <div className="grid c2" style={{ alignItems: 'start' }}>
            <div>
              <div className="section-title" style={{ marginBottom: 8 }}>Cálculo do período</div>
              <div className="sum-line"><span>Salário mensal</span><span className="mono">{brl(det.efetivo.salario_mensal)}</span></div>
              <div className="sum-line"><span>Valor da diária</span><span className="mono">{brl(det.efetivo.valor_diaria)}</span></div>
              <div className="sum-line"><span>Dias previstos no período</span><span className="mono">{det.efetivo.dias_previstos}</span></div>
              <div className="sum-line"><span>Bruto do período</span><span className="mono">{brl(det.efetivo.valor_bruto)}</span></div>
              <div className="sum-line neg"><span>Faltas ({det.efetivo.faltas} × {brl(det.efetivo.valor_diaria)})</span><span className="mono">− {brl(det.efetivo.desconto_faltas)}</span></div>
              {config.folha.descontar_atrasos && <div className="sum-line neg"><span>Atrasos ({minParaHoras(det.efetivo.minutos_atraso)})</span><span className="mono">− {brl(det.efetivo.desconto_atrasos)}</span></div>}
              <div className="sum-line"><span>Adicionais / horas extras</span><span className="mono">+ {brl(det.efetivo.adicionais)}</span></div>
              <div className="sum-line neg"><span>Descontos / adiantamentos</span><span className="mono">− {brl(det.efetivo.descontos)}</span></div>
              <div className="sum-line total"><span>Líquido</span><span className="mono">{brl(det.efetivo.valor_final)}</span></div>
              <div className="row" style={{ marginTop: 12 }}>
                <Badge tom="ok">{det.efetivo.dias_trabalhados} presente(s)</Badge>
                {det.efetivo.dias_abonados > 0 && <Badge tom="gold">{det.efetivo.dias_abonados} abonado(s)</Badge>}
                {det.efetivo.atrasos + det.efetivo.saidas_antecipadas > 0 && <Badge tom="warn">{det.efetivo.atrasos} atraso(s) · {det.efetivo.saidas_antecipadas} saída(s) antec.</Badge>}
                {det.efetivo.pendencias > 0 && <Badge tom="warn">{det.efetivo.pendencias} ajuste(s) aguardando aprovação</Badge>}
              </div>
              <div className="section-title" style={{ margin: '18px 0 8px' }}>Ajustes lançados</div>
              {ajustesDe(det.func.id).map(a => (
                <div className="sum-line" key={a.id}>
                  <span>{fmtData(a.data).slice(0, 5)} · {AJUSTE_LABEL[a.tipo]} — {a.motivo}</span>
                  <span className="mono">{AJUSTE_POSITIVO[a.tipo] ? '+' : '−'} {brl(a.valor)} <button className="icon-btn" style={{ width: 28, height: 28 }} aria-label="Remover ajuste" onClick={() => removerAjuste(a)}><Trash2 size={15} /></button></span>
                </div>
              ))}
              {!ajustesDe(det.func.id).length && <p className="muted">Nenhum ajuste no período.</p>}
            </div>
            <div>
              <div className="section-title" style={{ marginBottom: 8 }}>Dia a dia</div>
              <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 10 }}>
                {det.efetivo.detalhe.filter(d => d.situacao !== 'fora_contrato').map(d => {
                  const s = SITUACAO_DIA[d.situacao];
                  return (
                    <div className="dia-cell" key={d.data} style={{ borderTop: 0, borderBottom: '1px solid var(--line)' }}>
                      <span className="mono">{fmtData(d.data).slice(0, 5)} <span className="muted">{['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d.data + 'T12:00:00Z').getUTCDay()]}</span></span>
                      <span className="muted">{d.nota ?? ''}{d.incompleto ? ' marcação incompleta' : ''}</span>
                      <Badge tom={s.tom}>{s.rotulo}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {ajuste && (
        <Modal titulo="Lançar ajuste na folha" onClose={() => setAjuste(null)} rodape={<><button className="btn ghost" onClick={() => setAjuste(null)}>Cancelar</button><button className="btn" onClick={salvarAjuste}>Lançar</button></>}>
          <div className="stack">
            <Field label="Funcionário">
              <select className="select" value={ajuste.funcionario_id ?? ''} onChange={e => setAjuste({ ...ajuste, funcionario_id: e.target.value })}>
                <option value="">Selecione…</option>{funcionarios.filter(f => f.ativo).map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
            <div className="grid c2">
              <Field label="Tipo">
                <select className="select" value={ajuste.tipo} onChange={e => setAjuste({ ...ajuste, tipo: e.target.value as TipoAjuste })}>
                  {(Object.keys(AJUSTE_LABEL) as TipoAjuste[]).map(t => <option key={t} value={t}>{AJUSTE_LABEL[t]}</option>)}
                </select>
              </Field>
              <Field label="Data de competência"><input className="input" type="date" min={addDays(per.inicio, 0)} value={ajuste.data ?? ''} onChange={e => setAjuste({ ...ajuste, data: e.target.value })} /></Field>
            </div>
            {ajuste.tipo === 'hora_extra' && (
              <Field label="Quantidade de horas" dica={`Sugere o valor pela diária, jornada da escala e adicional de ${config.folha.hora_extra_pct}%.`}>
                <input className="input" inputMode="decimal" value={ajuste.horasTxt ?? ''} onChange={e => setAjuste(sugerirHoraExtra(ajuste, e.target.value))} />
              </Field>
            )}
            <Field label="Valor (R$)"><input className="input" inputMode="decimal" value={ajuste.valorTxt ?? ''} onChange={e => setAjuste({ ...ajuste, valorTxt: e.target.value })} placeholder="0,00" /></Field>
            <Field label="Motivo"><input className="input" value={ajuste.motivo ?? ''} onChange={e => setAjuste({ ...ajuste, motivo: e.target.value })} placeholder="Ex.: plantão de audiência, vale-transporte, adiantamento…" /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}
