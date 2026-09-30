-- Segurança: busca, PIN forte, bloqueio por origem e auditoria imutável
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1','seg@x') on conflict do nothing;
insert into public.perfis (id, nome, email, papel) values ('00000000-0000-0000-0000-0000000000d1','Admin Seg','seg@x','admin') on conflict do nothing;
insert into public.funcionarios (id, nome, salario_mensal, vinculo) values
 ('00000000-0000-0000-0000-00000000d001','José Álvaro Conceição',2000,'clt'),
 ('00000000-0000-0000-0000-00000000d002','Joana Dark',2000,'clt'),
 ('00000000-0000-0000-0000-00000000d003','Joaquim Silva',2000,'clt'),
 ('00000000-0000-0000-0000-00000000d004','Joelma Souza',2000,'clt'),
 ('00000000-0000-0000-0000-00000000d005','Jonas Reis',2000,'clt'),
 ('00000000-0000-0000-0000-00000000d006','Jorge Lima',2000,'clt') on conflict do nothing;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
\echo == PIN: 4 dígitos, sequência, repetido e ok
select public.definir_pin('00000000-0000-0000-0000-00000000d001','1234');
select public.definir_pin('00000000-0000-0000-0000-00000000d001','123456');
select public.definir_pin('00000000-0000-0000-0000-00000000d001','111111');
select public.definir_pin('00000000-0000-0000-0000-00000000d001','654321');
select public.definir_pin('00000000-0000-0000-0000-00000000d001','482913') is null as pin_forte_aceito;
select public.definir_pin(id,'739105') is null from public.funcionarios where id::text like '00000000-0000-0000-0000-00000000d00%' and id <> '00000000-0000-0000-0000-00000000d001';
reset role;
select 'pin_curto d001=' || pin_curto from public.funcionarios where id = '00000000-0000-0000-0000-00000000d001';
\echo == busca: anon
set role anon; reset request.jwt.claim.sub;
select 'lista_ativos anon: ' || (select count(*) from (select public.ponto_lista_ativos()) x);
select 'busca 2 letras: ' || count(*) from public.ponto_buscar('jo');
select 'busca "jose alvaro" (sem acento): ' || count(*) from public.ponto_buscar('jose alvaro');
select 'busca "JOSÉ" (acento/maiúscula): ' || count(*) from public.ponto_buscar('JOSÉ');
select 'busca "joa": ' || count(*) from public.ponto_buscar('joa');
select 'busca curinga %%%: ' || count(*) from public.ponto_buscar('%%%');
select 'anon lê funcionarios: ' || count(*) from public.funcionarios;
\echo == bloqueio por origem
reset role;
select set_config('request.headers', '{"x-forwarded-for":"10.0.0.1, 172.16.0.5"}', false);
set role anon;
select public.ponto_bater('00000000-0000-0000-0000-00000000d001','000000','entrada') ->> 'erro' from generate_series(1,5);
select 'origem A, 6ª tentativa (deve bloquear): ' || (public.ponto_bater('00000000-0000-0000-0000-00000000d001','482913','entrada') ->> 'erro');
reset role;
select set_config('request.headers', '{"x-forwarded-for":"10.0.0.2"}', false);
set role anon;
select 'origem B, PIN certo (deve passar o PIN): ' || coalesce(public.ponto_bater('00000000-0000-0000-0000-00000000d001','482913','entrada') ->> 'erro', 'ok/sem erro');
reset role;
\echo == bloqueio por origem em várias pessoas (15 erros)
select set_config('request.headers', '{"x-forwarded-for":"10.0.0.9"}', false);
set role anon;
select count(*) filter (where (r ->> 'erro') = 'PIN_INVALIDO') as inval, count(*) filter (where (r ->> 'erro') = 'PIN_BLOQUEADO') as bloq
from (select public.ponto_bater(('00000000-0000-0000-0000-00000000d00' || n)::uuid, '000000', 'entrada') as r from generate_series(1,6) n, generate_series(1,3) k order by n limit 18) z;
reset role;
select set_config('request.headers', '', false);
\echo == auditoria por gatilho
update public.funcionarios set salario_mensal = 2500, pix = 'a@b.c' where id = '00000000-0000-0000-0000-00000000d002';
select acao, detalhe, antes, depois from public.auditoria where tabela = 'funcionarios' and registro_id = '00000000-0000-0000-0000-00000000d002' and acao like 'Alterado%' order by created_at desc limit 1;
select 'audit de ponto (anon): ' || count(*) from public.auditoria where tabela = 'registros_ponto' and usuario like 'Sistema%';
update public.funcionarios set nome = nome where id = '00000000-0000-0000-0000-00000000d002';
select 'update sem mudança não audita: ' || count(*) from public.auditoria where tabela = 'funcionarios' and registro_id = '00000000-0000-0000-0000-00000000d002' and acao like 'Alterado%';
\echo == auditoria imutável
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
delete from public.auditoria;
update public.auditoria set detalhe = 'x';
select 'admin lê auditoria: ' || (count(*) > 0) from public.auditoria;
reset role;
delete from public.auditoria where true;
\echo == 2FA: com autenticador verificado, sessão aal1 perde o papel; aal2 mantém
insert into auth.mfa_factors (user_id, status) values ('00000000-0000-0000-0000-0000000000d1', 'verified');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
set request.jwt.claims = '{"aal":"aal1"}';
select 'aal1 papel: ' || coalesce(public.papel_atual(), 'NENHUM') || ' · lê funcionarios: ' || (select count(*) from public.funcionarios);
set request.jwt.claims = '{"aal":"aal2"}';
select 'aal2 papel: ' || coalesce(public.papel_atual(), 'NENHUM') || ' · lê funcionarios: ' || (select count(*) > 0 from public.funcionarios);
reset role; reset request.jwt.claims;
delete from auth.mfa_factors where user_id = '00000000-0000-0000-0000-0000000000d1';
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
select 'sem autenticador (aal1): ' || coalesce(public.papel_atual(), 'NENHUM');
reset role;
