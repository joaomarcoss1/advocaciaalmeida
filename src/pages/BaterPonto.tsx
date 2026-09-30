import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Coffee, Delete, History, Lock, LogIn, LogOut, MapPin, FilePlus2, MapPinOff, Maximize2, Minimize2, RotateCcw, Search, Undo2, UserSearch, X } from 'lucide-react';
import SeletorAnexos from '@/components/SeletorAnexos';
import { Field } from '@/components/ui';
import Stage from '@/components/Stage';
import { getDb, PONTO_ERRO_MSG, type ArquivoAnexo, type ContextoPonto, type JustificativaFunc, type MarcacaoHistorico, type PessoaPonto } from '@/data/db';
import { addDays, agoraBR, fmtData, isoParaBR, type AgoraBR } from '@/lib/datetime';
import { iniciais, minParaHoras, semAcento } from '@/lib/format';
import { fmtDistancia, lerPosicao, verificarLocal, type EstadoLocal } from '@/lib/geo';
import { classificar, exigeJustificativa, previstoDoTipo, proximoTipo, sequenciaDoDia, turnoDaData } from '@/lib/ponto';
import { ANALISE_LABEL, OCORRENCIA_LABEL, TIPO_MARCACAO_LABEL, type Escala, type TipoMarcacao, type TipoOcorrencia } from '@/lib/types';

const ICONE: Record<TipoMarcacao, typeof LogIn> = { entrada: LogIn, saida_intervalo: Coffee, retorno_intervalo: Undo2, saida: LogOut };
const STATUS_TXT: Record<string, string> = {
  no_horario: 'No horário', tolerancia: 'Dentro da tolerância', atraso: 'Atraso', saida_antecipada: 'Saída antecipada', extra: 'Fora da escala / hora extra',
};

type Etapa = 'pessoa' | 'pin' | 'painel';

function Etapas({ atual }: { atual: 1 | 2 | 3 }) {
  const itens = ['Identificação', 'PIN', 'Registro'];
  return (
    <ol className="steps" aria-label="Etapas do registro">
      {itens.map((rot, i) => (
        <li key={rot} className={i + 1 < atual ? 'done' : i + 1 === atual ? 'on' : ''} aria-current={i + 1 === atual ? 'step' : undefined}>
          <span className="n">{i + 1 < atual ? <Check size={13} strokeWidth={3} /> : i + 1}</span>{rot}
        </li>
      ))}
    </ol>
  );
}

function StatusLocal({ local, raio, onVerificar, compacto }: { local: EstadoLocal; raio: number; onVerificar: () => void; compacto?: boolean }) {
  const ok = local.estado === 'dentro';
  const carregando = local.estado === 'verificando';
  const Ic = ok ? MapPin : MapPinOff;
  let titulo = 'Verificando sua localização…', detalhe = 'Autorize o acesso à localização se o navegador pedir.';
  if (local.estado === 'dentro') { titulo = 'Você está no escritório'; detalhe = `A ${fmtDistancia(local.distancia)} do ponto central · limite ${fmtDistancia(raio)}${local.precisao > 100 ? ` · sinal de GPS impreciso (±${fmtDistancia(local.precisao)})` : ''}`; }
  else if (local.estado === 'fora') { titulo = 'Fora da área permitida'; detalhe = `Você está a ${fmtDistancia(local.distancia)} do escritório e o limite é ${fmtDistancia(raio)}. O registro de ponto está bloqueado.${local.precisao > 100 ? ` Sinal de GPS impreciso (±${fmtDistancia(local.precisao)}): vá para um local aberto e verifique de novo.` : ''}`; }
  else if (local.estado === 'negado' || local.estado === 'indisponivel' || local.estado === 'erro') { titulo = local.estado === 'negado' ? 'Localização bloqueada' : 'Localização indisponível'; detalhe = local.mensagem; }
  return (
    <div className={`geo ${carregando ? 'wait' : ok ? 'ok' : 'bad'} ${compacto ? 'compacto' : ''}`} role="status" aria-live="polite">
      <span className="geo-ic"><Ic size={compacto ? 18 : 22} strokeWidth={1.8} /></span>
      <span className="grow"><strong>{titulo}</strong><br /><span className="geo-d">{detalhe}</span></span>
      {!carregando && <button type="button" className="btn ghost sm" onClick={onVerificar}>Verificar de novo</button>}
    </div>
  );
}

