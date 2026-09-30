import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Coffee, History, LogIn, LogOut, MapPin, RotateCcw, Search, Undo2 } from 'lucide-react';
import logo from '@/assets/logo-vertical.webp';
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
    getDb().then(async db => { setPessoas(await db.ponto.listarAtivos()); setCtx(await db.ponto.contexto()); });
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

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    return pessoas.filter(p => !q || semAcento(p.nome).includes(q));
  }, [pessoas, busca]);

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

  return (
    <div className="hero">
      <img className="hero-logo" src={logo} alt="Almeida Advocacia & Consultoria" />
      <div className="panel">
        <div className="clock mono" aria-label="Hora atual">{agora.hhmm}</div>
        <div className="clock-date">{dataExtenso}</div>
        {ctx?.feriado && <div className="badge gold" style={{ display: 'flex', justifyContent: 'center', marginTop: 12, padding: '6px' }}>Hoje é feriado: {ctx.feriado}</div>}

        {etapa === 'pessoa' && (
          <div style={{ marginTop: 20 }}>
            <div className="section-title">Quem está registrando o ponto?</div>
            <div style={{ position: 'relative', marginTop: 10 }}>
              <Search size={18} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
              <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar seu nome…" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar seu nome" />
            </div>
            <div className="person-list">
              {filtradas.map(p => (
                <button key={p.id} className="person" onClick={() => escolherPessoa(p)}>
                  <span className="avatar">{iniciais(p.nome)}</span>
                  <span className="grow"><strong>{p.nome}</strong><br /><span className="muted" style={{ fontSize: '.86rem' }}>{p.cargo_nome ?? 'Equipe'}</span></span>
                </button>
              ))}
              {!filtradas.length && <div className="empty">{pessoas.length ? 'Ninguém encontrado.' : 'Nenhum funcionário com PIN cadastrado.'}</div>}
            </div>
          </div>
        )}

        {etapa === 'pin' && pessoa && (
          <form style={{ marginTop: 20 }} className="stack" onSubmit={e => { e.preventDefault(); validarPin(); }}>
            <div className="row"><span className="avatar">{iniciais(pessoa.nome)}</span><div><strong>{pessoa.nome}</strong><br /><span className="muted">{pessoa.cargo_nome}</span></div></div>
            <div className="field">
              <label htmlFor="pin">Digite seu PIN</label>
              <input id="pin" className="input pin-input" type="password" inputMode="numeric" autoComplete="off" autoFocus maxLength={8}
                value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} />
            </div>
            {erro && <div className="badge bad" role="alert" style={{ padding: '8px 12px', borderRadius: 10, whiteSpace: 'normal' }}>{erro}</div>}
            <button className="btn block" disabled={pin.length < 4 || enviando}>{enviando ? 'Verificando…' : 'Continuar'}</button>
            <button type="button" className="btn ghost block" onClick={voltar}><ArrowLeft size={16} />Não sou eu</button>
          </form>
        )}

        {etapa === 'painel' && pessoa && (
          <div style={{ marginTop: 20 }} className="stack">
            <div className="row between">
              <div className="row"><span className="avatar">{iniciais(pessoa.nome)}</span><div><strong>{pessoa.nome}</strong><br /><span className="muted">{escala ? escala.nome : 'Sem escala definida'}</span></div></div>
              <button className="btn ghost sm" onClick={voltar}>Sair</button>
            </div>

            {sucesso && (
              <div className="badge ok" style={{ padding: '14px 16px', borderRadius: 12, display: 'block', whiteSpace: 'normal' }} role="status">
                <Check size={18} style={{ verticalAlign: 'middle' }} /> <strong>{TIPO_MARCACAO_LABEL[sucesso.tipo]} registrada às {sucesso.hora}.</strong><br />
                {STATUS_TXT[sucesso.status]}{sucesso.dif !== 0 && sucesso.status !== 'extra' ? ` (${sucesso.dif > 0 ? '+' : '−'}${minParaHoras(sucesso.dif)})` : ''}
              </div>
            )}
            {retroOk && <div className="badge gold" style={{ padding: '12px 14px', borderRadius: 12, display: 'block', whiteSpace: 'normal' }} role="status">Solicitação enviada. A gerência vai analisar o ajuste do seu ponto.</div>}
            {erro && <div className="badge bad" role="alert" style={{ padding: '8px 12px', borderRadius: 10, whiteSpace: 'normal' }}>{erro}</div>}

            {!retro && !escolha && (
              <>
                {!turnoHoje && <div className="badge warn" style={{ padding: '8px 12px', whiteSpace: 'normal' }}>Hoje não é dia de expediente na sua escala. Marcações serão registradas como extras.</div>}
                <div className="stack" style={{ gap: 8 }}>
                  {sequencia.map(t => {
                    const Ic = ICONE[t];
                    const feita = hojeRegs.find(r => r.tipo === t);
                    return (
                      <button key={t} className={`acao ${t === proximo ? 'next' : ''}`} disabled={!!feita} onClick={() => { setEscolha(t); setErro(''); setSucesso(null); }}>
                        <Ic size={22} />
                        <span className="grow">
                          <span className="t">{TIPO_MARCACAO_LABEL[t]}</span><br />
                          <span className="s">{feita ? `Registrada às ${isoParaBR(feita.horario_real).hhmm}${feita.status_aprovacao === 'pendente' ? ' · aguardando aprovação' : ''}` : `Previsto ${previstoDoTipo(turnoHoje, t) ?? '—'}`}</span>
                        </span>
                        {feita && <Check size={20} />}
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
                  <div className="row between" style={{ marginTop: 8 }}>
                    <span>Previsto: <strong>{previa.previsto ?? '—'}</strong></span>
                    <span>Agora: <strong>{agora.hhmm}</strong></span>
                  </div>
                  <div style={{ marginTop: 8 }}>
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
                <button className="btn gold block" disabled={enviando || (exigeJustificativa(previa.status) && just.trim().length < 3)} onClick={confirmar}>
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
              <div className="timeline" style={{ marginTop: 10 }}>
                {hist.slice(0, 8).map(r => (
                  <div className="tl-item" key={r.id}>
                    <span className={`dot ${r.status_aprovacao === 'rejeitado' ? 'off' : ''}`} />
                    <span className="mono">{fmtData(r.data).slice(0, 5)} {isoParaBR(r.horario_real).hhmm}</span>
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
      <Link to="/entrar" style={{ color: 'var(--gold)', marginTop: 22, letterSpacing: '.08em', fontSize: '.9rem' }}>ACESSO ADMINISTRATIVO →</Link>
    </div>
  );
}
