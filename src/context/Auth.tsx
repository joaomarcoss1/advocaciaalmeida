import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getDb, type Sessao } from '@/data/db';

interface AuthCtx {
  sessao: Sessao | null;
  carregando: boolean;
  modo: 'local' | 'supabase' | null;
  entrar(email: string, senha: string): Promise<Sessao | 'mfa'>;
  verificarMfa(codigo: string): Promise<Sessao>;
  sair(): Promise<void>;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<'local' | 'supabase' | null>(null);

  useEffect(() => {
    let vivo = true;
    getDb().then(async db => {
      const s = await db.auth.sessao().catch(() => null);
      if (!vivo) return;
      setModo(db.modo); setSessao(s); setCarregando(false);
    });
    return () => { vivo = false; };
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const s = await (await getDb()).auth.entrar(email, senha);
    if (s !== 'mfa') setSessao(s);
    return s;
  }, []);
  const verificarMfa = useCallback(async (codigo: string) => {
    const s = await (await getDb()).auth.verificarMfa(codigo);
    setSessao(s);
    return s;
  }, []);
  const sair = useCallback(async () => { await (await getDb()).auth.sair(); setSessao(null); }, []);

  const valor = useMemo(() => ({ sessao, carregando, modo, entrar, verificarMfa, sair }), [sessao, carregando, modo, entrar, verificarMfa, sair]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
