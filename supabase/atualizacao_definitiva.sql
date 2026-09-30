-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · ATUALIZAÇÃO DEFINITIVA
-- Rode UMA vez no Supabase → SQL Editor → New query → Run.
-- Seguro: não apaga nada, não mexe em dados, não altera PINs nem senhas.
-- Pode ser executado mais de uma vez (idempotente).
--   1) corrige "function gen_salt(unknown) does not exist" (salvar PIN)
--   2) instala a gestão de acessos (criar admin master / gerência no sistema)
--   3) instala diária fixa, ajuste de dias e edição de marcações
--   4) ativa a cerca de GPS: ponto só até 900 m do escritório
--   5) segurança: busca de funcionário no servidor, PIN de 6+ dígitos, bloqueio por origem,
--      auditoria automática e imutável, senha forte, verificação em duas etapas no servidor
--   6) autenticidade de documentos: código + QR Code nos PDFs
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
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
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
  if length(coalesce(p_senha, '')) < 10 then raise exception 'SENHA_CURTA'; end if;
  if p_senha !~ '[A-Za-z]' or p_senha !~ '[0-9]' then raise exception 'SENHA_FRACA'; end if;
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

-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · endurecimento de segurança
--  1) busca de funcionário no servidor (a lista completa deixa de ser pública)
--  2) PIN de 6 a 8 dígitos, sem sequências óbvias; bloqueio por origem (IP)
--  3) auditoria automática por gatilhos e imutável
--  4) política de senha forte para usuários do painel (ver 0002)
-- Idempotente.
-- =====================================================================

-- ---------- 1) Busca no servidor ----------
create or replace function public._norm(p text) returns text
language sql immutable as $$
  select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ', 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'))
$$;

create or replace function public.ponto_buscar(p_termo text)
returns table (id uuid, nome text, cargo_nome text, escala_id uuid)
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare v text := replace(replace(replace(public._norm(trim(coalesce(p_termo, ''))), '\', ''), '%', ''), '_', '');
begin
  if length(v) < 3 then return; end if;              -- mínimo de 3 letras: não dá para listar a equipe
  return query
    select f.id, f.nome, c.nome, f.escala_id
      from public.funcionarios f left join public.cargos c on c.id = f.cargo_id
     where f.ativo and f.tem_pin and (f.data_desligamento is null or f.data_desligamento >= current_date)
       and public._norm(f.nome) like '%' || v || '%'
     order by f.nome limit 5;
end $$;

revoke all on function public.ponto_lista_ativos() from public, anon, authenticated;
revoke all on function public.ponto_buscar(text) from public;
grant execute on function public.ponto_buscar(text) to anon, authenticated;

-- ---------- 2) PIN: origem da chamada, bloqueio e força ----------
alter table public.pin_tentativas add column if not exists origem text not null default '';
create index if not exists pin_tentativas_origem_idx on public.pin_tentativas (origem, created_at desc);

-- IP de quem chamou (o PostgREST expõe os cabeçalhos da requisição). Vazio se indisponível.
create or replace function public._origem() returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then return '';
  end;
  return left(trim(split_part(coalesce(h ->> 'x-forwarded-for', h ->> 'x-real-ip', ''), ',', 1)), 64);
end $$;

-- Bloqueios (10 min): 5 erros da mesma origem para a mesma pessoa; 15 erros da mesma origem em qualquer pessoa;
-- 25 erros de origens diferentes para a mesma pessoa (ataque distribuído). Um colega não consegue travar o outro.
create or replace function public._validar_pin(p_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_hash text; v_ok boolean; v_origem text := public._origem(); v_ult timestamptz;
begin
  select coalesce(max(created_at), '-infinity') into v_ult from public.pin_tentativas
   where funcionario_id = p_id and sucesso and origem = v_origem;
  if (select count(*) from public.pin_tentativas where funcionario_id = p_id and origem = v_origem and not sucesso
        and created_at > now() - interval '10 minutes' and created_at > v_ult) >= 5 then return 'PIN_BLOQUEADO'; end if;
  if v_origem <> '' and (select count(*) from public.pin_tentativas where origem = v_origem and not sucesso
        and created_at > now() - interval '10 minutes') >= 15 then return 'PIN_BLOQUEADO'; end if;
  if (select count(*) from public.pin_tentativas where funcionario_id = p_id and not sucesso
        and created_at > now() - interval '10 minutes') >= 25 then return 'PIN_BLOQUEADO'; end if;

  select h.pin_hash into v_hash from public.funcionario_pins h
    join public.funcionarios f on f.id = h.funcionario_id
   where h.funcionario_id = p_id and f.ativo;
  v_ok := v_hash is not null and p_pin is not null and v_hash = crypt(p_pin, v_hash);
  if exists (select 1 from public.funcionarios where id = p_id) then
    insert into public.pin_tentativas (funcionario_id, sucesso, origem) values (p_id, v_ok, v_origem);
  end if;
  return case when v_ok then 'ok' else 'PIN_INVALIDO' end;
end $$;

-- Marca quem ainda tem PIN antigo de 4 a 5 dígitos (só na primeira execução).
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'funcionarios' and column_name = 'pin_curto') then
    alter table public.funcionarios add column pin_curto boolean not null default false;
    update public.funcionarios set pin_curto = true where tem_pin;
  end if;
end $$;

create or replace function public.definir_pin(p_func_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not public.eh_admin() then raise exception 'SEM_PERMISSAO'; end if;
  if p_pin !~ '^[0-9]{6,8}$' then raise exception 'PIN_FORMATO'; end if;
  if p_pin ~ '^(\d)\1+$' or position(p_pin in '01234567890123456789') > 0 or position(p_pin in '98765432109876543210') > 0
     or p_pin ~ '^(\d\d)\1+$' or p_pin ~ '^(\d\d\d)\1+$' or p_pin in ('123123', '112233', '121212', '654321') then
    raise exception 'PIN_FRACO';
  end if;
  insert into public.funcionario_pins (funcionario_id, pin_hash) values (p_func_id, crypt(p_pin, gen_salt('bf')))
  on conflict (funcionario_id) do update set pin_hash = excluded.pin_hash, atualizado_em = now();
  update public.funcionarios set tem_pin = true, pin_curto = false where id = p_func_id;
  delete from public.pin_tentativas where funcionario_id = p_func_id;
end $$;
revoke all on function public.definir_pin(uuid, text) from public, anon;
grant execute on function public.definir_pin(uuid, text) to authenticated;

-- ---------- 3) Auditoria por gatilhos, imutável ----------
alter table public.auditoria
  add column if not exists tabela text, add column if not exists registro_id text,
  add column if not exists antes jsonb, add column if not exists depois jsonb, add column if not exists origem text;

create or replace function public._rotulo_registro(p_tabela text, p_row jsonb) returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select case p_tabela
    when 'registros_ponto' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '') || ' ' || coalesce(p_row ->> 'data', '')
    when 'ajustes_dia' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'data', '')
    when 'ajustes_folha' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '')
    when 'folhas' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'periodo_inicio', '')
    when 'ocorrencias' then coalesce((select nome from public.funcionarios where id = (p_row ->> 'funcionario_id')::uuid), '?') || ' · ' || coalesce(p_row ->> 'tipo', '')
    else coalesce(p_row ->> 'nome', p_row ->> 'email', p_row ->> 'data', p_row ->> 'id', '')
  end
