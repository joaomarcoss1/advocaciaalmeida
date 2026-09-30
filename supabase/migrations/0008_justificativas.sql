-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · atestados, atrasos e anexos
--  * o funcionário anexa PDF/foto (atestado) e envia justificativa de falta pelo app de ponto
--  * faltas com atestado e atrasos/saídas antecipadas vão para a aba Ocorrências, onde SÓ o administrador decide
--  * aceito  -> diária paga / sem desconto de atraso
--  * recusado -> desconta a diária (falta) / desconta só os minutos do atraso
-- Os arquivos ficam no banco (tabela anexos), lidos apenas pelo administrador. Idempotente.
-- =====================================================================
alter table public.ocorrencias
  add column if not exists status_analise text not null default 'aceita' check (status_analise in ('pendente', 'aceita', 'recusada')),
  add column if not exists origem text not null default 'painel' check (origem in ('painel', 'funcionario')),
  add column if not exists motivo_decisao text,
  add column if not exists decidido_por uuid,
  add column if not exists decidido_em timestamptz;
create index if not exists ocorrencias_pendentes_idx on public.ocorrencias (status_analise) where status_analise = 'pendente';

alter table public.registros_ponto
  add column if not exists analise text check (analise in ('pendente', 'aceita', 'recusada')),
  add column if not exists motivo_decisao text,
  add column if not exists decidido_por uuid,
  add column if not exists decidido_em timestamptz;
create index if not exists registros_analise_idx on public.registros_ponto (analise) where analise = 'pendente';

create table if not exists public.anexos (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  ocorrencia_id uuid references public.ocorrencias(id) on delete cascade,
  registro_id uuid references public.registros_ponto(id) on delete cascade,
  nome text not null,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  tamanho int not null,
  conteudo text not null,               -- arquivo em base64
  created_at timestamptz not null default now(),
  check ((ocorrencia_id is not null) <> (registro_id is not null))
);
create index if not exists anexos_ocorrencia_idx on public.anexos (ocorrencia_id);
create index if not exists anexos_registro_idx on public.anexos (registro_id);
alter table public.anexos enable row level security;
drop policy if exists "admin le anexos" on public.anexos;
create policy "admin le anexos" on public.anexos for select to authenticated using (public.eh_admin());
drop policy if exists "admin remove anexos" on public.anexos;
create policy "admin remove anexos" on public.anexos for delete to authenticated using (public.eh_admin());
revoke insert, update, truncate on public.anexos from anon, authenticated;

-- Só o administrador decide; a decisão registra quem e quando.
create or replace function public._trg_decisao_ocorrencia() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.status_analise is distinct from old.status_analise then
    if not public.eh_admin() then raise exception 'SO_ADMINISTRADOR'; end if;
    new.decidido_por := auth.uid(); new.decidido_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_decisao on public.ocorrencias;
create trigger trg_decisao before update on public.ocorrencias for each row execute function public._trg_decisao_ocorrencia();

create or replace function public._trg_decisao_registro() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if new.analise is distinct from old.analise then
    if not public.eh_admin() then raise exception 'SO_ADMINISTRADOR'; end if;
    new.decidido_por := auth.uid(); new.decidido_em := now();
  end if;
  return new;
end $$;
drop trigger if exists trg_decisao on public.registros_ponto;
create trigger trg_decisao before update on public.registros_ponto for each row execute function public._trg_decisao_registro();

