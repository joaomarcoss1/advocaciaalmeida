import type { Ocorrencia, RegistroPonto } from './types';

/** Itens que aguardam a decisão do administrador: atestados enviados pelos funcionários e atrasos/saídas antecipadas. */
export function filaDeAnalise(ocorrencias: Ocorrencia[], registros: RegistroPonto[]) {
  const oc = ocorrencias.filter(o => o.status_analise === 'pendente').sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  const atrasos = registros
    .filter(r => r.analise === 'pendente' && (r.status === 'atraso' || r.status === 'saida_antecipada') && r.status_aprovacao !== 'rejeitado')
    .sort((a, b) => a.data.localeCompare(b.data));
  return { ocorrencias: oc, atrasos, total: oc.length + atrasos.length };
}
