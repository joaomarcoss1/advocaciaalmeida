import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Coffee, Delete, History, LogIn, LogOut, MapPin, RotateCcw, Search, Undo2 } from 'lucide-react';
import marcaOuro from '@/assets/marca-ouro.png';
import monograma from '@/assets/monograma-ouro.png';
import { getDb, PONTO_ERRO_MSG, type ContextoPonto, type MarcacaoHistorico, type PessoaPonto } from '@/data/db';
import { addDays, agoraBR, fmtData, isoParaBR, type AgoraBR } from '@/lib/datetime';
import { iniciais, minParaHoras, semAcento } from '@/lib/format';
import { classificar, exigeJustificativa, previstoDoTipo, proximoTipo, sequenciaDoDia, turnoDaData } from '@/lib/ponto';
import { TIPO_MARCACAO_LABEL, type Escala, type TipoMarcacao } from '@/lib/types';

const ICONE: Record<TipoMarcacao, typeof LogIn> = { entrada: LogIn, saida_intervalo: Coffee, retorno_intervalo: Undo2, saida: LogOut };
const STATUS_TXT: Record<string, string> = {
  no_horario: 'No horário', tolerancia: 'Dentro da tolerância', atraso: 'Atraso', saida_antecipada: 'Saída antecipada', extra: 'Fora da escala / hora extra',
};

type Etapa = 'pessoa' | 'pin' | 'painel';

