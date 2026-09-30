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
