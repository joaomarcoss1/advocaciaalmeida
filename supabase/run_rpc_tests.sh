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
$P -d almeida_test <<'SQL'
create table auth.identities (id uuid primary key, user_id uuid references auth.users(id) on delete cascade, identity_data jsonb, provider text, provider_id text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
alter table auth.users add column instance_id uuid, add column aud text, add column role text, add column encrypted_password text, add column email_confirmed_at timestamptz,
  add column raw_app_meta_data jsonb, add column raw_user_meta_data jsonb, add column created_at timestamptz, add column updated_at timestamptz,
  add column confirmation_token text, add column recovery_token text, add column email_change_token_new text, add column email_change text;
SQL
$P -d almeida_test -f migrations/0001_almeida_schema.sql
$P -d almeida_test -f migrations/0002_gestao_usuarios.sql
$P -d almeida_test -f migrations/0003_corrige_search_path.sql
$P -d almeida_test -f migrations/0004_ajustes_manuais.sql
$P -d almeida_test -f migrations/0005_geofence.sql
$P -d almeida_test -f migrations/0005_geofence.sql   # idempotência
$P -d almeida_test -f migrations/0004_ajustes_manuais.sql   # idempotência
for f in tests_rpc.sql tests_usuarios.sql tests_folha.sql tests_geo.sql; do psql -q -X -d almeida_test -f $f 2>&1 | sed 's/^psql:[^ ]* //' | grep -v '^CONTEXT\|^SQL statement\|^PL/pgSQL'; done
