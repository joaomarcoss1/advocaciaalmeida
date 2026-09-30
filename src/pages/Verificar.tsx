import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Hourglass, ShieldAlert } from 'lucide-react';
import marcaOuro from '@/assets/marca-ouro.png';
import { getDb, type DocumentoVerificado } from '@/data/db';
import { isoParaBR, fmtData } from '@/lib/datetime';
import { lerPayloadDoSelo } from '@/lib/selo';

const TIPO: Record<string, string> = { folha: 'Folha de pagamento', holerite: 'Demonstrativo de pagamento', frequencia: 'Relatório de frequência', espelho: 'Espelho de ponto' };
const brl = (n: unknown) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Página pública: confirma que um PDF foi emitido pelo sistema (QR Code do rodapé). Não mostra dados pessoais. */
export default function Verificar() {
  const { codigo = '' } = useParams();
  const nav = useNavigate();
  const [busca] = useSearchParams();
  const previa = lerPayloadDoSelo(busca.get('d'));
  const [digitado, setDigitado] = useState(codigo);
  const [estado, setEstado] = useState<'inicio' | 'buscando' | 'ok' | 'pendente' | 'nao' | 'erro'>(codigo ? 'buscando' : 'inicio');
  const [doc, setDoc] = useState<DocumentoVerificado | null>(null);

  useEffect(() => {
    setDigitado(codigo);
    if (!codigo) { setEstado('inicio'); setDoc(null); return; }
    let vivo = true;
    setEstado('buscando');
    getDb().then(db => db.documentos.verificar(codigo)).then(d => { if (!vivo) return; setDoc(d); setEstado(d ? 'ok' : previa ? 'pendente' : 'nao'); }).catch(() => vivo && setEstado('erro'));
    return () => { vivo = false; };
  }, [codigo]); // eslint-disable-line react-hooks/exhaustive-deps

  function enviar(e: FormEvent) {
    e.preventDefault();
    const c = digitado.trim().toUpperCase().replace(/\s+/g, '');
    if (c) nav(`/verificar/${c}`);
  }
  const r = doc?.resumo ?? {};
  const emissao = doc ? isoParaBR(doc.emitido_em) : null;

  return (
    <main className="verif">
      <div className="verif-card">
        <img src={marcaOuro} alt="Almeida Advocacia & Consultoria" className="verif-logo" />
        <span className="eyebrow">Autenticidade de documentos</span>
        <h1>Verificar documento</h1>
        <form className="search" onSubmit={enviar} role="search">
          <div className="search-field"><input aria-label="Código do documento" placeholder="Código, ex.: 1A2B-3C4D-5E6F" value={digitado} onChange={e => setDigitado(e.target.value)} autoComplete="off" spellCheck={false} /></div>
          <button className="btn" type="submit">Verificar</button>
        </form>

        {estado === 'buscando' && <p className="muted" role="status">Verificando…</p>}
        {estado === 'ok' && doc && (
          <div className="verif-res ok" role="status">
            <BadgeCheck size={30} />
            <div>
              <strong>Documento autêntico</strong>
              <p>Emitido pelo sistema da Almeida Advocacia &amp; Consultoria.</p>
              <dl>
                <div><dt>Documento</dt><dd>{TIPO[doc.tipo] ?? doc.titulo}</dd></div>
                <div><dt>Período</dt><dd>{doc.periodo}</dd></div>
                <div><dt>Emitido em</dt><dd>{emissao ? `${fmtData(emissao.data)} às ${emissao.hhmm}` : ''} · {doc.emitido_por}</dd></div>
                {r.funcionarios != null && <div><dt>Funcionários</dt><dd>{String(r.funcionarios)}</dd></div>}
                {r.total_liquido != null && <div><dt>Total líquido</dt><dd>{brl(r.total_liquido)}</dd></div>}
                {r.faltas != null && <div><dt>Faltas</dt><dd>{String(r.faltas)}</dd></div>}
                <div><dt>Código</dt><dd className="mono">{doc.codigo}</dd></div>
                <div><dt>Impressão digital (SHA-256)</dt><dd className="mono hash">{doc.hash}</dd></div>
              </dl>
              <p className="hint">Confira se o total acima é o mesmo do documento em mãos. Divergência indica que o arquivo foi alterado depois de emitido.</p>
            </div>
          </div>
        )}
        {estado === 'pendente' && previa && (
          <div className="verif-res warn" role="status">
            <Hourglass size={30} />
            <div>
              <strong>Selo ainda não confirmado pelo servidor</strong>
              <p>Este documento foi emitido pelo sistema da Almeida Advocacia, mas o registro do selo ainda não chegou ao banco de dados (isso é concluído automaticamente na próxima vez que o sistema for aberto no escritório). Enquanto isso, confira os dados do QR Code com o documento em mãos:</p>
              <dl>
                <div><dt>Documento</dt><dd>{TIPO[previa.tipo] ?? previa.tipo}</dd></div>
                <div><dt>Período</dt><dd>{previa.periodo}</dd></div>
                {previa.resumo.funcionarios != null && <div><dt>Funcionários</dt><dd>{String(previa.resumo.funcionarios)}</dd></div>}
                {previa.resumo.total_liquido != null && <div><dt>Total líquido</dt><dd>{brl(previa.resumo.total_liquido)}</dd></div>}
                {previa.resumo.faltas != null && <div><dt>Faltas</dt><dd>{String(previa.resumo.faltas)}</dd></div>}
                <div><dt>Código</dt><dd className="mono">{codigo}</dd></div>
                <div><dt>Impressão digital (SHA-256)</dt><dd className="mono hash">{previa.hash}</dd></div>
              </dl>
              <p className="hint">Estes dados vêm do próprio QR Code e ainda não foram confirmados pelo servidor. Volte a esta página mais tarde: quando o registro chegar, ela passará a mostrar “Documento autêntico”.</p>
            </div>
          </div>
        )}
        {estado === 'nao' && (
          <div className="verif-res bad" role="alert"><ShieldAlert size={30} /><div><strong>Código não encontrado</strong><p>Este código não consta em nossos registros. Confira a digitação ou desconfie do documento.</p></div></div>
        )}
        {estado === 'erro' && (
          <div className="verif-res bad" role="alert"><ShieldAlert size={30} /><div><strong>Não foi possível verificar agora</strong><p>Tente novamente em instantes.</p></div></div>
        )}
        <Link to="/" className="auth-link"><ArrowLeft size={15} />Voltar</Link>
      </div>
    </main>
  );
}
