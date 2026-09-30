/** Dados fictícios do modo demonstração. Nada aqui é real: nomes, valores e PINs servem só para testar o sistema. */
import { CARGOS_PADRAO, CONFIG_PADRAO, ESCALAS_MODELO } from '@/lib/config';
import { addDays, agoraBR, brParaIso, eachDay, primeiroDoMes, hhmmParaMin } from '@/lib/datetime';
import { feriadosPadrao } from '@/lib/feriados';
import { classificar, sequenciaDoDia, turnoDaData, previstoDoTipo } from '@/lib/ponto';
import type {
  AjusteFolha, Cargo, Escala, Feriado, Funcionario, Ocorrencia, RegistroPonto, Usuario,
} from '@/lib/types';

export const DEMO_ADMIN = { email: 'admin@almeidaadvocacia.com.br', senha: 'almeida2026' };
export const DEMO_GERENTE = { email: 'gerencia@almeidaadvocacia.com.br', senha: 'gerencia2026' };

function prng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const id = (p: string, n: number) => `${p}-${String(n).padStart(4, '0')}`;

export async function hashSecreto(chave: string, segredo: string): Promise<string> {
  const dados = new TextEncoder().encode(`almeida:${chave}:${segredo}`);
  if (globalThis.crypto?.subtle) {
    const h = await crypto.subtle.digest('SHA-256', dados);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let x = 2166136261; // fallback FNV-1a só para contextos sem HTTPS (demonstração)
  for (const b of dados) { x ^= b; x = Math.imul(x, 16777619); }
  return `fnv${(x >>> 0).toString(16)}`;
}

export interface SeedCompleto {
  cargos: Cargo[]; escalas: Escala[]; funcionarios: Funcionario[]; registros: RegistroPonto[]; ocorrencias: Ocorrencia[];
  feriados: Feriado[]; ajustes: AjusteFolha[]; usuarios: Usuario[];
}

export async function gerarSeed(): Promise<SeedCompleto> {
  const agora = agoraBR();
  const hoje = agora.data;
  const cargos: Cargo[] = CARGOS_PADRAO.map((c, i) => ({ id: id('cargo', i + 1), ...c, ativo: true }));
  const cargo = (nome: string) => cargos.find(c => c.nome.startsWith(nome))!.id;
  const escalas: Escala[] = ESCALAS_MODELO.map((e, i) => ({ id: id('escala', i + 1), ...e }));

  const base = { cpf: null, email: null, telefone: null, oab: null, pix: null, banco: null, agencia: null, conta: null, tipo_conta: null, data_desligamento: null, ativo: true, observacoes: null };
  const admissao = addDays(primeiroDoMes(hoje), -120);
  const defs: { nome: string; cargo: string; escala: number; vinculo: Funcionario['vinculo']; sal: number; pin: string; oab?: string; pix?: string }[] = [
    { nome: 'Carlos Eduardo Almeida', cargo: 'Sócio', escala: 0, vinculo: 'socio', sal: 9000, pin: '1001', oab: 'OAB/MA 10.001', pix: 'carlos@exemplo.com' },
    { nome: 'Mariana Sousa Lima', cargo: 'Gerente Administrativo', escala: 0, vinculo: 'clt', sal: 4500, pin: '1002', pix: '(99) 90000-0002' },
    { nome: 'Rafael Costa Silva', cargo: 'Advogado', escala: 0, vinculo: 'clt', sal: 5200, pin: '1003', oab: 'OAB/MA 15.432', pix: '000.000.000-03' },
    { nome: 'Juliana Ferreira Nunes', cargo: 'Advogado', escala: 0, vinculo: 'clt', sal: 5200, pin: '1004', oab: 'OAB/MA 16.210', pix: 'juliana@exemplo.com' },
    { nome: 'Pedro Henrique Araújo', cargo: 'Estagiário', escala: 1, vinculo: 'estagio', sal: 1200, pin: '1005', pix: '(99) 90000-0005' },
    { nome: 'Ana Beatriz Martins', cargo: 'Secretário', escala: 0, vinculo: 'clt', sal: 1900, pin: '1006', pix: '000.000.000-06' },
    { nome: 'Lucas Oliveira Rocha', cargo: 'Auxiliar Administrativo', escala: 0, vinculo: 'clt', sal: 1800, pin: '1007', pix: 'lucas@exemplo.com' },
    { nome: 'Francisca Pereira', cargo: 'Serviços Gerais', escala: 2, vinculo: 'clt', sal: 1621, pin: '1008', pix: '(99) 90000-0008' },
  ];
  const funcionarios: Funcionario[] = [];
  for (const [i, d] of defs.entries()) {
    const fid = id('func', i + 1);
    funcionarios.push({
      ...base, id: fid, nome: d.nome, cargo_id: cargo(d.cargo), escala_id: escalas[d.escala].id, vinculo: d.vinculo,
      salario_mensal: d.sal, data_admissao: admissao, oab: d.oab ?? null, pix: d.pix ?? null,
      tem_pin: true, pin_hash: await hashSecreto(fid, d.pin), created_at: new Date().toISOString(),
    });
  }

  const ano = Number(hoje.slice(0, 4));
  const feriados: Feriado[] = [...feriadosPadrao(ano - 1), ...feriadosPadrao(ano), ...feriadosPadrao(ano + 1)]
    .map((f, i) => ({ id: id('fer', i + 1), ...f }));
  const feriadoSet = new Set(feriados.map(f => f.data));

  const rnd = prng(20260930);
  const inicio = addDays(primeiroDoMes(hoje), -31);
  const dias = eachDay(inicio, hoje);
  const ocorrencias: Ocorrencia[] = [];
  const registros: RegistroPonto[] = [];
  const ajustes: AjusteFolha[] = [];
  const cfg = CONFIG_PADRAO.ponto;

  // Ocorrências de exemplo (dias escolhidos entre os últimos dias úteis já passados)
  const uteis = dias.filter(d => d < hoje && !feriadoSet.has(d) && turnoDaData(escalas[0], d));
  const diaAt = uteis[uteis.length - 6], diaAud = uteis[uteis.length - 3];
  if (diaAt) ocorrencias.push({ id: id('oc', 1), funcionario_id: funcionarios[3].id, data_inicio: diaAt, data_fim: diaAt, tipo: 'atestado', remunerado: true, observacao: 'Atestado médico (1 dia)', created_at: new Date().toISOString() });
  if (diaAud) ocorrencias.push({ id: id('oc', 2), funcionario_id: funcionarios[2].id, data_inicio: diaAud, data_fim: diaAud, tipo: 'audiencia_externa', remunerado: true, observacao: 'Audiência na Comarca de Timbiras', created_at: new Date().toISOString() });

  let n = 0;
  for (const f of funcionarios) {
    const escala = escalas.find(e => e.id === f.escala_id)!;
    for (const d of dias) {
      const turno = turnoDaData(escala, d);
      if (!turno || feriadoSet.has(d) || d < f.data_admissao) continue;
      if (ocorrencias.some(o => o.funcionario_id === f.id && d >= o.data_inicio && d <= o.data_fim)) continue;
      if (d < hoje && rnd() < 0.045) continue; // falta
      const atrasa = rnd() < 0.09;
      const antecipa = rnd() < 0.03;
      for (const tipo of sequenciaDoDia(turno)) {
        const prev = previstoDoTipo(turno, tipo)!;
        let min = hhmmParaMin(prev) + Math.round((rnd() - 0.5) * 8);
        let just: string | null = null;
        if (tipo === 'entrada' && atrasa) { min = hhmmParaMin(prev) + 32 + Math.round(rnd() * 50); just = 'Trânsito na BR-316'; }
        if (tipo === 'saida' && antecipa) { min = hhmmParaMin(prev) - 45; just = 'Compromisso pessoal autorizado pela gerência'; }
        if (d === hoje && min > agora.minutos) continue;
        const hh = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
        const c = classificar(tipo, prev, min, cfg);
        registros.push({
          id: id('reg', ++n), funcionario_id: f.id, data: d, tipo, horario_previsto: prev, horario_real: brParaIso(d, hh),
          diferenca_minutos: c.diferenca, status: c.status, justificativa: just, latitude: null, longitude: null,
          status_aprovacao: 'aprovado', retroativo: false, motivo_rejeicao: null, aprovado_por: null, aprovado_em: null, created_at: brParaIso(d, hh),
        });
      }
    }
  }

  // Um ajuste de ponto retroativo aguardando aprovação da gerência
  const diaPend = uteis[uteis.length - 2];
  if (diaPend) {
    const f = funcionarios[6];
    const antes = registros.findIndex(r => r.funcionario_id === f.id && r.data === diaPend && r.tipo === 'entrada');
    if (antes >= 0) registros.splice(antes, 1);
    registros.push({
      id: id('reg', ++n), funcionario_id: f.id, data: diaPend, tipo: 'entrada', horario_previsto: '08:00', horario_real: brParaIso(diaPend, '08:04'),
      diferenca_minutos: 4, status: 'pendente', justificativa: 'Esqueci de bater o ponto ao chegar.', latitude: null, longitude: null,
      status_aprovacao: 'pendente', retroativo: true, motivo_rejeicao: null, aprovado_por: null, aprovado_em: null, created_at: new Date().toISOString(),
    });
  }

  const mesAtual = primeiroDoMes(hoje);
  const dataAj = addDays(mesAtual, 4) < hoje ? addDays(mesAtual, 4) : hoje;
  ajustes.push(
    { id: id('aj', 1), funcionario_id: funcionarios[2].id, data: dataAj, tipo: 'hora_extra', valor: 187.5, quantidade_horas: 10, motivo: 'Plantão para audiência', observacao: null, created_at: new Date().toISOString() },
    { id: id('aj', 2), funcionario_id: funcionarios[6].id, data: dataAj, tipo: 'adiantamento', valor: 300, quantidade_horas: null, motivo: 'Vale', observacao: null, created_at: new Date().toISOString() },
    { id: id('aj', 3), funcionario_id: funcionarios[1].id, data: dataAj, tipo: 'adicional', valor: 250, quantidade_horas: null, motivo: 'Gratificação de função', observacao: null, created_at: new Date().toISOString() },
  );

  const usuarios: Usuario[] = [
    { id: id('user', 1), email: DEMO_ADMIN.email, nome: 'Administrador', papel: 'admin', senha_hash: await hashSecreto(DEMO_ADMIN.email, DEMO_ADMIN.senha), ativo: true },
    { id: id('user', 2), email: DEMO_GERENTE.email, nome: 'Mariana Sousa Lima', papel: 'gerente', senha_hash: await hashSecreto(DEMO_GERENTE.email, DEMO_GERENTE.senha), ativo: true },
  ];
  return { cargos, escalas, funcionarios, registros, ocorrencias, feriados, ajustes, usuarios };
}
