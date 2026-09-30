import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDb, type Db } from '@/data/db';
import { CONFIG_PADRAO } from '@/lib/config';
import { agoraBR, type AgoraBR } from '@/lib/datetime';
import type {
  AjusteDia, AjusteFolha, Cargo, Config, Escala, Feriado, Folha, Funcionario, Ocorrencia, RegistroPonto, Usuario,
} from '@/lib/types';
import { useAuth } from './Auth';

interface DadosCtx {
  db: Db;
  carregando: boolean;
  cargos: Cargo[]; escalas: Escala[]; funcionarios: Funcionario[]; registros: RegistroPonto[]; ocorrencias: Ocorrencia[];
  feriados: Feriado[]; ajustes: AjusteFolha[]; ajustesDia: AjusteDia[]; folhas: Folha[]; usuarios: Usuario[]; config: Config;
  agora: AgoraBR;
  /** true quando o banco ainda não tem as tabelas/colunas da última atualização. */
  atualizacaoPendente: boolean;
  /** Mensagem técnica devolvida pelo banco quando a atualização está pendente. */
  erroAtualizacao: string;
  /** Recursos que o banco ainda não tem (lista legível). */
  itensPendentes: string[];
  recarregar(): Promise<void>;
  auditar(acao: string, detalhe?: string): Promise<void>;
}
const Ctx = createContext<DadosCtx | null>(null);

export function DadosProvider({ children }: { children: ReactNode }) {
  const { sessao } = useAuth();
  const [db, setDb] = useState<Db | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [d, setD] = useState({
    cargos: [] as Cargo[], escalas: [] as Escala[], funcionarios: [] as Funcionario[], registros: [] as RegistroPonto[],
    ocorrencias: [] as Ocorrencia[], feriados: [] as Feriado[], ajustes: [] as AjusteFolha[], ajustesDia: [] as AjusteDia[], folhas: [] as Folha[],
    usuarios: [] as Usuario[], config: CONFIG_PADRAO,
  });
  const [agora, setAgora] = useState(agoraBR());
  const [atualizacaoPendente, setAtualizacaoPendente] = useState(false);
  const [erroAtualizacao, setErroAtualizacao] = useState('');
  const [itensPendentes, setItensPendentes] = useState<string[]>([]);

  useEffect(() => { getDb().then(setDb); }, []);
  useEffect(() => { const t = setInterval(() => setAgora(agoraBR()), 30_000); return () => clearInterval(t); }, []);

  const recarregar = useCallback(async () => {
    if (!db || !sessao) return;
    const admin = sessao.papel === 'admin';
    // Tabela opcional (chegou numa atualização do banco): se ainda não existir, o painel segue funcionando.
    let semAtualizacao = '';
    const ajustesDiaP = db.ajustesDia.list().catch((e: Error) => { semAtualizacao = e.message || 'erro desconhecido'; return [] as AjusteDia[]; });
    const [cargos, escalas, func, registros, ocorrencias, feriados, config, ajustes, folhas, usuarios, ajustesDia] = await Promise.all([
      db.cargos.list(), db.escalas.list(),
      admin
        ? db.funcionarios.list()
        : db.equipe().then(eq => eq.map(e => ({
          ...e, cpf: null, email: null, telefone: null, salario_mensal: 0, oab: null, pix: null, banco: null, agencia: null,
          conta: null, tipo_conta: null, observacoes: null, created_at: '',
        }) as Funcionario)),
      db.registros.list(), db.ocorrencias.list(), db.feriados.list(), db.config.get(),
      admin ? db.ajustes.list() : Promise.resolve([] as AjusteFolha[]),
      admin ? db.folhas.list() : Promise.resolve([] as Folha[]),
      admin ? db.usuarios.list() : Promise.resolve([] as Usuario[]),
      ajustesDiaP,
    ]);
    // Recursos novos que o banco ainda não tem (o SQL de atualização não foi rodado): o painel avisa e segue funcionando.
    const faltando = admin ? await db.esquemaPendente().catch(() => [] as string[]) : [];
    setItensPendentes(faltando);
    setAtualizacaoPendente(!!semAtualizacao || faltando.length > 0);
    setErroAtualizacao(semAtualizacao);
    // Selos de PDFs emitidos enquanto o banco não estava pronto são enviados sozinhos assim que possível.
    try {
      if (faltando.length === 0 && localStorage.getItem('almeida.selos.pendentes')) import('@/lib/selo').then(m => m.sincronizarSelos(db)).catch(() => undefined);
    } catch { /* sem armazenamento local */ }
    setD({ cargos, escalas, funcionarios: func, registros, ocorrencias, feriados, config, ajustes, ajustesDia, folhas, usuarios });
    setAgora(agoraBR());
  }, [db, sessao]);

  useEffect(() => {
    if (!db || !sessao) { setCarregando(false); return; }
    setCarregando(true);
    recarregar().finally(() => setCarregando(false));
  }, [db, sessao, recarregar]);

  const auditar = useCallback(async (acao: string, detalhe = '') => {
    if (!db || !sessao) return;
    try { await db.auditoria.insert({ usuario: sessao.nome, acao, detalhe }); } catch { /* auditoria não deve travar a ação */ }
  }, [db, sessao]);

  const valor = useMemo(() => (db ? { db, carregando, ...d, agora, atualizacaoPendente, erroAtualizacao, itensPendentes, recarregar, auditar } : null), [db, carregando, d, agora, atualizacaoPendente, erroAtualizacao, itensPendentes, recarregar, auditar]);
  if (!valor) return null;
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
export function useDados() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useDados fora do DadosProvider');
  return c;
}
