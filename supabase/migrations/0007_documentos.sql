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
