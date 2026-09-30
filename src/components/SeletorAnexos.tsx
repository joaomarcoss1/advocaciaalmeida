import { useRef, useState } from 'react';
import { FileText, ImageIcon, Paperclip, X } from 'lucide-react';
import type { ArquivoAnexo } from '@/data/db';
import { ACEITA, MAX_ARQUIVOS, fmtTamanho, prepararArquivo } from '@/lib/anexos';

/** Escolha de PDF/fotos (atestado, comprovante). Fotos são reduzidas no aparelho antes do envio. */
export default function SeletorAnexos({ arquivos, onChange, rotulo = 'Anexar atestado ou comprovante', dica, desabilitado }: {
  arquivos: ArquivoAnexo[]; onChange(a: ArquivoAnexo[]): void; rotulo?: string; dica?: string; desabilitado?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  const [lendo, setLendo] = useState(false);

  async function escolher(files: FileList | null) {
    if (!files?.length) return;
    setErro(''); setLendo(true);
    const novos: ArquivoAnexo[] = [];
    try {
      for (const f of Array.from(files)) {
        if (arquivos.length + novos.length >= MAX_ARQUIVOS) { setErro(`No máximo ${MAX_ARQUIVOS} arquivos.`); break; }
        try { novos.push(await prepararArquivo(f)); } catch (e) { setErro((e as Error).message); }
      }
    } finally { setLendo(false); if (ref.current) ref.current.value = ''; }
    if (novos.length) onChange([...arquivos, ...novos]);
  }

  return (
    <div className="anexos">
      <div className="row between" style={{ flexWrap: 'nowrap', gap: 10 }}>
        <span className="anexos-rot"><Paperclip size={15} /> {rotulo}</span>
        <button type="button" className="btn ghost sm" disabled={desabilitado || lendo || arquivos.length >= MAX_ARQUIVOS} onClick={() => ref.current?.click()}>{lendo ? 'Preparando…' : 'Escolher arquivo'}</button>
      </div>
      <input ref={ref} type="file" accept={ACEITA} multiple hidden onChange={e => escolher(e.target.files)} aria-label={rotulo} data-testid="anexo-input" />
      {dica && <p className="hint" style={{ margin: 0 }}>{dica}</p>}
      {arquivos.length > 0 && (
        <ul className="anexos-lista">
          {arquivos.map((a, i) => (
            <li key={`${a.nome}-${i}`}>
              {a.mime === 'application/pdf' ? <FileText size={17} /> : <ImageIcon size={17} />}
              <span className="grow"><strong>{a.nome}</strong> <span className="muted">· {fmtTamanho(a.tamanho)}</span></span>
              <button type="button" className="icon-btn" aria-label={`Remover ${a.nome}`} onClick={() => onChange(arquivos.filter((_, k) => k !== i))} disabled={desabilitado}><X /></button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="hint" style={{ color: 'var(--bad)', margin: 0 }} role="alert">{erro}</p>}
    </div>
  );
}
