import { useMemo, useState } from 'react';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { Abas, Badge, Field, PageHeader, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData, isoParaBR, primeiroDoMes } from '@/lib/datetime';
import type { LinhaFrequencia } from '@/lib/export';

const exportar = () => import('@/lib/export');
import { calcularPeriodo } from '@/lib/folhaLote';
import { SITUACAO_DIA } from '@/lib/rotulos';
import { OCORRENCIA_LABEL } from '@/lib/types';

export default function Relatorios() {
  const dados = useDados();
  const { cargos, registros, ocorrencias, config, agora } = dados;
  const [aba, setAba] = useState<'frequencia' | 'espelho'>('frequencia');
  const [ini, setIni] = useState(primeiroDoMes(agora.data));
  const [fim, setFim] = useState(agora.data);
  const [fid, setFid] = useState('');

  const linhas = useMemo(() => (ini <= fim ? calcularPeriodo(dados, ini, fim) : []), [dados, ini, fim]);
  const cargo = (id: string | null) => cargos.find(c => c.id === id)?.nome ?? '—';
  const freq: LinhaFrequencia[] = linhas.map(l => ({
    nome: l.func.nome, cargo: cargo(l.func.cargo_id), previstos: l.calc.dias_previstos, presentes: l.calc.dias_trabalhados, abonados: l.calc.dias_abonados,
    faltas: l.calc.faltas, atrasos: l.calc.atrasos, saidas: l.calc.saidas_antecipadas, minutosAtraso: l.calc.minutos_atraso,
  }));
  const cab = { escritorio: config.escritorio, periodo: `${fmtData(ini)} a ${fmtData(fim)}` };
  const sel = linhas.find(l => l.func.id === fid);
  const hora = (data: string, tipo: string) => {
    const r = registros.find(x => x.funcionario_id === fid && x.data === data && x.tipo === tipo && x.status_aprovacao === 'aprovado');
    return r ? isoParaBR(r.horario_real).hhmm : '—';
  };

  return (
    <>
      <PageHeader titulo="Relatórios" sub="Frequência consolidada e espelho de ponto individual, com exportação em PDF e Excel." />
      <div className="card card-pad row" style={{ marginBottom: 16, alignItems: 'flex-end' }}>
        <Field label="De"><input className="input" type="date" value={ini} onChange={e => setIni(e.target.value)} /></Field>
        <Field label="Até"><input className="input" type="date" value={fim} onChange={e => setFim(e.target.value)} /></Field>
        {ini > fim && <Badge tom="bad">A data inicial é maior que a final</Badge>}
      </div>
      <div className="card">
        <div style={{ padding: '0 12px' }}><Abas valor={aba} onChange={setAba} itens={[{ id: 'frequencia', rotulo: 'Frequência da equipe' }, { id: 'espelho', rotulo: 'Espelho individual' }]} /></div>

        {aba === 'frequencia' && (
          <>
            <div className="card-head">
              <span className="muted">{linhas.length} funcionário(s) · dias futuros não entram como falta</span>
              <div className="row">
                <button className="btn ghost sm" disabled={!freq.length} onClick={() => exportar().then(m => m.frequenciaPdf(freq, cab))}><FileDown size={16} />PDF</button>
                <button className="btn ghost sm" disabled={!freq.length} onClick={() => exportar().then(m => m.frequenciaXlsx(freq, cab))}><FileSpreadsheet size={16} />Excel</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Funcionário</th><th>Cargo</th><th className="num">Previstos</th><th className="num">Presentes</th><th className="num">Abonados</th><th className="num">Faltas</th><th className="num">Atrasos</th><th className="num">Saídas antec.</th><th className="num">Min. de atraso</th></tr></thead>
                <tbody>
                  {freq.map(l => (
                    <tr key={l.nome}>
                      <td><strong>{l.nome}</strong></td><td className="muted">{l.cargo}</td><td className="num">{l.previstos}</td><td className="num">{l.presentes}</td><td className="num">{l.abonados}</td>
                      <td className="num">{l.faltas ? <Badge tom="bad">{l.faltas}</Badge> : 0}</td><td className="num">{l.atrasos}</td><td className="num">{l.saidas}</td><td className="num">{l.minutosAtraso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!freq.length && <Vazio>Sem dados para o período.</Vazio>}
            </div>
          </>
        )}

        {aba === 'espelho' && (
          <>
            <div className="card-head">
              <select className="select" style={{ maxWidth: 340 }} value={fid} onChange={e => setFid(e.target.value)} aria-label="Funcionário">
                <option value="">Selecione o funcionário…</option>{linhas.map(l => <option key={l.func.id} value={l.func.id}>{l.func.nome}</option>)}
              </select>
              <button className="btn ghost sm" disabled={!sel} onClick={() => sel && exportar().then(m => m.espelhoPdf(sel.func, cargo(sel.func.cargo_id), sel.calc, registros, cab, ocorrencias.filter(o => o.funcionario_id === sel.func.id)))}><FileDown size={16} />PDF do espelho</button>
            </div>
            {sel ? (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>Data</th><th>Entrada</th><th>Saída int.</th><th>Retorno</th><th>Saída</th><th>Situação</th></tr></thead>
                  <tbody>
                    {sel.calc.detalhe.filter(d => d.situacao !== 'fora_contrato').map(d => {
                      const s = SITUACAO_DIA[d.situacao];
                      const oc = ocorrencias.find(o => o.funcionario_id === fid && d.data >= o.data_inicio && d.data <= o.data_fim);
                      return (
                        <tr key={d.data}>
                          <td className="mono">{fmtData(d.data)} <span className="muted">{['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d.data + 'T12:00:00Z').getUTCDay()]}</span></td>
                          <td className="mono">{hora(d.data, 'entrada')}</td><td className="mono">{hora(d.data, 'saida_intervalo')}</td><td className="mono">{hora(d.data, 'retorno_intervalo')}</td><td className="mono">{hora(d.data, 'saida')}</td>
                          <td><Badge tom={s.tom}>{s.rotulo}</Badge> <span className="muted">{d.situacao === 'abonado' && oc ? OCORRENCIA_LABEL[oc.tipo] : d.nota}{d.incompleto ? ' · marcação incompleta' : ''}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <Vazio>Escolha um funcionário para ver o espelho de ponto.</Vazio>}
          </>
        )}
      </div>
    </>
  );
}
