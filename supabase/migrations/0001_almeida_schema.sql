-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA
-- Schema completo: tabelas, RLS, RPCs do ponto e dados iniciais.
-- Aplique em um projeto Supabase NOVO (SQL Editor ou `supabase db push`).
-- =====================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------- Cadastros ----------
create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  categoria text not null check (categoria in ('juridico','gerencia','administrativo','estagio','apoio')),
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- dias: {"1": {"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"}, ... "6": {...}}
create table public.escalas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dias jsonb not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.funcionarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  email text,
  telefone text,
  cargo_id uuid references public.cargos(id) on delete set null,
  escala_id uuid references public.escalas(id) on delete set null,
  vinculo text not null default 'clt' check (vinculo in ('clt','estagio','pj','socio')),
  salario_mensal numeric(12,2) not null default 0 check (salario_mensal >= 0),
  data_admissao date not null default current_date,
  data_desligamento date,
  oab text,
  pix text,
  banco text,
  agencia text,
  conta text,
  tipo_conta text,
  tem_pin boolean not null default false,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now()
);

-- O hash do PIN fica isolado: nenhuma policy => inacessível pela API; só as funções abaixo o leem.
create table public.funcionario_pins (
  funcionario_id uuid primary key references public.funcionarios(id) on delete cascade,
  pin_hash text not null,
  atualizado_em timestamptz not null default now()
);
create table public.pin_tentativas (
  id bigserial primary key,
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  sucesso boolean not null,
  created_at timestamptz not null default now()
);
create index on public.pin_tentativas (funcionario_id, created_at desc);

-- ---------- Ponto ----------
create table public.registros_ponto (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('entrada','saida_intervalo','retorno_intervalo','saida')),
  horario_previsto text,
  horario_real timestamptz not null default now(),
  diferenca_minutos int,
  status text not null default 'no_horario'
    check (status in ('no_horario','tolerancia','atraso','saida_antecipada','extra','manual','pendente')),
  justificativa text,
  latitude double precision,
  longitude double precision,
  status_aprovacao text not null default 'aprovado' check (status_aprovacao in ('aprovado','pendente','rejeitado')),
  retroativo boolean not null default false,
  motivo_rejeicao text,
  aprovado_por uuid references auth.users(id),
  aprovado_em timestamptz,
  created_at timestamptz not null default now()
);
create index on public.registros_ponto (funcionario_id, data);
create index on public.registros_ponto (status_aprovacao) where status_aprovacao = 'pendente';

create table public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  data_inicio date not null,
  data_fim date not null,
  tipo text not null check (tipo in ('atestado','declaracao','audiencia_externa','folga_compensacao','ferias','licenca','outro')),
  remunerado boolean not null default true,
  observacao text,
  created_at timestamptz not null default now(),
  check (data_fim >= data_inicio)
);

create table public.feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null unique,
  nome text not null,
  tipo text not null check (tipo in ('nacional','estadual','municipal','facultativo','recesso'))
);

-- ---------- Folha ----------
create table public.ajustes_folha (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('adicional','hora_extra','desconto','adiantamento')),
  valor numeric(12,2) not null default 0 check (valor >= 0),
  quantidade_horas numeric(8,2),
  motivo text not null,
  observacao text,
  created_at timestamptz not null default now()
);

create table public.folhas (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  periodo_inicio date not null,
  periodo_fim date not null,
  salario_mensal numeric(12,2) not null default 0,
  valor_diaria numeric(12,2) not null default 0,
  dias_previstos int not null default 0,
  dias_trabalhados int not null default 0,
  dias_abonados int not null default 0,
  faltas int not null default 0,
  atrasos int not null default 0,
  saidas_antecipadas int not null default 0,
  minutos_atraso int not null default 0,
  dias_extras int not null default 0,
  pendencias int not null default 0,
  horas_extras numeric(8,2) not null default 0,
  valor_bruto numeric(12,2) not null default 0,
  desconto_faltas numeric(12,2) not null default 0,
  desconto_atrasos numeric(12,2) not null default 0,
  adicionais numeric(12,2) not null default 0,
  descontos numeric(12,2) not null default 0,
  valor_final numeric(12,2) not null default 0,
  status text not null default 'aberta' check (status in ('aberta','fechada','paga')),
  detalhe jsonb not null default '[]',
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (funcionario_id, periodo_inicio, periodo_fim)
);

