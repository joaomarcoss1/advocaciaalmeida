-- Permissões e integridade das edições manuais (0004). Rodado por run_rpc_tests.sh.
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1','adm3@x'), ('00000000-0000-0000-0000-0000000000d2','ger3@x');
insert into public.perfis (id, nome, email, papel) values
 ('00000000-0000-0000-0000-0000000000d1','Admin 3','adm3@x','admin'), ('00000000-0000-0000-0000-0000000000d2','Gerente 3','ger3@x','gerente');
insert into public.funcionarios (id, nome, salario_mensal) values ('00000000-0000-0000-0000-00000000f0d1', 'Teste Folha', 2600);

\echo == F1. admin edita diária fixa e ajusta dia
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
update public.funcionarios set diaria_fixa = 120.50 where id = '00000000-0000-0000-0000-00000000f0d1';
insert into public.ajustes_dia (funcionario_id, data, situacao, observacao) values ('00000000-0000-0000-0000-00000000f0d1', '2026-09-10', 'falta', 'Faltou sem aviso') returning situacao;
\echo -- duplicado no mesmo dia é recusado
insert into public.ajustes_dia (funcionario_id, data, situacao) values ('00000000-0000-0000-0000-00000000f0d1', '2026-09-10', 'presente');
\echo -- situação inválida é recusada
insert into public.ajustes_dia (funcionario_id, data, situacao) values ('00000000-0000-0000-0000-00000000f0d1', '2026-09-11', 'ferias');
update public.ajustes_dia set situacao = 'abonado' where data = '2026-09-10' returning situacao;
reset role;
select diaria_fixa from public.funcionarios where id = '00000000-0000-0000-0000-00000000f0d1';

\echo == F2. gerência LÊ ajustes, NÃO altera; pode lançar marcação manual
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d2';
select count(*) as gerente_le_ajustes from public.ajustes_dia;
insert into public.ajustes_dia (funcionario_id, data, situacao) values ('00000000-0000-0000-0000-00000000f0d1', '2026-09-12', 'presente');
delete from public.ajustes_dia where data = '2026-09-10';
insert into public.registros_ponto (funcionario_id, data, tipo, status, justificativa, status_aprovacao, retroativo)
  values ('00000000-0000-0000-0000-00000000f0d1', '2026-09-09', 'entrada', 'manual', 'Lançado pela gerência', 'aprovado', true) returning status;
update public.registros_ponto set justificativa = 'corrigido' where data = '2026-09-09' returning justificativa;
delete from public.registros_ponto where data = '2026-09-09';
update public.funcionarios set salario_mensal = 99999 where id = '00000000-0000-0000-0000-00000000f0d1';
select count(*) as gerente_ve_salarios from public.funcionarios;
reset role;
select salario_mensal from public.funcionarios where id = '00000000-0000-0000-0000-00000000f0d1';
select count(*) as ajustes_apos_tentativas from public.ajustes_dia;
select count(*) as marcacoes_apos_tentativa_de_apagar from public.registros_ponto where data = '2026-09-09';

\echo == F3. anon não enxerga nem grava
set role anon; reset request.jwt.claim.sub;
select count(*) as anon_le_ajustes from public.ajustes_dia;
insert into public.ajustes_dia (funcionario_id, data, situacao) values ('00000000-0000-0000-0000-00000000f0d1', '2026-09-13', 'presente');
insert into public.registros_ponto (funcionario_id, data, tipo) values ('00000000-0000-0000-0000-00000000f0d1', '2026-09-13', 'entrada');
reset role;
