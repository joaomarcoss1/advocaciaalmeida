import { Monitor, Moon, Rows3, Rows4, Sun } from 'lucide-react';
import { useAparencia, type Tema } from '@/lib/aparencia';

const PROXIMO: Record<Tema, Tema> = { auto: 'claro', claro: 'escuro', escuro: 'auto' };
const ROTULO: Record<Tema, string> = { auto: 'Tema automático (segue o aparelho)', claro: 'Tema claro', escuro: 'Tema escuro' };

/** Botões de aparência: tema (automático → claro → escuro) e densidade das tabelas. Preferência guardada neste aparelho. */
export default function Aparencia() {
  const { tema, setTema, densidade, setDensidade } = useAparencia();
  const Ic = tema === 'auto' ? Monitor : tema === 'claro' ? Sun : Moon;
  return (
    <div className="aparencia" role="group" aria-label="Aparência">
      <button className="icon-btn" aria-label={`${ROTULO[tema]}. Alterar para ${ROTULO[PROXIMO[tema]].toLowerCase()}`} title={ROTULO[tema]} onClick={() => setTema(PROXIMO[tema])}><Ic /></button>
      <button className="icon-btn" aria-pressed={densidade === 'compacta'} aria-label={densidade === 'compacta' ? 'Tabelas compactas (ativado). Voltar ao modo confortável' : 'Ativar tabelas compactas'}
        title={densidade === 'compacta' ? 'Tabelas compactas' : 'Tabelas confortáveis'} onClick={() => setDensidade(densidade === 'compacta' ? 'confortavel' : 'compacta')}>
        {densidade === 'compacta' ? <Rows4 /> : <Rows3 />}
      </button>
    </div>
  );
}
