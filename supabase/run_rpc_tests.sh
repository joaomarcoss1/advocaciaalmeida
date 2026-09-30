#!/usr/bin/env bash
# Aplica a migration num Postgres local (com stub do schema auth do Supabase) e roda tests_rpc.sql.
# Uso: PGHOST=/tmp PGPORT=5544 PGUSER=postgres ./supabase/run_rpc_tests.sh
set -euo pipefail
cd "$(dirname "$0")"
P="psql -q -X -v ON_ERROR_STOP=1"
$P -d postgres -c "drop database if exists almeida_test" -c "create database almeida_test" 2>&1 | grep -v NOTICE || true
$P -d almeida_test <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
SQL
$P -d almeida_test -f migrations/0001_almeida_schema.sql
psql -q -X -d almeida_test -f tests_rpc.sql 2>&1 | sed 's/^psql:[^ ]* //' | grep -v '^CONTEXT\|^SQL statement\|^PL/pgSQL'
