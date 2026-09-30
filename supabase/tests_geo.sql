-- Cerca de GPS: 900 m ao redor do escritório (Posto FC, Codó-MA)
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1','geo@x') on conflict do nothing;
do $$
declare v_local timestamp := now() at time zone 'America/Fortaleza'; d jsonb := '{}'; i int;
begin
  for i in 0..6 loop d := d || jsonb_build_object(i::text, jsonb_build_object('ativo', true, 'entrada', to_char(v_local, 'HH24:MI'), 'saida_intervalo','', 'retorno_intervalo','', 'saida','23:59')); end loop;
  insert into public.escalas (id, nome, dias) values ('00000000-0000-0000-0000-00000000e0a1', 'GEO', d) on conflict do nothing;
  insert into public.funcionarios (id, nome, salario_mensal, escala_id, vinculo) values ('00000000-0000-0000-0000-00000000f0a1','Geo Teste',2000,'00000000-0000-0000-0000-00000000e0a1','clt') on conflict do nothing;
  insert into public.perfis (id, nome, email, papel) values ('00000000-0000-0000-0000-0000000000c1','Geo','geo@x','admin') on conflict do nothing;
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select 'pin:' || (public.definir_pin('00000000-0000-0000-0000-00000000f0a1','864209') is not null);
reset role;
update public.configuracoes set dados = jsonb_set(dados, '{ponto,geofence_ativo}', 'true') where id = 'global';
select 'config: ' || (dados -> 'ponto' ->> 'geofence_ativo') || ' raio=' || (dados -> 'ponto' ->> 'geofence_raio_m') || ' lat=' || (dados -> 'ponto' ->> 'geofence_lat') from public.configuracoes where id = 'global';
set role anon;
\echo == sem GPS -> GPS_OBRIGATORIO
select public.ponto_bater('00000000-0000-0000-0000-00000000f0a1','864209','entrada') ->> 'erro';
\echo == 5 km do escritório -> FORA_DA_AREA
select public.ponto_bater('00000000-0000-0000-0000-00000000f0a1','864209','entrada', null, -4.505, -43.888) ->> 'erro';
\echo == 1,2 km (fora do raio de 900 m) -> FORA_DA_AREA
select public.ponto_bater('00000000-0000-0000-0000-00000000f0a1','864209','entrada', null, -4.460791 + 0.0108, -43.888099) -> 'detalhe';
\echo == coordenadas inválidas -> GPS_OBRIGATORIO
select public.ponto_bater('00000000-0000-0000-0000-00000000f0a1','864209','entrada', null, 999, 999) ->> 'erro';
\echo == a 850 m (dentro) -> ok
select public.ponto_bater('00000000-0000-0000-0000-00000000f0a1','864209','entrada', null, -4.460791 + 0.00765, -43.888099) ->> 'ok';
reset role;
select 'gravou lat/lng: ' || count(*) from public.registros_ponto where funcionario_id = '00000000-0000-0000-0000-00000000f0a1' and latitude is not null;
\echo == admin muda o centro (config sem lat/lng) -> usa o escritório como padrão
update public.configuracoes set dados = jsonb_set(dados, '{ponto}', (dados -> 'ponto') - 'geofence_lat' - 'geofence_lng') where id = 'global';
set role anon;
select public.ponto_bater('00000000-0000-0000-0000-00000000f0a1','864209','saida', 'sair cedo teste', -4.60, -43.9) ->> 'erro';
reset role;
\echo == cerca desativada -> qualquer lugar
update public.configuracoes set dados = jsonb_set(dados, '{ponto,geofence_ativo}', 'false') where id = 'global';
set role anon;
select public.ponto_bater('00000000-0000-0000-0000-00000000f0a1','864209','saida', 'sair cedo teste', -4.60, -43.9) ->> 'ok';
reset role;