-- Ponto: atraso/saída antecipada acima do limite entra em análise
create or replace function public.ponto_bater(
  p_func_id uuid, p_pin text, p_tipo text, p_justificativa text default null,
  p_lat double precision default null, p_lng double precision default null
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_pin text; v_pt jsonb; v_local timestamp := now() at time zone 'America/Fortaleza'; v_data date;
  v_min int; v_dias jsonb; v_prev text; v_c record; v_id uuid; v_dist double precision; v_raio int; v_analise text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  if p_tipo not in ('entrada','saida_intervalo','retorno_intervalo','saida') then return public._erro('TIPO_INVALIDO'); end if;
  v_data := v_local::date;
  v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  select coalesce(dados -> 'ponto', '{}'::jsonb) into v_pt from public.configuracoes where id = 'global';
  v_pt := coalesce(v_pt, '{}'::jsonb);

  -- Cerca de GPS: só registra dentro do raio do escritório. O servidor recalcula a distância (o navegador é só conveniência).
  if coalesce((v_pt ->> 'geofence_ativo')::boolean, false) then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return public._erro('GPS_OBRIGATORIO'); end if;
    v_raio := coalesce(nullif((v_pt ->> 'geofence_raio_m')::int, 0), 900);
    -- sem coordenadas configuradas, usa o endereço do escritório (nunca "abre" a cerca por falta de dado)
    v_dist := public._distancia_m(p_lat, p_lng,
      coalesce((v_pt ->> 'geofence_lat')::double precision, -4.460791217811178),
      coalesce((v_pt ->> 'geofence_lng')::double precision, -43.88809954417763));
    if v_dist > v_raio then return public._erro('FORA_DA_AREA', format('%s m (máx. %s m)', round(v_dist), v_raio)); end if;
  end if;

  if exists (select 1 from public.registros_ponto where funcionario_id = p_func_id and data = v_data
              and tipo = p_tipo and status_aprovacao <> 'rejeitado') then
    return public._erro('JA_REGISTRADO');
  end if;

  select e.dias into v_dias from public.escalas e join public.funcionarios f on f.escala_id = e.id where f.id = p_func_id;
  v_prev := public._turno_previsto(v_dias, extract(dow from v_data)::int, p_tipo);
  select * into v_c from public._classificar(p_tipo, v_prev, v_min,
      coalesce((v_pt ->> 'tolerancia_min')::int, 5), coalesce((v_pt ->> 'limite_atraso_min')::int, 30));

  if v_c.status in ('atraso','saida_antecipada') and length(trim(coalesce(p_justificativa, ''))) < 3 then
    return public._erro('JUSTIFICATIVA_OBRIGATORIA', v_c.status);
  end if;

  -- Atraso ou saída antecipada acima do limite vai para análise do administrador (aba Ocorrências).
  v_analise := case when v_c.status in ('atraso','saida_antecipada') then 'pendente' end;

  insert into public.registros_ponto (funcionario_id, data, tipo, horario_previsto, horario_real, diferenca_minutos,
                                      status, justificativa, latitude, longitude, analise)
  values (p_func_id, v_data, p_tipo, v_prev, now(), v_c.diferenca, v_c.status, nullif(trim(p_justificativa), ''), p_lat, p_lng, v_analise)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_c.status, 'diferenca_minutos', v_c.diferenca, 'horario_real', now(), 'analise', v_analise);
end $$;

-- Histórico do funcionário: agora com o resultado da análise e as justificativas de falta enviadas por ele
create or replace function public.ponto_historico(p_func_id uuid, p_pin text, p_limite int default 12) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  return jsonb_build_object('ok', true,
    'registros', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.horario_real desc) from (
        select r.id, r.data, r.tipo, r.horario_previsto, r.horario_real, r.diferenca_minutos, r.status, r.justificativa,
               r.status_aprovacao, r.retroativo, r.motivo_rejeicao, r.analise, r.motivo_decisao
          from public.registros_ponto r where r.funcionario_id = p_func_id
         order by r.horario_real desc limit greatest(least(p_limite, 60), 1)) x), '[]'::jsonb),
    'justificativas', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (
        select o.id, o.data_inicio, o.data_fim, o.tipo, o.status_analise, o.motivo_decisao, o.observacao, o.created_at,
               (select count(*) from public.anexos a where a.ocorrencia_id = o.id)::int as anexos
          from public.ocorrencias o where o.funcionario_id = p_func_id and o.origem = 'funcionario'
         order by o.created_at desc limit 10) o), '[]'::jsonb));
end $$;

