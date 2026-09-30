-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · ATUALIZAÇÃO DEFINITIVA
-- Rode UMA vez no Supabase → SQL Editor → New query → Run.
-- Seguro: não apaga nada, não mexe em dados, não altera PINs nem senhas.
-- Pode ser executado mais de uma vez (idempotente).
--   1) corrige "function gen_salt(unknown) does not exist" (salvar PIN)
--   2) instala a gestão de acessos (criar admin master / gerência no sistema)
--   3) instala diária fixa, ajuste de dias e edição de marcações
--   4) ativa a cerca de GPS: ponto só até 900 m do escritório
-- =====================================================================

-- 0) localiza o pgcrypto onde quer que ele esteja e garante o schema "extensions"
create schema if not exists extensions;
do $$
declare v_schema text;
begin
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  if v_schema is null then
    create extension pgcrypto with schema extensions;
  elsif v_schema not in ('extensions', 'public') then
    alter extension pgcrypto set schema extensions;
  end if;
end $$;

-- 1) funções passam a enxergar o pgcrypto (PIN e senhas)
alter function public.papel_atual() set search_path = public, extensions, pg_temp;
alter function public.eh_admin() set search_path = public, extensions, pg_temp;
alter function public.eh_gestao() set search_path = public, extensions, pg_temp;
alter function public._validar_pin(uuid, text) set search_path = public, extensions, pg_temp;
alter function public.ponto_lista_ativos() set search_path = public, extensions, pg_temp;
alter function public.ponto_escala(uuid) set search_path = public, extensions, pg_temp;
alter function public.ponto_contexto() set search_path = public, extensions, pg_temp;
alter function public.ponto_bater(uuid, text, text, text, double precision, double precision) set search_path = public, extensions, pg_temp;
alter function public.ponto_historico(uuid, text, integer) set search_path = public, extensions, pg_temp;
alter function public.ponto_retroativo(uuid, text, date, text, text, text) set search_path = public, extensions, pg_temp;
alter function public.aprovar_ponto(uuid, text, text) set search_path = public, extensions, pg_temp;
alter function public.equipe() set search_path = public, extensions, pg_temp;
alter function public.definir_pin(uuid, text) set search_path = public, extensions, pg_temp;

-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · gestão de acessos
-- O administrador cria usuários, define quem é admin/gerência, redefine
-- senhas e remove acessos direto pelo sistema (Configurações → Acessos).
-- As funções gravam em auth.users, por isso rodam como SECURITY DEFINER e
-- só respondem a quem tem perfil 'admin'.
-- =====================================================================

create or replace function public._admins_ativos() returns int
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select count(*)::int from public.perfis where papel = 'admin' and ativo
$$;

