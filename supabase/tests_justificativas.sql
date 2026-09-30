-- Atestados, atrasos em análise e anexos
\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000f1','adm-j@x'), ('00000000-0000-0000-0000-0000000000f2','ger-j@x') on conflict do nothing;
insert into public.perfis (id, nome, email, papel) values ('00000000-0000-0000-0000-0000000000f1','Adm J','adm-j@x','admin'), ('00000000-0000-0000-0000-0000000000f2','Ger J','ger-j@x','gerente') on conflict do nothing;
update public.configuracoes set dados = jsonb_set(dados, '{ponto,geofence_ativo}', 'false') where id = 'global';
do $$
declare v_local timestamp := now() at time zone 'America/Fortaleza'; d jsonb := '{}'; i int;
begin
  for i in 0..6 loop d := d || jsonb_build_object(i::text, jsonb_build_object('ativo', true, 'entrada', to_char(v_local - interval '3 hours', 'HH24:MI'), 'saida_intervalo','', 'retorno_intervalo','', 'saida','23:59')); end loop;
  insert into public.escalas (id, nome, dias) values ('00000000-0000-0000-0000-00000000e0b1', 'J-atrasada', d) on conflict do nothing;
  insert into public.funcionarios (id, nome, salario_mensal, escala_id, vinculo) values
    ('00000000-0000-0000-0000-00000000f0b1','Joana Atrasada',3000,'00000000-0000-0000-0000-00000000e0b1','clt'),
    ('00000000-0000-0000-0000-00000000f0b2','Outro Func',3000,'00000000-0000-0000-0000-00000000e0b1','clt') on conflict do nothing;
end $$;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
select public.definir_pin('00000000-0000-0000-0000-00000000f0b1','482913') is null and true;
select public.definir_pin('00000000-0000-0000-0000-00000000f0b2','739105') is null and true;
reset role;

\echo == atraso sem justificativa e com justificativa (vai para análise)
set role anon;
select public.ponto_bater('00000000-0000-0000-0000-00000000f0b1','482913','entrada') ->> 'erro';
select (public.ponto_bater('00000000-0000-0000-0000-00000000f0b1','482913','entrada','Trânsito na BR-316')) ->> 'analise' as analise_do_atraso;
reset role;
select 'registro pendente: ' || count(*) from public.registros_ponto where funcionario_id = '00000000-0000-0000-0000-00000000f0b1' and analise = 'pendente';
select id as reg from public.registros_ponto where funcionario_id = '00000000-0000-0000-0000-00000000f0b1' and analise = 'pendente' limit 1 \gset

\echo == anexos no atraso
set role anon;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'atestado.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==') ->> 'ok' as pdf_ok;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'foto.jpg', 'image/jpeg', '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/') ->> 'ok' as jpg_ok;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'x.pdf', 'application/pdf', '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsN') ->> 'erro' as mime_trocado;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'x.exe', 'application/x-msdownload', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==') ->> 'erro' as tipo_proibido;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'x.pdf', 'application/pdf', 'JVBER<script>alert(1)</script>AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA') ->> 'erro' as caracteres_invalidos;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'grande.pdf', 'application/pdf', 'JVBER' || repeat('A', 3400000)) ->> 'erro' as grande_demais;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b2','739105', :'reg', null, 'a.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==') ->> 'erro' as de_outra_pessoa;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','000000', :'reg', null, 'a.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==') ->> 'erro' as pin_errado;
select (public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'c.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==')) ->> 'ok' as terceiro;
select (public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'd.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==')) ->> 'ok' as quarto;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', null, 'e.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==') ->> 'erro' as quinto_limite;
select 'anon lê anexos: ' || count(*) from public.anexos;
reset role;

\echo == justificar ausência
set role anon;
select public.ponto_justificar_ausencia('00000000-0000-0000-0000-00000000f0b1','482913', current_date - 30, current_date - 29, 'atestado', 'Consulta médica') ->> 'ok' as enviou;
select public.ponto_justificar_ausencia('00000000-0000-0000-0000-00000000f0b1','482913', current_date - 30, current_date - 29, 'atestado', 'de novo') ->> 'erro' as duplicado;
select public.ponto_justificar_ausencia('00000000-0000-0000-0000-00000000f0b1','482913', current_date - 90, current_date - 89, 'atestado', 'antigo') ->> 'erro' as muito_antigo;
select public.ponto_justificar_ausencia('00000000-0000-0000-0000-00000000f0b1','482913', current_date - 5, current_date - 6, 'atestado', 'invertido') ->> 'erro' as invertido;
select public.ponto_justificar_ausencia('00000000-0000-0000-0000-00000000f0b1','482913', current_date - 5, current_date - 5, 'ferias', 'tipo indevido') ->> 'erro' as tipo_indevido;
reset role;
select id as oc from public.ocorrencias where funcionario_id = '00000000-0000-0000-0000-00000000f0b1' and origem = 'funcionario' limit 1 \gset
select 'ocorrência pendente: ' || status_analise || ' · remunerado=' || remunerado from public.ocorrencias where id = :'oc';
set role anon;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', null, :'oc', 'atestado.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==') ->> 'ok' as anexo_atestado;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', :'reg', :'oc', 'a.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==') ->> 'erro' as os_dois;
select jsonb_array_length(public.ponto_historico('00000000-0000-0000-0000-00000000f0b1','482913',5) -> 'justificativas') as justificativas_no_historico,
       (public.ponto_historico('00000000-0000-0000-0000-00000000f0b1','482913',5) -> 'registros' -> 0 ->> 'analise') as analise_no_historico,
       (public.ponto_historico('00000000-0000-0000-0000-00000000f0b1','482913',5) -> 'justificativas' -> 0 ->> 'anexos') as anexos_no_historico;
reset role;

\echo == decisão: gerência não decide, administrador decide
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f2';
update public.ocorrencias set status_analise = 'aceita' where id = :'oc';
update public.registros_ponto set analise = 'aceita' where id = :'reg';
select 'anexos visíveis à gerência: ' || count(*) from public.anexos;
reset role;
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000f1';
update public.ocorrencias set status_analise = 'recusada', motivo_decisao = 'Atestado ilegível' where id = :'oc';
update public.registros_ponto set analise = 'aceita' where id = :'reg';
select 'anexos visíveis ao admin: ' || count(*) from public.anexos;
select 'ocorrência: ' || status_analise || ' por admin=' || (decidido_por = '00000000-0000-0000-0000-0000000000f1') || ' motivo=' || motivo_decisao from public.ocorrencias where id = :'oc';
select 'registro: ' || analise || ' decidido_em preenchido=' || (decidido_em is not null) from public.registros_ponto where id = :'reg';
reset role;
set role anon;
select public.ponto_anexar('00000000-0000-0000-0000-00000000f0b1','482913', null, :'oc', 'tarde.pdf', 'application/pdf', 'JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDMgMCBSPj4Kc3RyZWFtCg==') ->> 'erro' as anexar_depois_de_decidido;
reset role;
\echo == auditoria registrou as decisões
select 'auditoria de ocorrências: ' || count(*) from public.auditoria where tabela = 'ocorrencias' and depois ? 'status_analise';