-- Funcionário envia justificativa de ausência (atestado etc.). Fica pendente até o administrador decidir.
create or replace function public.ponto_justificar_ausencia(p_func_id uuid, p_pin text, p_inicio date, p_fim date, p_tipo text, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_hoje date := (now() at time zone 'America/Fortaleza')::date; v_id uuid;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  if p_tipo not in ('atestado', 'declaracao', 'audiencia_externa', 'outro') then return public._erro('TIPO_INVALIDO'); end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio or p_fim - p_inicio > 30 then return public._erro('PERIODO_INVALIDO'); end if;
  if p_inicio < v_hoje - 45 then return public._erro('DATA_MUITO_ANTIGA'); end if;
  if p_fim > v_hoje + 30 then return public._erro('PERIODO_INVALIDO'); end if;
  if length(coalesce(p_obs, '')) > 600 then return public._erro('PERIODO_INVALIDO'); end if;
  if exists (select 1 from public.ocorrencias where funcionario_id = p_func_id and status_analise <> 'recusada'
               and data_inicio <= p_fim and data_fim >= p_inicio) then
    return public._erro('JA_REGISTRADO');
  end if;
  insert into public.ocorrencias (funcionario_id, data_inicio, data_fim, tipo, remunerado, observacao, origem, status_analise)
  values (p_func_id, p_inicio, p_fim, p_tipo, true, nullif(trim(p_obs), ''), 'funcionario', 'pendente')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- Anexa um arquivo (PDF ou foto) a uma justificativa de falta OU a um atraso do próprio funcionário.
create or replace function public.ponto_anexar(p_func_id uuid, p_pin text, p_registro_id uuid, p_ocorrencia_id uuid, p_nome text, p_mime text, p_conteudo text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_id uuid; v_ok boolean := false; v_n int; v_prefixo text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  if (p_registro_id is null) = (p_ocorrencia_id is null) then return public._erro('NAO_ENCONTRADO'); end if;
  if p_mime not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then return public._erro('ARQUIVO_INVALIDO'); end if;
  if p_conteudo is null or length(p_conteudo) < 40 or length(p_conteudo) > 3300000 or p_conteudo !~ '^[A-Za-z0-9+/]+={0,2}$' then
    return public._erro('ARQUIVO_INVALIDO', 'Arquivo vazio, corrompido ou maior que 2 MB');
  end if;
  v_prefixo := case p_mime when 'application/pdf' then 'JVBER' when 'image/jpeg' then '/9j/' when 'image/png' then 'iVBOR' else 'UklGR' end;
  if left(p_conteudo, length(v_prefixo)) <> v_prefixo then return public._erro('ARQUIVO_INVALIDO', 'O conteúdo não corresponde ao tipo do arquivo'); end if;

  if p_ocorrencia_id is not null then
    select true into v_ok from public.ocorrencias where id = p_ocorrencia_id and funcionario_id = p_func_id and origem = 'funcionario' and status_analise = 'pendente';
    select count(*) into v_n from public.anexos where ocorrencia_id = p_ocorrencia_id;
  else
    select true into v_ok from public.registros_ponto where id = p_registro_id and funcionario_id = p_func_id
       and analise = 'pendente' and created_at > now() - interval '48 hours';
    select count(*) into v_n from public.anexos where registro_id = p_registro_id;
  end if;
  if not coalesce(v_ok, false) then return public._erro('NAO_ENCONTRADO'); end if;
  if v_n >= 4 then return public._erro('LIMITE_ANEXOS'); end if;

  insert into public.anexos (funcionario_id, ocorrencia_id, registro_id, nome, mime, tamanho, conteudo)
  values (p_func_id, p_ocorrencia_id, p_registro_id, left(regexp_replace(coalesce(p_nome, 'arquivo'), '[^A-Za-z0-9._ ()-]', '_', 'g'), 120),
          p_mime, (length(p_conteudo) * 3 / 4)::int, p_conteudo)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public._trg_decisao_ocorrencia() from public, anon, authenticated;
revoke all on function public._trg_decisao_registro() from public, anon, authenticated;
revoke all on function public.ponto_justificar_ausencia(uuid, text, date, date, text, text) from public;
revoke all on function public.ponto_anexar(uuid, text, uuid, uuid, text, text, text) from public;
grant execute on function public.ponto_bater(uuid, text, text, text, double precision, double precision) to anon, authenticated;
grant execute on function public.ponto_historico(uuid, text, int) to anon, authenticated;
grant execute on function public.ponto_justificar_ausencia(uuid, text, date, date, text, text) to anon, authenticated;
grant execute on function public.ponto_anexar(uuid, text, uuid, uuid, text, text, text) to anon, authenticated;