export default function BaterPonto() {
  const [pessoas, setPessoas] = useState<PessoaPonto[]>([]);
  const [ctx, setCtx] = useState<ContextoPonto | null>(null);
  const [modo, setModo] = useState<'local' | 'supabase'>('local');
  const [busca, setBusca] = useState('');
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
  const [sucesso, setSucesso] = useState<{ tipo: TipoMarcacao; status: string; hora: string; dif: number } | null>(null);
  const [retro, setRetro] = useState(false);
  const [retroForm, setRetroForm] = useState({ data: '', tipo: 'entrada' as TipoMarcacao, hora: '', justificativa: '' });
  const [retroOk, setRetroOk] = useState(false);
  const ocioso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    getDb().then(async db => { setModo(db.modo); setPessoas(await db.ponto.listarAtivos()); setCtx(await db.ponto.contexto()); });
    const t = setInterval(() => setAgora(agoraBR()), 1000);
    return () => clearInterval(t);
  }, []);

  const voltar = useCallback(() => {
    setEtapa('pessoa'); setPessoa(null); setPin(''); setErro(''); setHist([]); setEscolha(null); setJust('');
    setSucesso(null); setRetro(false); setRetroOk(false); setBusca('');
  }, []);

  // Trava de segurança: volta à lista após 2 min sem interação no painel
  useEffect(() => {
    if (etapa === 'pessoa') return;
    clearTimeout(ocioso.current);
    ocioso.current = setTimeout(voltar, 120_000);
    return () => clearTimeout(ocioso.current);
  }, [etapa, escolha, just, sucesso, retro, hist, pin, voltar]);

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

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    // Com o banco real, a lista pública não aparece inteira: só depois de digitar o começo do nome.
    if (modo === 'supabase' && q.length < 2) return [];
    return pessoas.filter(p => !q || semAcento(p.nome).includes(q));
  }, [pessoas, busca, modo]);

  async function escolherPessoa(p: PessoaPonto) {
    setPessoa(p); setEtapa('pin'); setPin(''); setErro('');
    const db = await getDb();
    setEscala(p.escala_id ? await db.ponto.escala(p.escala_id) : null);
  }

  async function carregarHistorico(fid: string, pinAtual: string) {
    const db = await getDb();
    const r = await db.ponto.historico(fid, pinAtual, 30);
    if (!r.ok) { setErro(PONTO_ERRO_MSG[r.erro]); return false; }
    setHist(r.registros);
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

  async function obterGps(): Promise<{ lat: number; lng: number } | null> {
    if (!ctx?.ponto.geofence_ativo) return null;
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error(PONTO_ERRO_MSG.GPS_OBRIGATORIO));
      navigator.geolocation.getCurrentPosition(
        p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => rej(new Error(PONTO_ERRO_MSG.GPS_OBRIGATORIO)),
        { enableHighAccuracy: true, timeout: 12000 },
      );
    });
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
        return;
      }
      setSucesso({ tipo: escolha, status: r.status, hora: isoParaBR(r.horario_real).hhmm, dif: r.diferenca_minutos });
      setEscolha(null); setJust('');
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
    <div className="auth">
      <section className="stage">
        <img className="stage-logo" src={marcaOuro} alt="Almeida Advocacia & Consultoria" />
        <div className="stage-clock" aria-label={`Hora atual ${agora.hhmm}`}>
          <div className="hora">{hh}<span className="sep">:</span>{mm}</div>
          <div className="dia">{dataExtenso}</div>
          {ctx?.feriado && <span className="feriado">Feriado · {ctx.feriado}</span>}
        </div>
        <div className="stage-foot">Codó · Maranhão</div>
        <img className="mark" src={monograma} alt="" />
      </section>

      <section className="auth-side">
        <div className="auth-card">
          {etapa === 'pessoa' && (
            <>
              <span className="eyebrow">Registro de ponto</span>
              <h1>Quem está registrando?</h1>
              <div style={{ position: 'relative', marginTop: 22 }}>
                <Search size={18} style={{ position: 'absolute', left: 15, top: 14, color: 'var(--muted)' }} />
                <input className="input" style={{ paddingLeft: 44, minHeight: 50 }} placeholder="Buscar seu nome…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar seu nome" />
              </div>
              <div className="person-list">
                {filtradas.map(p => (
                  <button key={p.id} className="person" onClick={() => escolherPessoa(p)}>
                    <span className="avatar">{iniciais(p.nome)}</span>
                    <span className="grow"><strong>{p.nome}</strong><br /><span className="muted" style={{ fontSize: '.86rem' }}>{p.cargo_nome ?? 'Equipe'}</span></span>
                    <ArrowRight size={18} color="var(--gold-600)" />
                  </button>
                ))}
                {!filtradas.length && <div className="empty">{!pessoas.length ? 'Nenhum funcionário com PIN cadastrado.' : modo === 'supabase' && busca.trim().length < 2 ? 'Digite as primeiras letras do seu nome.' : 'Ninguém encontrado.'}</div>}
              </div>
            </>
          )}

          {etapa === 'pin' && pessoa && (
            <div className="stack" style={{ gap: 18 }}>
              <div>
                <span className="eyebrow">Olá, {primeiro}</span>
                <h1>Digite seu PIN</h1>
              </div>
              <div className="pin-dots" aria-label={`${pin.length} dígitos digitados`}>
                {Array.from({ length: Math.max(6, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
              </div>
              {erro && <div className="notice bad" role="alert">{erro}</div>}
              <div className="keypad">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} onClick={() => setPin(p => (p.length < 8 ? p + d : p))}>{d}</button>)}
                <button className="aux" onClick={() => setPin('')}>Limpar</button>
                <button onClick={() => setPin(p => (p.length < 8 ? p + '0' : p))}>0</button>
                <button className="aux" aria-label="Apagar" onClick={() => setPin(p => p.slice(0, -1))}><Delete size={22} /></button>
              </div>
              <button className="btn gold block" style={{ minHeight: 52 }} disabled={pin.length < 4 || enviando} onClick={validarPin}>{enviando ? 'Verificando…' : 'Continuar'}</button>
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
                <div className="notice ok" role="status">
                  <Check size={18} style={{ verticalAlign: 'middle' }} /> <strong>{TIPO_MARCACAO_LABEL[sucesso.tipo]} registrada às {sucesso.hora}.</strong><br />
                  {STATUS_TXT[sucesso.status]}{sucesso.dif !== 0 && sucesso.status !== 'extra' ? ` (${sucesso.dif > 0 ? '+' : '−'}${minParaHoras(sucesso.dif)})` : ''}
                </div>
              )}
              {retroOk && <div className="notice gold" role="status">Solicitação enviada. A gerência vai analisar o ajuste do seu ponto.</div>}
              {erro && <div className="notice bad" role="alert">{erro}</div>}

              {!retro && !escolha && (
                <>
                  {!turnoHoje && <div className="notice gold">Hoje não é dia de expediente na sua escala. As marcações serão registradas como extras.</div>}
                  <div className="stack" style={{ gap: 10 }}>
                    {sequencia.map(t => {
                      const Ic = ICONE[t];
                      const feita = hojeRegs.find(r => r.tipo === t);
                      return (
                        <button key={t} className={`acao ${t === proximo ? 'next' : ''}`} disabled={!!feita} onClick={() => { setEscolha(t); setErro(''); setSucesso(null); }}>
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
                      <span>Previsto <strong className="serif" style={{ fontSize: '1.5rem' }}>{previa.previsto ?? '—'}</strong></span>
                      <span>Agora <strong className="serif" style={{ fontSize: '1.5rem' }}>{agora.hhmm}</strong></span>
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
                  {ctx?.ponto.geofence_ativo && <p className="hint"><MapPin size={14} style={{ verticalAlign: 'middle' }} /> Sua localização será verificada.</p>}
                  <button className="btn gold block" style={{ minHeight: 52 }} disabled={enviando || (exigeJustificativa(previa.status) && just.trim().length < 3)} onClick={confirmar}>
                    {enviando ? 'Registrando…' : 'Confirmar registro'}
                  </button>
                  <button className="btn ghost block" onClick={() => { setEscolha(null); setJust(''); }}>Cancelar</button>
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
                        : r.status === 'atraso' || r.status === 'saida_antecipada' ? <span className="badge bad">{STATUS_TXT[r.status]}</span> : null}
                    </div>
                  ))}
                  {!hist.length && <span className="muted">Nenhum registro ainda.</span>}
                </div>
              </div>
            </div>
          )}
        </div>
        <Link to="/entrar" className="auth-link">Acesso administrativo <ArrowRight size={15} /></Link>
      </section>
    </div>
  );
}
