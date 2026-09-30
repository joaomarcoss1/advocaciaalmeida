-- Roteiro de verificação das RPCs (rodado contra um Postgres com stub de auth).
\set ON_ERROR_STOP off
\pset pager off
-- fixtures
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','adm@x'), ('00000000-0000-0000-0000-0000000000b1','ger@x');
insert into public.perfis (id, nome, email, papel) values
 ('00000000-0000-0000-0000-0000000000a1','Adm','adm@x','admin'), ('00000000-0000-0000-0000-0000000000b1','Ger','ger@x','gerente');

-- escala de teste: hoje (qualquer dia) com entrada = agora e outra com entrada 3h antes
do $$
declare v_local timestamp := now() at time zone 'America/Fortaleza'; v_now text := to_char(v_local, 'HH24:MI');
        v_cedo text := to_char(v_local - interval '3 hours', 'HH24:MI'); d jsonb := '{}'; i int;
begin
  for i in 0..6 loop
    d := d || jsonb_build_object(i::text, jsonb_build_object('ativo', true, 'entrada', v_now, 'saida_intervalo','', 'retorno_intervalo','', 'saida','23:59'));
  end loop;
  insert into public.escalas (id, nome, dias) values ('00000000-0000-0000-0000-00000000e001', 'T-pontual', d);
  d := '{}';
  for i in 0..6 loop
    d := d || jsonb_build_object(i::text, jsonb_build_object('ativo', true, 'entrada', v_cedo, 'saida_intervalo','', 'retorno_intervalo','', 'saida','23:59'));
  end loop;
  insert into public.escalas (id, nome, dias) values ('00000000-0000-0000-0000-00000000e002', 'T-atrasado', d);
end $$;
insert into public.funcionarios (id, nome, salario_mensal, escala_id, vinculo) values
 ('00000000-0000-0000-0000-00000000f001','Ana Pontual', 3000,'00000000-0000-0000-0000-00000000e001','clt'),
 ('00000000-0000-0000-0000-00000000f002','Beto Atrasado', 2000,'00000000-0000-0000-0000-00000000e002','clt');

\echo == 1. admin define PIN (via função)
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select public.definir_pin('00000000-0000-0000-0000-00000000f001','1234');
select public.definir_pin('00000000-0000-0000-0000-00000000f002','4321');
select 'pin formato invalido ->' , (select 1) ;
select public.definir_pin('00000000-0000-0000-0000-00000000f002','12');
reset role;
select nome, tem_pin from public.funcionarios order by nome;
select count(*) as hash_bcrypt from public.funcionario_pins where pin_hash like '$2%';

\echo == 2. anon: lista de ativos sem dados sensiveis; tabelas bloqueadas
set role anon; reset request.jwt.claim.sub;
select nome, cargo_nome from public.ponto_lista_ativos();
select count(*) as anon_le_funcionarios from public.funcionarios;
select count(*) as anon_le_pins from public.funcionario_pins;
select count(*) as anon_le_folhas from public.folhas;

\echo == 3. PIN errado
select public.ponto_bater('00000000-0000-0000-0000-00000000f001','0000','entrada');

\echo == 4. entrada pontual
select public.ponto_bater('00000000-0000-0000-0000-00000000f001','1234','entrada');
\echo == 5. duplicada
select public.ponto_bater('00000000-0000-0000-0000-00000000f001','1234','entrada');
\echo == 6. saida (prevista 23:59 -> antecipada, exige justificativa)
select public.ponto_bater('00000000-0000-0000-0000-00000000f001','1234','saida');
select public.ponto_bater('00000000-0000-0000-0000-00000000f001','1234','saida','Audiencia externa');
\echo == 7. atraso exige justificativa
select public.ponto_bater('00000000-0000-0000-0000-00000000f002','4321','entrada');
select public.ponto_bater('00000000-0000-0000-0000-00000000f002','4321','entrada','Transito na BR-316');
\echo == 8. historico
select public.ponto_historico('00000000-0000-0000-0000-00000000f002','4321',5);
select public.ponto_historico('00000000-0000-0000-0000-00000000f002','9999',5);

\echo == 9. retroativo
select public.ponto_retroativo('00000000-0000-0000-0000-00000000f001','1234', current_date, 'entrada','08:00','curto');
select public.ponto_retroativo('00000000-0000-0000-0000-00000000f001','1234', current_date - 2, 'entrada','08:00','Esqueci de bater, estava em diligencia');
select public.ponto_retroativo('00000000-0000-0000-0000-00000000f001','1234', current_date - 2, 'entrada','08:00','Esqueci de bater, estava em diligencia');
select public.ponto_retroativo('00000000-0000-0000-0000-00000000f001','1234', current_date - 90, 'entrada','08:00','Muito antigo mesmo');
select public.aprovar_ponto(id, 'aprovar') as anon_aprova from public.registros_ponto limit 1;

\echo == 10. bloqueio apos 5 PINs errados
select public.ponto_bater('00000000-0000-0000-0000-00000000f002','x','saida');
select public.ponto_bater('00000000-0000-0000-0000-00000000f002','x','saida');
select public.ponto_bater('00000000-0000-0000-0000-00000000f002','x','saida');
select public.ponto_bater('00000000-0000-0000-0000-00000000f002','x','saida');
select public.ponto_bater('00000000-0000-0000-0000-00000000f002','x','saida');
select public.ponto_bater('00000000-0000-0000-0000-00000000f002','4321','saida','tentando com pin certo');

\echo == 11. gerente: ve ponto, equipe sem salario, NAO ve funcionarios/folhas; aprova
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000b1';
select count(*) as gerente_le_funcionarios from public.funcionarios;
select count(*) as gerente_le_folhas from public.folhas;
select count(*) as gerente_le_registros from public.registros_ponto;
select nome, vinculo from public.equipe();
\echo -- aprovar retroativo
select public.aprovar_ponto(id, 'aprovar') from public.registros_ponto where retroativo;
select status_aprovacao, status, diferenca_minutos from public.registros_ponto where retroativo;
select public.aprovar_ponto((select id from public.registros_ponto limit 1), 'rejeitar');
select public.aprovar_ponto((select id from public.registros_ponto limit 1), 'rejeitar', 'motivo teste');
insert into public.funcionarios (nome) values ('intruso');
select public.definir_pin('00000000-0000-0000-0000-00000000f001','9999');

\echo == 12. usuario autenticado sem perfil
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ff';
select public.equipe();
select count(*) as sem_perfil_le_registros from public.registros_ponto;

\echo == 13. admin le tudo
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a1';
select count(*) as admin_funcionarios from public.funcionarios;
select count(*) as admin_pins_via_api from public.funcionario_pins;
reset role;