$$;

create or replace function public._trg_auditar() returns trigger
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_antes jsonb; v_depois jsonb; v_campos text; v_usuario text; v_acao text; v_ref jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, v_old -> k), jsonb_object_agg(k, v_new -> k), string_agg(k, ', ' order by k)
      into v_antes, v_depois, v_campos
      from jsonb_object_keys(v_new) k where v_new -> k is distinct from v_old -> k;
    if v_campos is null then return new; end if;                -- nada mudou
  elsif tg_op = 'INSERT' then v_depois := v_new;
  else v_antes := v_old; end if;

  select nome || ' <' || email || '>' into v_usuario from public.perfis where id = auth.uid();
  v_usuario := coalesce(v_usuario, case when auth.uid() is null then 'Sistema (PIN / painel)' else auth.uid()::text end);
  v_acao := case tg_op when 'INSERT' then 'Criado' when 'UPDATE' then 'Alterado' else 'Excluído' end || ' · ' || tg_table_name;
  insert into public.auditoria (usuario, acao, detalhe, tabela, registro_id, antes, depois, origem)
  values (v_usuario, v_acao, left(public._rotulo_registro(tg_table_name, v_ref) || coalesce(' · campos: ' || v_campos, ''), 500),
          tg_table_name, v_ref ->> 'id', v_antes, v_depois, nullif(public._origem(), ''));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['cargos','escalas','funcionarios','registros_ponto','ocorrencias','feriados','ajustes_folha','ajustes_dia','folhas','configuracoes','perfis']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_auditar on public.%I', t);
      execute format('create trigger trg_auditar after insert or update or delete on public.%I for each row execute function public._trg_auditar()', t);
    end if;
  end loop;
end $$;

create or replace function public._bloqueia_auditoria() returns trigger
language plpgsql as $$ begin raise exception 'AUDITORIA_IMUTAVEL'; end $$;
drop trigger if exists auditoria_imutavel on public.auditoria;
create trigger auditoria_imutavel before update or delete on public.auditoria for each row execute function public._bloqueia_auditoria();

-- administrador só lê; a gravação vem dos gatilhos e das telas (inserção da gestão)
drop policy if exists "admin total" on public.auditoria;
drop policy if exists "admin le auditoria" on public.auditoria;
create policy "admin le auditoria" on public.auditoria for select to authenticated using (public.eh_admin());
revoke update, delete, truncate on public.auditoria from anon, authenticated;
revoke all on function public._trg_auditar() from public, anon, authenticated;
revoke all on function public._rotulo_registro(text, jsonb) from public, anon, authenticated;
revoke all on function public._origem() from public, anon, authenticated;
create index if not exists auditoria_created_idx on public.auditoria (created_at desc);

