import type { AgoraBR } from './datetime';
import { calcularFolha, type FolhaCalculada } from './folha';
import { turnoDaData } from './ponto';
import type { AjusteDia, AjusteFolha, Config, Escala, Feriado, Funcionario, Ocorrencia, RegistroPonto } from './types';

export interface BaseCalculo {
  funcionarios: Funcionario[]; escalas: Escala[]; registros: RegistroPonto[]; ocorrencias: Ocorrencia[];
  feriados: Feriado[]; ajustes: AjusteFolha[]; ajustesDia?: AjusteDia[]; config: Config; agora: AgoraBR;
}
export interface LinhaFolha { func: Funcionario; escala: Escala | null; calc: FolhaCalculada }

/** Funcionário tem vínculo ativo em algum dia do período? */
export const contratoNoPeriodo = (f: Funcionario, inicio: string, fim: string) =>
  f.data_admissao <= fim && (!f.data_desligamento || f.data_desligamento >= inicio);

export function calcularPeriodo(b: BaseCalculo, inicio: string, fim: string): LinhaFolha[] {
  return b.funcionarios
    .filter(f => contratoNoPeriodo(f, inicio, fim) && (f.ativo || !!f.data_desligamento))
    .map(func => {
      const escala = b.escalas.find(e => e.id === func.escala_id) ?? null;
      const calc = calcularFolha({
        func, escala, registros: b.registros, ocorrencias: b.ocorrencias, feriados: b.feriados, ajustes: b.ajustes, ajustesDia: b.ajustesDia,
        config: b.config, inicio, fim, hoje: b.agora.data, agoraMin: b.agora.minutos,
      });
      return { func, escala, calc };
    })
    .sort((a, b2) => a.func.nome.localeCompare(b2.func.nome, 'pt-BR'));
}

export type SituacaoHoje = { rotulo: string; tom: 'ok' | 'warn' | 'bad' | 'gold' | 'mute'; hora?: string };
/** Situação de um funcionário no dia de hoje, para o painel de presença. */
export function situacaoHoje(b: BaseCalculo, func: Funcionario): SituacaoHoje {
  const hoje = b.agora.data;
  const escala = b.escalas.find(e => e.id === func.escala_id) ?? null;
  if (hoje < func.data_admissao || (func.data_desligamento && hoje > func.data_desligamento)) return { rotulo: 'Fora do vínculo', tom: 'mute' };
  const regs = b.registros.filter(r => r.funcionario_id === func.id && r.data === hoje && r.status_aprovacao === 'aprovado')
    .sort((a, c) => a.horario_real.localeCompare(c.horario_real));
  const feriado = b.feriados.find(f => f.data === hoje);
  const oc = b.ocorrencias.find(o => o.funcionario_id === func.id && hoje >= o.data_inicio && hoje <= o.data_fim);
  const turno = turnoDaData(escala, hoje);
  const ult = regs[regs.length - 1];
  if (ult) {
    const h = new Date(new Date(ult.horario_real).getTime() - 3 * 3600_000).toISOString().slice(11, 16);
    if (ult.tipo === 'saida') return { rotulo: 'Expediente encerrado', tom: 'mute', hora: h };
    if (ult.tipo === 'saida_intervalo') return { rotulo: 'No intervalo', tom: 'gold', hora: h };
    return { rotulo: 'Trabalhando', tom: 'ok', hora: h };
  }
  if (oc) return { rotulo: 'Ausência justificada', tom: 'gold' };
  if (feriado) return { rotulo: `Feriado`, tom: 'mute' };
  if (!turno) return { rotulo: 'Folga', tom: 'mute' };
  const min = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
  if (b.agora.minutos < min(turno.entrada) + 15) return { rotulo: 'Aguardando entrada', tom: 'mute', hora: turno.entrada };
  if (b.agora.minutos > min(turno.saida)) return { rotulo: 'Faltou', tom: 'bad' };
  return { rotulo: 'Sem entrada registrada', tom: 'bad', hora: turno.entrada };
}