-- ---------- Sistema ----------
create table public.configuracoes (
  id text primary key,
  dados jsonb not null
);

create table public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  papel text not null check (papel in ('admin','gerente')),
  ativo boolean not null default true
);

create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario text not null,
  acao text not null,
  detalhe text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Papéis ----------
create or replace function public.papel_atual() returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(public.papel_atual() = 'admin', false)
$$;
create or replace function public.eh_gestao() returns boolean
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select coalesce(public.papel_atual() in ('admin','gerente'), false)
$$;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['cargos','escalas','funcionarios','funcionario_pins','pin_tentativas','registros_ponto',
    'ocorrencias','feriados','ajustes_folha','folhas','configuracoes','perfis','auditoria']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  -- Administrador: acesso total às tabelas de negócio
  foreach t in array array['cargos','escalas','funcionarios','registros_ponto','ocorrencias','feriados',
    'ajustes_folha','folhas','configuracoes','perfis','auditoria']
  loop
    execute format('create policy "admin total" on public.%I for all to authenticated using (public.eh_admin()) with check (public.eh_admin())', t);
  end loop;
  -- Gerência: leitura de cadastros operacionais e de ponto
  foreach t in array array['cargos','escalas','feriados','configuracoes','registros_ponto','ocorrencias']
  loop
    execute format('create policy "gerencia le" on public.%I for select to authenticated using (public.eh_gestao())', t);
  end loop;
end $$;
-- Gerência também registra/edita ocorrências (atestados, audiências externas...)
create policy "gerencia grava ocorrencias" on public.ocorrencias for insert to authenticated with check (public.eh_gestao());
create policy "gerencia edita ocorrencias" on public.ocorrencias for update to authenticated using (public.eh_gestao()) with check (public.eh_gestao());
create policy "gerencia remove ocorrencias" on public.ocorrencias for delete to authenticated using (public.eh_gestao());
-- Cada usuário lê o próprio perfil (necessário para o login)
create policy "perfil proprio" on public.perfis for select to authenticated using (id = auth.uid());
-- Auditoria: gestão insere
create policy "gestao audita" on public.auditoria for insert to authenticated with check (public.eh_gestao());

-- ---------- Ponto: funções auxiliares ----------
create or replace function public._turno_previsto(p_dias jsonb, p_dow int, p_tipo text) returns text
language sql immutable as $$
  select case when coalesce((p_dias -> p_dow::text ->> 'ativo')::boolean, false)
              then nullif(p_dias -> p_dow::text ->> p_tipo, '') end
$$;

create or replace function public._distancia_m(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language plpgsql immutable as $$
declare a double precision;
begin
  a := sin(radians(lat2 - lat1) / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lon2 - lon1) / 2) ^ 2;
  return 6371000 * 2 * atan2(sqrt(a), sqrt(1 - a));
end $$;

create or replace function public._hhmm_min(p text) returns int language sql immutable as $$
  select split_part(p, ':', 1)::int * 60 + split_part(p, ':', 2)::int
$$;

-- Classificação idêntica à do front (src/lib/ponto.ts)
create or replace function public._classificar(p_tipo text, p_previsto text, p_real_min int, p_tol int, p_lim int, out diferenca int, out status text)
language plpgsql immutable as $$
declare entrando boolean := p_tipo in ('entrada','retorno_intervalo');
begin
  if p_previsto is null then diferenca := 0; status := 'extra'; return; end if;
  diferenca := p_real_min - public._hhmm_min(p_previsto);
  if abs(diferenca) <= p_tol then status := 'no_horario';
  elsif entrando and diferenca >= p_lim then status := 'atraso';
  elsif not entrando and diferenca <= -p_lim then status := 'saida_antecipada';
  elsif not entrando and diferenca > 0 then status := 'extra';
  else status := 'tolerancia';
  end if;
end $$;