-- ---------- 5) papel_atual: definição simples ----------
-- (Uma versão anterior deste arquivo exigia verificação em duas etapas; ela foi removida.
--  Reaplicar esta função garante que bancos que rodaram a versão anterior voltem ao normal.)
create or replace function public.papel_atual() returns text
language sql stable security definer set search_path = public, extensions, pg_temp as $$
  select papel from public.perfis where id = auth.uid() and ativo
$$;

-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · autenticidade de documentos
-- Cada PDF emitido (folha, demonstrativo, frequência, espelho) recebe um código e um QR Code.
-- A página pública /verificar/<código> confirma que o documento foi emitido pelo sistema,
-- mostrando tipo, período, totais e o hash — sem dados pessoais. Idempotente.
-- =====================================================================
create table if not exists public.documentos_emitidos (
  codigo text primary key,
  tipo text not null check (tipo in ('folha', 'holerite', 'frequencia', 'espelho')),
  titulo text not null,
  periodo text not null,
  resumo jsonb not null default '{}'::jsonb,
  hash text not null,
  emitido_por text not null,
  emitido_em timestamptz not null default now()
);
alter table public.documentos_emitidos enable row level security;
drop policy if exists "admin le documentos" on public.documentos_emitidos;
create policy "admin le documentos" on public.documentos_emitidos for select to authenticated using (public.eh_admin());
revoke insert, update, delete, truncate on public.documentos_emitidos from anon, authenticated;

-- Registra o documento. O código nasce no navegador (assim o PDF sempre sai com QR, mesmo sem conexão ou
-- antes desta atualização) e é registrado aqui de forma idempotente: repetir a chamada com o mesmo código e o
-- mesmo hash não duplica. Sem código informado, o servidor gera um (48 bits aleatórios).
drop function if exists public.registrar_documento(text, text, text, jsonb, text);
create or replace function public.registrar_documento(p_tipo text, p_titulo text, p_periodo text, p_resumo jsonb, p_hash text, p_codigo text default null)
returns text language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_codigo text := upper(trim(coalesce(p_codigo, ''))); v_papel text := public.papel_atual(); v_hash text;
begin
  if v_papel is null then raise exception 'SEM_PERMISSAO'; end if;
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'HASH_INVALIDO'; end if;
  if v_codigo <> '' then
    if v_codigo !~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then raise exception 'CODIGO_INVALIDO'; end if;
    select hash into v_hash from public.documentos_emitidos where codigo = v_codigo;
    if found then
      if v_hash = p_hash then return v_codigo; end if;       -- repetição idempotente
      raise exception 'CODIGO_EXISTE';
    end if;
  else
    loop
      v_codigo := upper(encode(gen_random_bytes(6), 'hex'));
      v_codigo := substr(v_codigo, 1, 4) || '-' || substr(v_codigo, 5, 4) || '-' || substr(v_codigo, 9, 4);
      exit when not exists (select 1 from public.documentos_emitidos where codigo = v_codigo);
    end loop;
  end if;
  insert into public.documentos_emitidos (codigo, tipo, titulo, periodo, resumo, hash, emitido_por)
  values (v_codigo, p_tipo, left(p_titulo, 160), left(p_periodo, 160), coalesce(p_resumo, '{}'::jsonb), p_hash,
          case v_papel when 'admin' then 'Administração' else 'Gerência' end);
  return v_codigo;
end $$;

-- Consulta pública por código (sem login). Devolve só o necessário para conferir o documento.
create or replace function public.verificar_documento(p_codigo text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions, pg_temp as $$
declare d public.documentos_emitidos;
begin
  select * into d from public.documentos_emitidos where codigo = upper(trim(coalesce(p_codigo, '')));
  if not found then return jsonb_build_object('ok', false); end if;
  return jsonb_build_object('ok', true, 'codigo', d.codigo, 'tipo', d.tipo, 'titulo', d.titulo, 'periodo', d.periodo,
                            'resumo', d.resumo, 'hash', d.hash, 'emitido_por', d.emitido_por, 'emitido_em', d.emitido_em);
end $$;

revoke all on function public.registrar_documento(text, text, text, jsonb, text, text) from public, anon;
grant execute on function public.registrar_documento(text, text, text, jsonb, text, text) to authenticated;
revoke all on function public.verificar_documento(text) from public;
grant execute on function public.verificar_documento(text) to anon, authenticated;

-- Atualiza o cache da API do Supabase para reconhecer as novas funções/tabelas
notify pgrst, 'reload schema';

-- Conferência: deve listar as funções de acesso e a cerca de GPS ativa (raio 900)
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('criar_usuario','atualizar_usuario','redefinir_senha_usuario','remover_usuario','definir_pin','ponto_bater','ponto_buscar','registrar_documento','verificar_documento') order by 1;
select dados -> 'ponto' ->> 'geofence_ativo' as cerca_ativa, dados -> 'ponto' ->> 'geofence_raio_m' as raio_m from public.configuracoes where id = 'global';
