-- =====================================================================
-- Correção para bancos que aplicaram a versão inicial do 0001.
-- No Supabase o pgcrypto (crypt, gen_salt) fica no schema "extensions".
-- As funções abaixo precisam enxergá-lo, senão PIN e senhas falham.
-- É idempotente: pode ser executado mais de uma vez.
-- =====================================================================
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

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