create or replace function public.criar_usuario(p_email text, p_senha text, p_nome text, p_papel text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_id uuid := gen_random_uuid(); v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('admin', 'gerente') then raise exception 'PAPEL_INVALIDO'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'EMAIL_INVALIDO'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'SENHA_CURTA'; end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then raise exception 'NOME_OBRIGATORIO'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'EMAIL_EXISTE'; end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email, crypt(p_senha, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id, jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true), 'email', v_id::text, now(), now(), now());
  insert into public.perfis (id, nome, email, papel) values (v_id, trim(p_nome), v_email, p_papel);
  insert into public.auditoria (usuario, acao, detalhe) values (coalesce((select nome from public.perfis where id = auth.uid()), 'admin'), 'Acesso criado', v_email || ' (' || p_papel || ')');
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.atualizar_usuario(p_id uuid, p_nome text, p_papel text, p_ativo boolean) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_papel not in ('admin', 'gerente') then raise exception 'PAPEL_INVALIDO'; end if;
  update public.perfis set nome = coalesce(nullif(trim(p_nome), ''), nome), papel = p_papel, ativo = p_ativo where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if public._admins_ativos() < 1 then raise exception 'ULTIMO_ADMIN'; end if;   -- desfaz a transação
  insert into public.auditoria (usuario, acao, detalhe)
  values (coalesce((select nome from public.perfis where id = auth.uid()), 'admin'), 'Acesso alterado', (select email from public.perfis where id = p_id) || ' → ' || p_papel || case when p_ativo then '' else ' (inativo)' end);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.redefinir_senha_usuario(p_id uuid, p_senha text) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'SENHA_CURTA'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  insert into public.auditoria (usuario, acao, detalhe)
  values (coalesce((select nome from public.perfis where id = auth.uid()), 'admin'), 'Senha redefinida', (select email from public.perfis where id = p_id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.remover_usuario(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_email text;
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_id = auth.uid() then raise exception 'NAO_REMOVER_A_SI'; end if;
  select email into v_email from public.perfis where id = p_id;
  delete from auth.users where id = p_id;
  if not found then raise exception 'NAO_ENCONTRADO'; end if;
  if public._admins_ativos() < 1 then raise exception 'ULTIMO_ADMIN'; end if;
  insert into public.auditoria (usuario, acao, detalhe)
  values (coalesce((select nome from public.perfis where id = auth.uid()), 'admin'), 'Acesso removido', v_email);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public._admins_ativos() from public, anon, authenticated;
revoke all on function public.criar_usuario(text, text, text, text) from public, anon;
revoke all on function public.atualizar_usuario(uuid, text, text, boolean) from public, anon;
revoke all on function public.redefinir_senha_usuario(uuid, text) from public, anon;
revoke all on function public.remover_usuario(uuid) from public, anon;
grant execute on function public.criar_usuario(text, text, text, text) to authenticated;
grant execute on function public.atualizar_usuario(uuid, text, text, boolean) to authenticated;
grant execute on function public.redefinir_senha_usuario(uuid, text) to authenticated;
grant execute on function public.remover_usuario(uuid) to authenticated;

-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · edição manual da folha
--  * funcionarios.diaria_fixa: valor de diária definido à mão (opcional)
--  * ajustes_dia: corrige um dia (presente / abonado / falta) sobre o ponto
--  * gerência pode lançar e corrigir marcações de ponto
-- Idempotente: pode ser executado mais de uma vez.
-- =====================================================================
alter table public.funcionarios
  add column if not exists diaria_fixa numeric(12,2) check (diaria_fixa is null or diaria_fixa >= 0);

create table if not exists public.ajustes_dia (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  data date not null,
  situacao text not null check (situacao in ('presente', 'abonado', 'falta')),
  observacao text,
  created_at timestamptz not null default now(),
  unique (funcionario_id, data)
);
alter table public.ajustes_dia enable row level security;
drop policy if exists "admin total" on public.ajustes_dia;
create policy "admin total" on public.ajustes_dia for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists "gerencia le" on public.ajustes_dia;
create policy "gerencia le" on public.ajustes_dia for select to authenticated using (public.eh_gestao());

drop policy if exists "gerencia grava registros" on public.registros_ponto;
create policy "gerencia grava registros" on public.registros_ponto for insert to authenticated with check (public.eh_gestao());
drop policy if exists "gerencia edita registros" on public.registros_ponto;
create policy "gerencia edita registros" on public.registros_ponto for update to authenticated using (public.eh_gestao()) with check (public.eh_gestao());

-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · cerca de GPS (geofence)
-- O ponto só é registrado dentro de 900 m do escritório (Posto FC, Codó-MA).
--  * ponto_bater passa a falhar "fechado" (sem coordenadas configuradas usa o escritório)
--  * ativa a cerca com o endereço/coordenadas do escritório na primeira execução;
--    se o administrador já definiu a localização pelo sistema, NÃO sobrescreve.
-- Idempotente.
-- =====================================================================
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

update public.configuracoes
   set dados = jsonb_set(coalesce(dados, '{}'::jsonb), '{ponto}',
         coalesce(dados -> 'ponto', '{}'::jsonb) || jsonb_build_object(
           'geofence_ativo', true,
           'geofence_lat', -4.460791217811178,
           'geofence_lng', -43.88809954417763,
           'geofence_raio_m', 900,
           'geofence_endereco', 'Posto FC - Av. Augusto Teixeira, S/N, R. São Sebastião, 02 - Sala 02, Codó - MA, 65400-000'))
 where id = 'global' and not (coalesce(dados -> 'ponto', '{}'::jsonb) ? 'geofence_endereco');

insert into public.configuracoes (id, dados)
select 'global', jsonb_build_object('ponto', jsonb_build_object(
  'tolerancia_min', 5, 'limite_atraso_min', 30, 'geofence_ativo', true,
  'geofence_lat', -4.460791217811178, 'geofence_lng', -43.88809954417763, 'geofence_raio_m', 900,
  'geofence_endereco', 'Posto FC - Av. Augusto Teixeira, S/N, R. São Sebastião, 02 - Sala 02, Codó - MA, 65400-000'))
where not exists (select 1 from public.configuracoes where id = 'global');

grant execute on function public.ponto_bater(uuid, text, text, text, double precision, double precision) to anon, authenticated;

-- Atualiza o cache da API do Supabase para reconhecer as novas funções/tabelas
notify pgrst, 'reload schema';

-- Conferência: deve listar as funções de acesso e a cerca de GPS ativa (raio 900)
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('criar_usuario','atualizar_usuario','redefinir_senha_usuario','remover_usuario','definir_pin','ponto_bater') order by 1;
select dados -> 'ponto' ->> 'geofence_ativo' as cerca_ativa, dados -> 'ponto' ->> 'geofence_raio_m' as raio_m from public.configuracoes where id = 'global';
