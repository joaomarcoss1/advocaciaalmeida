-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · ATUALIZAÇÃO DEFINITIVA
-- Rode UMA vez no Supabase → SQL Editor → New query → Run.
-- Seguro: não apaga nada, não mexe em dados, não altera PINs nem senhas.
-- Pode ser executado mais de uma vez (idempotente).
--   1) corrige "function gen_salt(unknown) does not exist" (salvar PIN)
--   2) instala a gestão de acessos (criar admin master / gerência no sistema)
--   3) instala diária fixa, ajuste de dias e edição de marcações
---- =====================================================================

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

-- 4) atualiza o cache da API do Supabase para reconhecer as novas funções/tabelas
notify pgrst, 'reload schema';

-- Conferência (deve listar o master como admin e as 4 funções de acesso)
select p.email, p.papel, p.ativo from public.perfis p order by p.email;
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('criar_usuario','atualizar_usuario','redefinir_senha_usuario','remover_usuario','definir_pin') order by 1;
