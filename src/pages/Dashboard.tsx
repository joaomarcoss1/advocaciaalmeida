import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarX2, ClipboardCheck, Users, Wallet } from 'lucide-react';
import monograma from '@/assets/monograma-ouro.png';
import { useAuth } from '@/context/Auth';
import Presenca from '@/components/Presenca';
import { Kpi } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { fmtData, nomeMes, primeiroDoMes, ultimoDoMes } from '@/lib/datetime';
import { calcularPeriodo, situacaoHoje } from '@/lib/folhaLote';
import { brl } from '@/lib/format';

export default function Dashboard() {
  const dados = useDados();
  const { sessao } = useAuth();
  const { funcionarios, registros, feriados, agora } = dados;
  const ini = primeiroDoMes(agora.data), fim = ultimoDoMes(agora.data);
  const mes = useMemo(() => calcularPeriodo(dados, ini, fim), [dados, ini, fim]);
  const ativos = funcionarios.filter(f => f.ativo);
  const trabalhando = ativos.filter(f => situacaoHoje(dados, f).rotulo === 'Trabalhando').length;
  const pendentes = registros.filter(r => r.status_aprovacao === 'pendente').length;
  const faltas = mes.reduce((s, l) => s + l.calc.faltas, 0);
  const atrasos = mes.reduce((s, l) => s + l.calc.atrasos + l.calc.saidas_antecipadas, 0);
  const folha = mes.reduce((s, l) => s + l.calc.valor_final, 0);
  const proximos = feriados.filter(f => f.data >= agora.data).sort((a, b) => a.data.localeCompare(b.data)).slice(0, 4);
  const alertas = [
    ...ativos.filter(f => !f.tem_pin).map(f => `${f.nome} ainda não tem PIN de ponto.`),
    ...ativos.filter(f => !f.escala_id).map(f => `${f.nome} está sem escala de trabalho.`),
    ...ativos.filter(f => !(f.salario_mensal > 0)).map(f => `${f.nome} está sem salário cadastrado.`),
  ];
  const saudacao = agora.minutos < 12 * 60 ? 'Bom dia' : agora.minutos < 18 * 60 ? 'Boa tarde' : 'Boa noite';
  const maxOcorr = Math.max(1, ...mes.map(l => l.calc.faltas + l.calc.atrasos + l.calc.saidas_antecipadas));

  return (
    <>
      <section className="welcome">
        <img className="mark" src={monograma} alt="" />
        <span className="eyebrow" style={{ color: 'var(--gold)' }}>{nomeMes(agora.data)}</span>
        <h2 style={{ marginTop: 10 }}>{saudacao}, <em>{sessao?.nome.split(' ')[0]}</em>.</h2>
        <p>{pendentes ? `${pendentes} ajuste(s) de ponto aguardam a sua análise.` : 'Nenhuma pendência de aprovação.'} {faltas ? `${faltas} falta(s) registrada(s) no mês.` : 'Sem faltas no mês.'}</p>
        <div className="actions">
          <Link to="/painel/folha" className="btn gold"><Wallet size={18} />Abrir folha do mês</Link>
          <Link to="/painel/ponto" className="btn ghost"><ClipboardCheck size={18} />Registros de ponto</Link>
        </div>
      </section>
      <div className="grid c4" style={{ marginBottom: 22 }}>
        <Kpi icone={<Users size={18} />} label="Equipe ativa" valor={ativos.length} dica={`${trabalhando} trabalhando agora`} />
        <Kpi icone={<ClipboardCheck size={18} />} label="Aprovações pendentes" valor={pendentes} dica={pendentes ? <Link to="/painel/ponto">Analisar ajustes de ponto</Link> : 'Tudo em dia'} alerta={pendentes > 0} />
        <Kpi icone={<CalendarX2 size={18} />} label="Faltas no mês" valor={faltas} dica={`${atrasos} atraso(s)/saída(s) antecipada(s)`} alerta={faltas > 0} />
        <Kpi icone={<Wallet size={18} />} label="Folha do mês (prévia)" valor={brl(folha)} dica={<Link to="/painel/folha">Abrir folha</Link>} />
      </div>

      {alertas.length > 0 && (
        <div className="card card-pad" style={{ marginBottom: 18, borderColor: '#ecdcb4', background: 'var(--gold-tint)' }}>
          <div className="row" style={{ color: 'var(--gold-deep)', marginBottom: 6 }}><AlertTriangle size={18} /><strong>Pendências de cadastro</strong></div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>{alertas.slice(0, 6).map(a => <li key={a}>{a}</li>)}</ul>
          <Link to="/painel/funcionarios" className="hint">Ir para funcionários →</Link>
        </div>
      )}

      <div className="split">
        <div className="card"><div className="card-head"><span className="section-title">Presença de hoje</span></div><Presenca /></div>
        <div className="stack">
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 12 }}>Ocorrências no mês</div>
            {mes.map(l => {
              const n = l.calc.faltas + l.calc.atrasos + l.calc.saidas_antecipadas;
              return (
                <div key={l.func.id} style={{ marginBottom: 10 }}>
                  <div className="row between" style={{ fontSize: '.9rem' }}><span>{l.func.nome.split(' ').slice(0, 2).join(' ')}</span><span className="mono muted">{l.calc.faltas} falta(s) · {l.calc.atrasos + l.calc.saidas_antecipadas} atraso(s)</span></div>
                  <div style={{ height: 8, background: 'var(--navy-tint)', borderRadius: 99, overflow: 'hidden', display: 'flex' }} title={`${n} ocorrência(s)`}>
                    <div style={{ width: `${(l.calc.faltas / maxOcorr) * 100}%`, background: 'var(--bad)' }} />
                    <div style={{ width: `${((l.calc.atrasos + l.calc.saidas_antecipadas) / maxOcorr) * 100}%`, background: 'var(--gold)' }} />
                  </div>
                </div>
              );
            })}
            <div className="row hint" style={{ marginTop: 6 }}><span><span className="dot" style={{ display: 'inline-block', background: 'var(--bad)' }} /> Faltas</span><span><span className="dot" style={{ display: 'inline-block' }} /> Atrasos</span></div>
          </div>
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 10 }}>Próximos feriados</div>
            {proximos.map(f => <div className="sum-line" key={f.id}><span>{f.nome}</span><span className="mono muted">{fmtData(f.data).slice(0, 5)}</span></div>)}
            {!proximos.length && <p className="muted">Nenhum feriado cadastrado à frente. <Link to="/painel/feriados">Importar</Link></p>}
          </div>
        </div>
      </div>
    </>
  );
}
