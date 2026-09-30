import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPlus } from 'lucide-react';
import Presenca from '@/components/Presenca';
import { Abas, Badge, Kpi, PageHeader, Vazio } from '@/components/ui';
import { useDados } from '@/context/Dados';
import { addDays, diaSemana, fmtData } from '@/lib/datetime';
import { calcularPeriodo } from '@/lib/folhaLote';
import { DIA_LABEL } from '@/lib/types';
import { ModalOcorrencia, type FormOcorrencia } from './Ocorrencias';
import { TabelaAprovacoes } from './Registros';

export default function Gerencia() {
  const dados = useDados();
  const { registros, cargos, funcionarios, agora } = dados;
  const [aba, setAba] = useState<'hoje' | 'aprovacoes' | 'faltas'>('hoje');
  const [abonar, setAbonar] = useState<FormOcorrencia | null>(null);
  const pendentes = registros.filter(r => r.status_aprovacao === 'pendente').length;
  const gerentes = funcionarios.filter(f => f.ativo && cargos.find(c => c.id === f.cargo_id)?.categoria === 'gerencia');

  // Faltas dos últimos 14 dias que ainda não têm ocorrência/abono
  const faltas = useMemo(() => {
    const ini = addDays(agora.data, -14), fim = addDays(agora.data, -1);
    return calcularPeriodo(dados, ini, fim).flatMap(l => l.calc.detalhe.filter(d => d.situacao === 'falta').map(d => ({ func: l.func, data: d.data, nota: d.nota })))
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [dados, agora.data]);

  return (
    <>
      <PageHeader titulo="Gerência" sub="Central de acompanhamento da equipe: aprovações, presença e faltas a justificar." />
      <div className="grid c3" style={{ marginBottom: 18 }}>
        <Kpi label="Aprovações pendentes" valor={pendentes} alerta={pendentes > 0} dica="Ajustes de ponto solicitados pela equipe" />
        <Kpi label="Faltas sem justificativa" valor={faltas.length} alerta={faltas.length > 0} dica="Últimos 14 dias" />
        <Kpi label="Responsáveis pela gerência" valor={gerentes.length} dica={gerentes.map(g => g.nome.split(' ')[0]).join(', ') || 'Cadastre cargos da categoria Gerência'} />
      </div>
      <div className="card">
        <div style={{ padding: '0 12px' }}>
          <Abas valor={aba} onChange={setAba} itens={[{ id: 'hoje', rotulo: 'Presença de hoje' }, { id: 'aprovacoes', rotulo: 'Aprovações', contagem: pendentes }, { id: 'faltas', rotulo: 'Faltas a justificar', contagem: faltas.length }]} />
        </div>
        {aba === 'hoje' && <Presenca />}
        {aba === 'aprovacoes' && <TabelaAprovacoes />}
        {aba === 'faltas' && (faltas.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Funcionário</th><th>Data</th><th>Dia</th><th /></tr></thead>
              <tbody>
                {faltas.map(f => (
                  <tr key={f.func.id + f.data}>
                    <td><strong>{f.func.nome}</strong></td><td className="mono">{fmtData(f.data)}</td>
                    <td>{DIA_LABEL[diaSemana(f.data)]} {f.nota && <Badge tom="bad">{f.nota}</Badge>}</td>
                    <td className="right"><button className="btn ghost sm" onClick={() => setAbonar({ funcionario_id: f.func.id, tipo: 'atestado', remunerado: true, data_inicio: f.data, data_fim: f.data })}><ClipboardPlus size={16} />Justificar / abonar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint" style={{ padding: 14 }}>Faltas não justificadas serão descontadas na folha (1 diária por dia). Se o funcionário esqueceu de bater o ponto, use <Link to="/painel/ponto">Registros de ponto → Lançar marcação</Link>.</p>
          </div>
        ) : <Vazio tipo="ok" titulo="Sem pendências">Nenhuma falta aguardando justificativa nos últimos 14 dias.</Vazio>)}
      </div>
      {abonar && <ModalOcorrencia inicial={abonar} onClose={() => setAbonar(null)} />}
    </>
  );
}
