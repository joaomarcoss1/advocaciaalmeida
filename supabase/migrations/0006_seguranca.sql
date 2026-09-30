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