export default function BaterPonto() {
  const [achadas, setAchadas] = useState<PessoaPonto[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [ctx, setCtx] = useState<ContextoPonto | null>(null);
  const [modo, setModo] = useState<'local' | 'supabase'>('local');
  const [busca, setBusca] = useState('');
  const [tentou, setTentou] = useState(false);
  const [etapa, setEtapa] = useState<Etapa>('pessoa');
  const [pessoa, setPessoa] = useState<PessoaPonto | null>(null);
  const [escala, setEscala] = useState<Escala | null>(null);
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [hist, setHist] = useState<MarcacaoHistorico[]>([]);
  const [agora, setAgora] = useState<AgoraBR>(agoraBR());
  const [escolha, setEscolha] = useState<TipoMarcacao | null>(null);
  const [just, setJust] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState<{ tipo: TipoMarcacao; status: string; hora: string; dif: number; analise?: string | null; aviso?: string } | null>(null);
  const [retro, setRetro] = useState(false);
  const [retroForm, setRetroForm] = useState({ data: '', tipo: 'entrada' as TipoMarcacao, hora: '', justificativa: '' });
  const [retroOk, setRetroOk] = useState(false);
  const [arqAtraso, setArqAtraso] = useState<ArquivoAnexo[]>([]);
  const [justs, setJusts] = useState<JustificativaFunc[]>([]);
  const [aus, setAus] = useState(false);
  const [ausForm, setAusForm] = useState({ tipo: 'atestado' as TipoOcorrencia, inicio: '', fim: '', obs: '' });
  const [ausArq, setAusArq] = useState<ArquivoAnexo[]>([]);
  const [ausOk, setAusOk] = useState(false);
  const ocioso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [local, setLocal] = useState<EstadoLocal>({ estado: 'verificando' });
  // Modo quiosque (tablet na recepção): relógio grande, botões maiores e reinício rápido. Guardado neste aparelho.
  const [params] = useSearchParams();
  const [quiosque, setQuiosque] = useState(() => { try { return params.get('quiosque') === '1' || localStorage.getItem('almeida.quiosque') === '1'; } catch { return false; } });
  const [volta, setVolta] = useState<number | null>(null);
  const tempoVolta = quiosque ? 6 : 8;
  function alternarQuiosque() {
    const novo = !quiosque;
    setQuiosque(novo);
    try { localStorage.setItem('almeida.quiosque', novo ? '1' : '0'); } catch { /* sem armazenamento */ }
    if (novo) document.documentElement.requestFullscreen?.().catch(() => undefined);
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
  }
  const cerca = !!ctx?.ponto.geofence_ativo;
  const dentro = !cerca || local.estado === 'dentro';

  const checarLocal = useCallback(async () => {
    if (!ctx?.ponto.geofence_ativo) return;
    setLocal({ estado: 'verificando' });
    setLocal(await verificarLocal(ctx.ponto));
  }, [ctx]);

  // Ao abrir o app (e sempre que o aparelho volta para esta tela), confere se o funcionário está dentro do raio.
  useEffect(() => {
    if (!cerca) return;
    checarLocal();
    const volta = () => { if (document.visibilityState === 'visible') checarLocal(); };
    document.addEventListener('visibilitychange', volta);
    return () => document.removeEventListener('visibilitychange', volta);
  }, [cerca, checarLocal]);

  useEffect(() => {
    getDb().then(async db => { setModo(db.modo); setCtx(await db.ponto.contexto()); });
    const t = setInterval(() => setAgora(agoraBR()), 1000);
    return () => clearInterval(t);
  }, []);

  const voltar = useCallback(() => {
    setEtapa('pessoa'); setPessoa(null); setPin(''); setErro(''); setHist([]); setEscolha(null); setJust('');
    setSucesso(null); setRetro(false); setRetroOk(false); setBusca(''); setTentou(false);
    setArqAtraso([]); setJusts([]); setAus(false); setAusArq([]); setAusOk(false);
  }, []);

  // Trava de segurança: volta à lista após 2 min sem interação no painel
  useEffect(() => {
    if (etapa === 'pessoa') return;
    clearTimeout(ocioso.current);
    ocioso.current = setTimeout(voltar, quiosque ? 45_000 : 120_000);
    return () => clearTimeout(ocioso.current);
  }, [etapa, escolha, just, sucesso, retro, hist, pin, voltar, quiosque]);

  // Depois de registrar: vibra (celular) e volta sozinho à tela inicial, para o próximo funcionário não ficar com a sessão aberta.
  useEffect(() => {
    if (!sucesso) { setVolta(null); return; }
    try { navigator.vibrate?.([35, 60, 35]); } catch { /* aparelho sem vibração */ }
    setVolta(tempoVolta);
  }, [sucesso, tempoVolta]);
  useEffect(() => {
    if (volta === null) return;
    if (volta <= 0) { voltar(); return; }
    const t = setTimeout(() => setVolta(v => (v === null ? v : v - 1)), 1000);
    return () => clearTimeout(t);
  }, [volta, voltar]);
  useEffect(() => { if (erro) { try { navigator.vibrate?.(140); } catch { /* sem vibração */ } } }, [erro]);

  useEffect(() => {
    if (etapa !== 'pin') return;
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin(p => (p.length < 8 ? p + e.key : p));
      else if (e.key === 'Backspace') setPin(p => p.slice(0, -1));
      else if (e.key === 'Escape') voltar();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [etapa, voltar]);

  // A equipe nunca é baixada por inteira: a busca roda no servidor (mín. 3 letras, no máx. 5 resultados).
  const termo = semAcento(busca.trim());
  useEffect(() => {
    if (termo.length < 3) { setAchadas([]); setBuscando(false); return; }
    setBuscando(true);
    let vivo = true;
    const t = setTimeout(async () => {
      try { const db = await getDb(); const r = await db.ponto.buscar(busca.trim()); if (vivo) setAchadas(r); }
      catch { if (vivo) setAchadas([]); }
      finally { if (vivo) setBuscando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca, termo.length]);
  const filtradas = termo.length < 3 ? [] : achadas;

  async function buscar() {
    setTentou(true);
    if (termo.length < 3) return;
    // busca imediata (sem esperar o intervalo da digitação); se houver um único resultado, já segue
    setBuscando(true);
    try {
      const r = await (await getDb()).ponto.buscar(busca.trim());
      setAchadas(r);
      if (r.length === 1) escolherPessoa(r[0]);
    } catch { setAchadas([]); }
    finally { setBuscando(false); }
  }

  async function escolherPessoa(p: PessoaPonto) {
    setPessoa(p); setEtapa('pin'); setPin(''); setErro('');
    const db = await getDb();
    setEscala(p.escala_id ? await db.ponto.escala(p.escala_id) : null);
  }

  async function carregarHistorico(fid: string, pinAtual: string) {
    const db = await getDb();
    const r = await db.ponto.historico(fid, pinAtual, 30);
    if (!r.ok) { setErro(PONTO_ERRO_MSG[r.erro]); return false; }
    setHist(r.registros); setJusts(r.justificativas ?? []);
    return true;
  }

  async function validarPin() {
    if (!pessoa) return;
    setErro(''); setEnviando(true);
    try { if (await carregarHistorico(pessoa.id, pin)) setEtapa('painel'); else setPin(''); }
    finally { setEnviando(false); }
  }

  const turnoHoje = turnoDaData(escala, agora.data);
  const hojeRegs = hist.filter(r => r.data === agora.data && r.status_aprovacao !== 'rejeitado');
  const proximo = proximoTipo(hojeRegs, turnoHoje);
  const sequencia = sequenciaDoDia(turnoHoje);

  const previa = useMemo(() => {
    if (!escolha || !ctx) return null;
    const previsto = previstoDoTipo(turnoHoje, escolha);
    const c = classificar(escolha, previsto, agora.minutos, ctx.ponto);
    return { previsto, ...c };
  }, [escolha, ctx, turnoHoje, agora.minutos]);

  /** Leitura nova no momento do registro (a do carregamento pode estar velha). */
  async function obterGps(): Promise<{ lat: number; lng: number } | null> {
    if (!ctx?.ponto.geofence_ativo) return null;
    try { const p = await lerPosicao(); return { lat: p.lat, lng: p.lng }; }
    catch (e) { throw new Error((e as { mensagem?: string }).mensagem ?? PONTO_ERRO_MSG.GPS_OBRIGATORIO); }
  }

  async function confirmar() {
    if (!pessoa || !escolha) return;
    setErro(''); setEnviando(true);
    try {
      const gps = await obterGps();
      const db = await getDb();
      const r = await db.ponto.bater({ funcionario_id: pessoa.id, pin, tipo: escolha, justificativa: just, lat: gps?.lat, lng: gps?.lng });
      if (!r.ok) {
        setErro(PONTO_ERRO_MSG[r.erro] + (r.detalhe && r.erro === 'FORA_DA_AREA' ? ` (${r.detalhe})` : ''));
        if (r.erro === 'PIN_INVALIDO' || r.erro === 'PIN_BLOQUEADO') voltar();
        if (r.erro === 'FORA_DA_AREA' || r.erro === 'GPS_OBRIGATORIO') { setEscolha(null); checarLocal(); }
        return;
      }
      // anexos do atraso (atestado etc.): vão para o administrador junto com a justificativa
      let aviso: string | undefined;
      for (const arq of arqAtraso) {
        const a = await db.ponto.anexar({ funcionario_id: pessoa.id, pin, registro_id: r.id, arquivo: arq });
        if (!a.ok) { aviso = `Ponto registrado, mas o arquivo "${arq.nome}" não foi enviado: ${PONTO_ERRO_MSG[a.erro]}`; break; }
      }
      setSucesso({ tipo: escolha, status: r.status, hora: isoParaBR(r.horario_real).hhmm, dif: r.diferenca_minutos, analise: r.analise, aviso });
      setEscolha(null); setJust(''); setArqAtraso([]);
      await carregarHistorico(pessoa.id, pin);
    } catch (e) { setErro((e as Error).message); }
    finally { setEnviando(false); }
  }

  async function enviarAusencia() {
    if (!pessoa) return;
    setErro(''); setEnviando(true);
    try {
      const db = await getDb();
      const r = await db.ponto.justificarAusencia({ funcionario_id: pessoa.id, pin, inicio: ausForm.inicio, fim: ausForm.fim, tipo: ausForm.tipo, observacao: ausForm.obs });
      if (!r.ok) { setErro(r.erro === 'JA_REGISTRADO' ? 'Já existe um envio ou ocorrência para esse período.' : PONTO_ERRO_MSG[r.erro]); return; }
      for (const arq of ausArq) {
        const a = await db.ponto.anexar({ funcionario_id: pessoa.id, pin, ocorrencia_id: r.id, arquivo: arq });
        if (!a.ok) { setErro(`Justificativa enviada, mas o arquivo "${arq.nome}" não foi: ${PONTO_ERRO_MSG[a.erro]}`); break; }
      }
      setAusOk(true); setAus(false); setAusArq([]);
      await carregarHistorico(pessoa.id, pin);
    } catch (e) { setErro((e as Error).message); }
    finally { setEnviando(false); }
  }

  async function enviarRetro() {
    if (!pessoa) return;
    setErro(''); setEnviando(true);
    try {
      const db = await getDb();
      const r = await db.ponto.retroativo({ funcionario_id: pessoa.id, pin, ...retroForm });
      if (!r.ok) { setErro(PONTO_ERRO_MSG[r.erro]); return; }
      setRetroOk(true); setRetro(false);
      await carregarHistorico(pessoa.id, pin);
    } catch (e) { setErro((e as Error).message); }
    finally { setEnviando(false); }
  }

  const dataExtenso = new Date(agora.iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Fortaleza' });
  const [hh, mm] = agora.hhmm.split(':');
  const primeiro = pessoa?.nome.split(' ')[0] ?? '';

  return (
    <div className={`auth ${quiosque ? 'quiosque' : ''}`}>
      <button type="button" className="icon-btn q-toggle no-print" style={{ color: 'var(--muted)' }} onClick={alternarQuiosque} aria-pressed={quiosque} aria-label={quiosque ? 'Sair do modo quiosque' : 'Ativar modo quiosque (tela cheia para tablet)'} title={quiosque ? 'Sair do modo quiosque' : 'Modo quiosque'}>{quiosque ? <Minimize2 /> : <Maximize2 />}</button>
      <Stage>
        <div aria-label={`Hora atual ${agora.hhmm}`}>
          <div className="hora"><span key={hh} className="tick">{hh}</span><span className="sep">:</span><span key={mm} className="tick">{mm}</span></div>
          <div className="dia">{dataExtenso}</div>
          {ctx?.feriado && <span className="feriado">Feriado · {ctx.feriado}</span>}
        </div>
      </Stage>

      <section className="auth-side">
        <div className="auth-card">
          <Etapas atual={etapa === 'pessoa' ? 1 : etapa === 'pin' ? 2 : 3} />
          <div key={etapa} className="passo">

          {etapa === 'pessoa' && (
            <>
              <span className="eyebrow">Registro de ponto</span>
              <h1>Identifique-se</h1>
              <p className="page-sub" style={{ marginTop: 8 }}>Digite seu nome para localizar o seu cadastro.</p>
              {cerca && ctx && <StatusLocal local={local} raio={ctx.ponto.geofence_raio_m} onVerificar={checarLocal} />}
              {modo === 'local' && <span className="badge gold" style={{ marginTop: 12 }}>Modo demonstração · dados fictícios</span>}

              <form className="search" role="search" onSubmit={e => { e.preventDefault(); buscar(); }}>
                <div className="search-field">
                  <Search size={20} className="lead" />
                  <input autoFocus autoComplete="off" spellCheck={false} placeholder="Nome ou sobrenome" value={busca}
                    onChange={e => { setBusca(e.target.value); setTentou(false); }} aria-label="Digite seu nome" />
                  {busca && <button type="button" className="clear" aria-label="Limpar busca" onClick={() => { setBusca(''); setTentou(false); }}><X size={17} /></button>}
                </div>
                <button className="btn gold" type="submit">Buscar</button>
              </form>
              <p className="hint" style={{ marginTop: 10 }}>{tentou && termo.length < 3 ? <span style={{ color: 'var(--bad)' }}>Digite ao menos 3 letras para buscar.</span> : 'Mínimo de 3 letras. Não é preciso digitar o nome completo.'}</p>

              {termo.length >= 3 ? (
                <div className="results" aria-live="polite">
                  <div className="section-title" style={{ marginBottom: 10 }}>{buscando ? 'Buscando…' : filtradas.length ? `${filtradas.length} resultado(s)` : 'Nenhum resultado'}</div>
                  {filtradas.map(p => (
                    <div key={p.id} className="result">
                      <span className="avatar">{iniciais(p.nome)}</span>
                      <span className="grow"><strong>{p.nome}</strong><br /><span className="muted" style={{ fontSize: '.86rem' }}>{p.cargo_nome ?? 'Equipe'}</span></span>
                      <button className="btn sm" onClick={() => escolherPessoa(p)}>Selecionar<ArrowRight size={15} /></button>
                    </div>
                  ))}
                  {!filtradas.length && <div className="notice gold">Não encontramos esse nome. Confira a grafia ou procure a gerência para atualizar o seu cadastro.</div>}
                </div>
              ) : (
                <div className="idle">
                  <span className="idle-ic"><UserSearch size={26} strokeWidth={1.5} /></span>
                  <strong>Encontre o seu cadastro</strong>
                  <span className="muted">Depois da busca, você confirma com o seu PIN pessoal e registra a marcação.</span>
                </div>
              )}
              <p className="secure"><Lock size={13} />Acesso protegido por PIN pessoal e intransferível.</p>
            </>
          )}

          {etapa === 'pin' && pessoa && (
            <div className="stack" style={{ gap: 18 }}>
              <div>
                <span className="eyebrow">Olá, {primeiro}</span>
                <h1>Digite seu PIN</h1>
              </div>
              <div className="pin-dots" role="img" aria-label={`${pin.length} dígitos digitados`}>
                {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
              </div>
              {erro && <div className="notice bad" role="alert">{erro}</div>}
              <div className="keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} onClick={() => setPin(p => (p.length < 8 ? p + d : p))}>{d}</button>)}
                <button className="aux" onClick={() => setPin('')}>Limpar</button>
                <button onClick={() => setPin(p => (p.length < 8 ? p + '0' : p))}>0</button>
                <button className="aux" aria-label="Apagar" onClick={() => setPin(p => p.slice(0, -1))}><Delete size={22} /></button>
              </div>
              <button className="btn block" style={{ minHeight: 50 }} disabled={pin.length < 4 || enviando} onClick={validarPin}>{enviando ? 'Verificando…' : 'Continuar'}</button>
              <button className="btn ghost block" onClick={voltar}><ArrowLeft size={16} />Não sou eu</button>
            </div>
          )}

          {etapa === 'painel' && pessoa && (
            <div className="stack">
              <div className="row between">
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <span className="avatar">{iniciais(pessoa.nome)}</span>
                  <div><strong style={{ fontWeight: 500, fontSize: '1.08rem' }}>{pessoa.nome}</strong><br /><span className="muted" style={{ fontSize: '.88rem' }}>{escala ? escala.nome : 'Sem escala definida'}</span></div>
                </div>
                <button className="btn ghost sm" onClick={voltar}>Sair</button>
              </div>

              {sucesso && (
                <div className="sucesso" role="status">
                  <svg className="selo" viewBox="0 0 56 56" aria-hidden="true"><circle cx="28" cy="28" r="24" /><path d="M17 29l8 8 14-16" /></svg>
                  <div>
                    <strong>{TIPO_MARCACAO_LABEL[sucesso.tipo]} registrada às {sucesso.hora}</strong>
                    <div>{STATUS_TXT[sucesso.status]}{sucesso.dif !== 0 && sucesso.status !== 'extra' ? ` (${sucesso.dif > 0 ? '+' : '−'}${minParaHoras(sucesso.dif)})` : ''}</div>
                    {sucesso.analise === 'pendente' && <div style={{ marginTop: 6, fontSize: '.9rem' }}>Enviado para análise do administrador (aba Ocorrências).</div>}
                    {sucesso.aviso && <div style={{ marginTop: 6, fontSize: '.9rem', color: 'var(--bad)' }}>{sucesso.aviso}</div>}
                    {volta !== null && (
                      <span className="volta">Voltando à tela inicial em {volta}s · <button type="button" className="link-btn" onClick={() => setVolta(null)}>continuar aqui</button></span>
                    )}
                  </div>
                </div>
              )}
              {ausOk && <div className="notice gold" role="status">Atestado enviado. O administrador vai analisar: se aceito, o dia é pago normalmente; se recusado, será descontado da folha.</div>}
              {retroOk && <div className="notice gold" role="status">Solicitação enviada. A gerência vai analisar o ajuste do seu ponto.</div>}
              {erro && <div className="notice bad" role="alert">{erro}</div>}

              {cerca && ctx && !retro && !aus && !dentro && <StatusLocal local={local} raio={ctx.ponto.geofence_raio_m} onVerificar={checarLocal} />}
              {cerca && ctx && !retro && !aus && dentro && local.estado === 'dentro' && <StatusLocal compacto local={local} raio={ctx.ponto.geofence_raio_m} onVerificar={checarLocal} />}

              {!retro && !aus && !escolha && (
                <>
                  {!turnoHoje && <div className="notice gold">Hoje não é dia de expediente na sua escala. As marcações serão registradas como extras.</div>}
                  <div className="stack" style={{ gap: 10 }}>
                    {sequencia.map(t => {
                      const Ic = ICONE[t];
                      const feita = hojeRegs.find(r => r.tipo === t);
                      return (
                        <button key={t} className={`acao ${t === proximo ? 'next' : ''}`} disabled={!!feita || !dentro} onClick={() => { setEscolha(t); setErro(''); setSucesso(null); }}>
                          <span className="ic">{feita ? <Check size={22} /> : <Ic size={22} strokeWidth={1.7} />}</span>
                          <span className="grow">
                            <span className="t">{TIPO_MARCACAO_LABEL[t]}</span><br />
                            <span className="s">{feita ? `Registrada às ${isoParaBR(feita.horario_real).hhmm}${feita.status_aprovacao === 'pendente' ? ' · aguardando aprovação' : ''}` : `Previsto ${previstoDoTipo(turnoHoje, t) ?? '—'}`}</span>
                          </span>
                          {!feita && <ArrowRight size={18} />}
                        </button>
                      );
                    })}
                  </div>
                  <button className="btn ghost block" onClick={() => { setAus(true); setErro(''); setAusOk(false); setSucesso(null); setAusArq([]); setAusForm({ tipo: 'atestado', inicio: agora.data, fim: agora.data, obs: '' }); }}>
                    <FilePlus2 size={16} />Enviar atestado / justificar uma falta
                  </button>
                  <button className="btn ghost block" onClick={() => { setRetro(true); setErro(''); setRetroOk(false); setSucesso(null); setRetroForm({ data: addDays(agora.data, -1), tipo: 'entrada', hora: '', justificativa: '' }); }}>
                    <RotateCcw size={16} />Esqueci de bater o ponto em outro dia
                  </button>
                </>
              )}

              {escolha && previa && (
                <div className="stack">
                  <div className="card card-pad" style={{ background: 'var(--navy-tint)', boxShadow: 'none' }}>
                    <div className="section-title">{TIPO_MARCACAO_LABEL[escolha]}</div>
                    <div className="row between" style={{ marginTop: 10 }}>
                      <span>Previsto <strong style={{ fontSize: '1.3rem', fontWeight: 500 }}>{previa.previsto ?? '—'}</strong></span>
                      <span>Agora <strong style={{ fontSize: '1.3rem', fontWeight: 500 }}>{agora.hhmm}</strong></span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <span className={`badge ${previa.status === 'atraso' || previa.status === 'saida_antecipada' ? 'bad' : previa.status === 'extra' ? 'gold' : 'ok'}`}>
                        {STATUS_TXT[previa.status]}{previa.diferenca !== 0 && previa.status !== 'extra' ? ` · ${previa.diferenca > 0 ? '+' : '−'}${minParaHoras(previa.diferenca)}` : ''}
                      </span>
                    </div>
                  </div>
                  {exigeJustificativa(previa.status) && (
                    <div className="field">
                      <label htmlFor="just">Justificativa (obrigatória)</label>
                      <textarea id="just" className="textarea" value={just} onChange={e => setJust(e.target.value)} placeholder="Ex.: audiência no fórum, trânsito, consulta médica…" />
                    </div>
                  )}
                  {exigeJustificativa(previa.status) && (
                    <>
                      <SeletorAnexos arquivos={arqAtraso} onChange={setArqAtraso} rotulo="Anexar atestado ou comprovante (opcional)" dica="PDF ou foto. Ajuda o administrador a aceitar sua justificativa." />
                      <p className="hint" style={{ margin: 0 }}>Este registro vai para <strong>análise do administrador</strong>. Se aceito, não há desconto; se recusado, desconta apenas o tempo de {previa.status === 'atraso' ? 'atraso' : 'saída antecipada'} (não a diária inteira).</p>
                    </>
                  )}
                  {ctx?.ponto.geofence_ativo && <p className="hint"><MapPin size={14} style={{ verticalAlign: 'middle' }} /> Sua localização será conferida novamente no momento do registro.</p>}
                  <button className="btn block" style={{ minHeight: 50 }} disabled={enviando || !dentro || (exigeJustificativa(previa.status) && just.trim().length < 3)} onClick={confirmar}>
                    {enviando ? 'Registrando…' : 'Confirmar registro'}
                  </button>
                  <button className="btn ghost block" onClick={() => { setEscolha(null); setJust(''); setArqAtraso([]); }}>Cancelar</button>
                </div>
              )}

              {aus && (
                <div className="stack">
                  <div className="section-title">Enviar atestado / justificar falta</div>
                  <Field label="Motivo">
                    <select className="select" value={ausForm.tipo} onChange={e => setAusForm({ ...ausForm, tipo: e.target.value as TipoOcorrencia })}>
                      {(['atestado', 'declaracao', 'audiencia_externa', 'outro'] as TipoOcorrencia[]).map(t => <option key={t} value={t}>{OCORRENCIA_LABEL[t]}</option>)}
                    </select>
                  </Field>
                  <div className="grid c2">
                    <Field label="De"><input className="input" type="date" min={addDays(agora.data, -45)} max={addDays(agora.data, 30)} value={ausForm.inicio} onChange={e => setAusForm({ ...ausForm, inicio: e.target.value, fim: ausForm.fim < e.target.value ? e.target.value : ausForm.fim })} /></Field>
                    <Field label="Até"><input className="input" type="date" min={ausForm.inicio} max={addDays(agora.data, 30)} value={ausForm.fim} onChange={e => setAusForm({ ...ausForm, fim: e.target.value })} /></Field>
                  </div>
                  <Field label="Observação (opcional)"><textarea className="textarea" value={ausForm.obs} onChange={e => setAusForm({ ...ausForm, obs: e.target.value })} placeholder="Ex.: consulta médica, dias de repouso indicados…" /></Field>
                  <SeletorAnexos arquivos={ausArq} onChange={setAusArq} rotulo={ausForm.tipo === 'atestado' ? 'Anexar o atestado (obrigatório)' : 'Anexar comprovante'} dica="PDF ou foto do documento, de até 2 MB. Fotos são reduzidas automaticamente." />
                  <p className="hint" style={{ margin: 0 }}>O administrador vai analisar. <strong>Aceito:</strong> a diária do dia é paga normalmente. <strong>Recusado:</strong> o dia é descontado da folha.</p>
                  <button className="btn gold block" disabled={enviando || !ausForm.inicio || !ausForm.fim || (ausForm.tipo === 'atestado' && ausArq.length === 0)} onClick={enviarAusencia}>{enviando ? 'Enviando…' : 'Enviar para análise'}</button>
                  <button className="btn ghost block" onClick={() => setAus(false)}>Cancelar</button>
                </div>
              )}

              {retro && (
                <div className="stack">
                  <div className="section-title">Ajuste de ponto (vai para aprovação)</div>
                  <div className="grid c2">
                    <div className="field"><label>Data</label><input className="input" type="date" max={addDays(agora.data, -1)} min={addDays(agora.data, -45)} value={retroForm.data} onChange={e => setRetroForm({ ...retroForm, data: e.target.value })} /></div>
                    <div className="field"><label>Horário</label><input className="input" type="time" value={retroForm.hora} onChange={e => setRetroForm({ ...retroForm, hora: e.target.value })} /></div>
                  </div>
                  <div className="field"><label>Marcação</label>
                    <select className="select" value={retroForm.tipo} onChange={e => setRetroForm({ ...retroForm, tipo: e.target.value as TipoMarcacao })}>
                      {(Object.keys(TIPO_MARCACAO_LABEL) as TipoMarcacao[]).map(t => <option key={t} value={t}>{TIPO_MARCACAO_LABEL[t]}</option>)}
                    </select>
                  </div>
                  <div className="field"><label>Justificativa</label><textarea className="textarea" value={retroForm.justificativa} onChange={e => setRetroForm({ ...retroForm, justificativa: e.target.value })} placeholder="Explique o que aconteceu (mín. 5 caracteres)" /></div>
                  <button className="btn gold block" disabled={enviando || !retroForm.data || !retroForm.hora || retroForm.justificativa.trim().length < 5} onClick={enviarRetro}>Enviar para aprovação</button>
                  <button className="btn ghost block" onClick={() => setRetro(false)}>Cancelar</button>
                </div>
              )}

              <div>
                <div className="section-title"><History size={14} style={{ verticalAlign: 'middle' }} /> Últimos registros</div>
                <div className="timeline" style={{ marginTop: 8 }}>
                  {hist.slice(0, 8).map(r => (
                    <div className="tl-item" key={r.id}>
                      <span className={`dot ${r.status_aprovacao === 'rejeitado' ? 'off' : ''}`} />
                      <span className="mono muted">{fmtData(r.data).slice(0, 5)} · {isoParaBR(r.horario_real).hhmm}</span>
                      <span className="grow">{TIPO_MARCACAO_LABEL[r.tipo]}</span>
                      {r.status_aprovacao === 'pendente' ? <span className="badge warn">Em análise</span>
                        : r.status_aprovacao === 'rejeitado' ? <span className="badge bad" title={r.motivo_rejeicao ?? ''}>Rejeitado</span>
                        : r.status === 'atraso' || r.status === 'saida_antecipada'
                          ? <span className={`badge ${r.analise === 'aceita' ? 'ok' : r.analise === 'pendente' ? 'warn' : 'bad'}`} title={r.motivo_decisao ?? ''}>
                            {STATUS_TXT[r.status]}{r.analise ? ` · ${r.analise === 'pendente' ? 'em análise' : r.analise === 'aceita' ? 'aceito' : 'recusado'}` : ''}</span> : null}
                    </div>
                  ))}
                  {!hist.length && <span className="muted">Nenhum registro ainda.</span>}
                </div>
              </div>
              {justs.length > 0 && (
                <div>
                  <div className="section-title"><FilePlus2 size={14} style={{ verticalAlign: 'middle' }} /> Atestados e justificativas enviados</div>
                  <div className="timeline" style={{ marginTop: 8 }}>
                    {justs.slice(0, 5).map(j => (
                      <div className="tl-item" key={j.id}>
                        <span className={`dot ${j.status_analise === 'recusada' ? 'off' : ''}`} />
                        <span className="mono muted">{fmtData(j.data_inicio).slice(0, 5)}{j.data_fim !== j.data_inicio ? `–${fmtData(j.data_fim).slice(0, 5)}` : ''}</span>
                        <span className="grow">{OCORRENCIA_LABEL[j.tipo]}{j.anexos ? ` · ${j.anexos} arquivo(s)` : ''}</span>
                        <span className={`badge ${j.status_analise === 'aceita' ? 'ok' : j.status_analise === 'pendente' ? 'warn' : 'bad'}`} title={j.motivo_decisao ?? ''}>{ANALISE_LABEL[j.status_analise]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
        <Link to="/entrar" className="auth-link">Acesso administrativo <ArrowRight size={15} /></Link>
      </section>
    </div>
  );
}
