import type { SituacaoDia, StatusMarcacao } from './types';
import type { Tom } from '@/components/ui';

export const STATUS_MARCACAO: Record<StatusMarcacao, { rotulo: string; tom: Tom }> = {
  no_horario: { rotulo: 'No horário', tom: 'ok' },
  tolerancia: { rotulo: 'Tolerância', tom: 'ok' },
  atraso: { rotulo: 'Atraso', tom: 'bad' },
  saida_antecipada: { rotulo: 'Saída antecipada', tom: 'bad' },
  extra: { rotulo: 'Extra', tom: 'gold' },
  manual: { rotulo: 'Lançamento manual', tom: 'gold' },
  pendente: { rotulo: 'Pendente', tom: 'warn' },
};

export const SITUACAO_DIA: Record<SituacaoDia, { rotulo: string; tom: Tom }> = {
  presente: { rotulo: 'Presente', tom: 'ok' },
  abonado: { rotulo: 'Abonado', tom: 'gold' },
  falta: { rotulo: 'Falta', tom: 'bad' },
  feriado: { rotulo: 'Feriado', tom: 'mute' },
  folga: { rotulo: 'Folga', tom: 'mute' },
  futuro: { rotulo: 'A cumprir', tom: 'mute' },
  hoje: { rotulo: 'Hoje', tom: 'warn' },
  extra: { rotulo: 'Dia extra', tom: 'gold' },
  fora_contrato: { rotulo: 'Fora do vínculo', tom: 'mute' },
};