-- Valida o PIN com bloqueio de 10 min após 5 erros seguidos.
-- Devolve um código em vez de lançar exceção: uma exceção desfaria a transação e
-- apagaria o registro da tentativa, anulando o bloqueio.
create or replace function public._validar_pin(p_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_hash text; v_ok boolean; v_erros int;
begin
  select count(*) into v_erros from public.pin_tentativas
   where funcionario_id = p_id and not sucesso and created_at > now() - interval '10 minutes'
     and created_at > coalesce((select max(created_at) from public.pin_tentativas where funcionario_id = p_id and sucesso), '-infinity');
  if v_erros >= 5 then return 'PIN_BLOQUEADO'; end if;

  select h.pin_hash into v_hash from public.funcionario_pins h
    join public.funcionarios f on f.id = h.funcionario_id
   where h.funcionario_id = p_id and f.ativo;
  v_ok := v_hash is not null and p_pin is not null and v_hash = crypt(p_pin, v_hash);
  if exists (select 1 from public.funcionarios where id = p_id) then
    insert into public.pin_tentativas (funcionario_id, sucesso) values (p_id, v_ok);
  end if;
  return case when v_ok then 'ok' else 'PIN_INVALIDO' end;
end $$;

create or replace function public._erro(p_codigo text, p_detalhe text default null) returns jsonb
language sql immutable as $$
  select jsonb_build_object('ok', false, 'erro', p_codigo, 'detalhe', p_detalhe)
$$;

-- ---------- Ponto: API pública (chamada sem login, protegida por PIN) ----------
-- As funções abaixo devolvem {"ok": false, "erro": "CODIGO"} para erros de negócio.
create or replace function public.ponto_lista_ativos()
returns table (id uuid, nome text, cargo_nome text, escala_id uuid)
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select f.id, f.nome, c.nome, f.escala_id
    from public.funcionarios f left join public.cargos c on c.id = f.cargo_id
   where f.ativo and f.tem_pin and (f.data_desligamento is null or f.data_desligamento >= current_date)
   order by f.nome
$$;

create or replace function public.ponto_escala(p_escala_id uuid) returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object('id', id, 'nome', nome, 'dias', dias, 'ativo', ativo) from public.escalas where id = p_escala_id
$$;

create or replace function public.ponto_contexto() returns jsonb
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select jsonb_build_object(
    'ponto', coalesce((select dados -> 'ponto' from public.configuracoes where id = 'global'), '{}'::jsonb),
    'escritorio_nome', coalesce((select dados -> 'escritorio' ->> 'nome' from public.configuracoes where id = 'global'), 'Almeida Advocacia & Consultoria'),
    'feriado', (select nome from public.feriados where data = (now() at time zone 'America/Fortaleza')::date)
  )
$$;

create or replace function public.ponto_bater(
  p_func_id uuid, p_pin text, p_tipo text, p_justificativa text default null,
  p_lat double precision default null, p_lng double precision default null
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_pin text; v_pt jsonb; v_local timestamp := now() at time zone 'America/Fortaleza'; v_data date;
  v_min int; v_dias jsonb; v_prev text; v_c record; v_id uuid; v_dist double precision; v_raio int;
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

  insert into public.registros_ponto (funcionario_id, data, tipo, horario_previsto, horario_real, diferenca_minutos,
                                      status, justificativa, latitude, longitude)
  values (p_func_id, v_data, p_tipo, v_prev, now(), v_c.diferenca, v_c.status, nullif(trim(p_justificativa), ''), p_lat, p_lng)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_c.status, 'diferenca_minutos', v_c.diferenca, 'horario_real', now());
end $$;

create or replace function public.ponto_historico(p_func_id uuid, p_pin text, p_limite int default 12) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  return jsonb_build_object('ok', true, 'registros', coalesce((
    select jsonb_agg(to_jsonb(x) order by x.horario_real desc) from (
      select r.id, r.data, r.tipo, r.horario_previsto, r.horario_real, r.diferenca_minutos, r.status, r.justificativa,
             r.status_aprovacao, r.retroativo, r.motivo_rejeicao
        from public.registros_ponto r where r.funcionario_id = p_func_id
       order by r.horario_real desc limit greatest(least(p_limite, 60), 1)) x), '[]'::jsonb));
end $$;

create or replace function public.ponto_retroativo(
  p_func_id uuid, p_pin text, p_data date, p_tipo text, p_hora text, p_justificativa text
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_pin text; v_dias jsonb; v_prev text; v_id uuid; v_diff int; v_hoje date := (now() at time zone 'America/Fortaleza')::date;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  if p_tipo not in ('entrada','saida_intervalo','retorno_intervalo','saida') then return public._erro('TIPO_INVALIDO'); end if;
  if p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' then return public._erro('HORA_INVALIDA'); end if;
  if p_data >= v_hoje then return public._erro('USE_PONTO_NORMAL'); end if;
  if p_data < v_hoje - 45 then return public._erro('DATA_MUITO_ANTIGA'); end if;
  if length(trim(coalesce(p_justificativa, ''))) < 5 then return public._erro('JUSTIFICATIVA_OBRIGATORIA'); end if;
  if exists (select 1 from public.registros_ponto where funcionario_id = p_func_id and data = p_data
              and tipo = p_tipo and status_aprovacao <> 'rejeitado') then
    return public._erro('JA_REGISTRADO');
  end if;
  select e.dias into v_dias from public.escalas e join public.funcionarios f on f.escala_id = e.id where f.id = p_func_id;
  v_prev := public._turno_previsto(v_dias, extract(dow from p_data)::int, p_tipo);
  v_diff := case when v_prev is null then 0 else public._hhmm_min(p_hora) - public._hhmm_min(v_prev) end;
  insert into public.registros_ponto (funcionario_id, data, tipo, horario_previsto, horario_real, diferenca_minutos,
                                      status, justificativa, status_aprovacao, retroativo)
  values (p_func_id, p_data, p_tipo, v_prev, ((p_data::text || ' ' || p_hora || ':00-03')::timestamptz), v_diff,
          'pendente', trim(p_justificativa), 'pendente', true)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ---------- Gestão ----------
create or replace function public.aprovar_ponto(p_id uuid, p_acao text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare r public.registros_ponto; v_c record; v_pt jsonb;
begin
  if not public.eh_gestao() then raise exception 'SEM_PERMISSAO'; end if;
  if p_acao not in ('aprovar','rejeitar') then raise exception 'ACAO_INVALIDA'; end if;
  if p_acao = 'rejeitar' and length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'MOTIVO_OBRIGATORIO'; end if;
  select * into r from public.registros_ponto where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if p_acao = 'aprovar' then
    select coalesce(dados -> 'ponto', '{}'::jsonb) into v_pt from public.configuracoes where id = 'global';
    select * into v_c from public._classificar(r.tipo, r.horario_previsto,
       (extract(hour from r.horario_real at time zone 'America/Fortaleza')::int * 60 + extract(minute from r.horario_real at time zone 'America/Fortaleza')::int),
       coalesce((v_pt ->> 'tolerancia_min')::int, 5), coalesce((v_pt ->> 'limite_atraso_min')::int, 30));
    update public.registros_ponto set status_aprovacao = 'aprovado', status = v_c.status, diferenca_minutos = v_c.diferenca,
           aprovado_em = now(), aprovado_por = auth.uid(), motivo_rejeicao = null where id = p_id;
  else
    update public.registros_ponto set status_aprovacao = 'rejeitado', motivo_rejeicao = trim(p_motivo),
           aprovado_em = now(), aprovado_por = auth.uid() where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- Equipe sem dados sensíveis (salário, CPF, banco) para a gerência
create or replace function public.equipe()
returns table (id uuid, nome text, cargo_id uuid, escala_id uuid, ativo boolean, data_admissao date,
               data_desligamento date, vinculo text, tem_pin boolean)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_gestao() then raise exception 'SEM_PERMISSAO'; end if;
  return query select f.id, f.nome, f.cargo_id, f.escala_id, f.ativo, f.data_admissao, f.data_desligamento, f.vinculo, f.tem_pin
                 from public.funcionarios f order by f.nome;
end $$;

create or replace function public.definir_pin(p_func_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN_FORMATO'; end if;
  insert into public.funcionario_pins (funcionario_id, pin_hash) values (p_func_id, crypt(p_pin, gen_salt('bf')))
  on conflict (funcionario_id) do update set pin_hash = excluded.pin_hash, atualizado_em = now();
  update public.funcionarios set tem_pin = true where id = p_func_id;
  delete from public.pin_tentativas where funcionario_id = p_func_id;
end $$;

-- ---------- Permissões das funções ----------
revoke all on function public._validar_pin(uuid, text) from public, anon, authenticated;
revoke all on function public._erro(text, text) from public, anon, authenticated;
revoke all on function public.definir_pin(uuid, text) from public, anon;
revoke all on function public.aprovar_ponto(uuid, text, text) from public, anon;
revoke all on function public.equipe() from public, anon;
grant execute on function public.ponto_lista_ativos() to anon, authenticated;
grant execute on function public.ponto_escala(uuid) to anon, authenticated;
grant execute on function public.ponto_contexto() to anon, authenticated;
grant execute on function public.ponto_bater(uuid, text, text, text, double precision, double precision) to anon, authenticated;
grant execute on function public.ponto_historico(uuid, text, int) to anon, authenticated;
grant execute on function public.ponto_retroativo(uuid, text, date, text, text, text) to anon, authenticated;
grant execute on function public.definir_pin(uuid, text) to authenticated;
grant execute on function public.aprovar_ponto(uuid, text, text) to authenticated;
grant execute on function public.equipe() to authenticated;

-- ---------- Dados iniciais ----------
insert into public.cargos (nome, categoria, descricao) values
  ('Sócio(a) Administrador(a)', 'gerencia', 'Direção do escritório'),
  ('Gerente Administrativo(a)', 'gerencia', 'Gestão de equipe, escalas, aprovação de ponto e rotinas internas'),
  ('Gerente Jurídico(a)', 'gerencia', 'Coordenação técnica da equipe de advogados'),
  ('Advogado(a) Associado(a)', 'juridico', 'Atuação contenciosa e consultiva'),
  ('Estagiário(a) de Direito', 'estagio', 'Apoio jurídico, protocolo e acompanhamento processual'),
  ('Assistente Jurídico(a)', 'juridico', 'Elaboração de peças, cálculos e organização de processos'),
  ('Secretário(a) / Recepcionista', 'administrativo', 'Atendimento a clientes, agenda e recepção'),
  ('Auxiliar Administrativo(a)', 'administrativo', 'Rotinas financeiras, arquivo e documentos'),
  ('Serviços Gerais', 'apoio', 'Limpeza, copa e apoio operacional');

insert into public.escalas (nome, dias) values
  ('Comercial · Seg–Sex 08h–18h, Sáb 08h–12h',
   '{"1":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
     "2":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
     "3":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
     "4":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
     "5":{"ativo":true,"entrada":"08:00","saida_intervalo":"12:00","retorno_intervalo":"14:00","saida":"18:00"},
     "6":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"12:00"}}'),
  ('Estágio · Seg–Sex 08h–14h',
   '{"1":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
     "2":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
     "3":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
     "4":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
     "5":{"ativo":true,"entrada":"08:00","saida_intervalo":"","retorno_intervalo":"","saida":"14:00"},
     "6":{"ativo":false,"entrada":"","saida_intervalo":"","retorno_intervalo":"","saida":""}}'),
  ('Apoio · Seg–Sáb 07h–13h',
   '{"1":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
     "2":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
     "3":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
     "4":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
     "5":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"},
     "6":{"ativo":true,"entrada":"07:00","saida_intervalo":"","retorno_intervalo":"","saida":"13:00"}}');

insert into public.configuracoes (id, dados) values ('global', '{
  "escritorio": {"nome":"Almeida Advocacia & Consultoria","cnpj":"","endereco":"","cidade":"Codó - MA","telefone":"","email":"","oab_sociedade":""},
  "ponto": {"tolerancia_min":5,"limite_atraso_min":30,"geofence_ativo":true,"geofence_lat":-4.460791217811178,"geofence_lng":-43.88809954417763,"geofence_raio_m":900,"geofence_endereco":"Posto FC - Av. Augusto Teixeira, S/N, R. São Sebastião, 02 - Sala 02, Codó - MA, 65400-000"},
  "folha": {"periodicidade":"mensal","descontar_atrasos":false,"hora_extra_pct":50}
}');

-- ---------- Primeiro administrador ----------
-- 1) Crie o usuário em Authentication > Users (e-mail + senha).
-- 2) Rode (troque o e-mail):
--    insert into public.perfis (id, nome, email, papel)
--    select id, 'Administrador', email, 'admin' from auth.users where email = 'seu@email.com';
