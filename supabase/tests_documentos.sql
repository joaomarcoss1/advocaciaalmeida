\set ON_ERROR_STOP off
\pset tuples_only on
\pset format unaligned
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1','doc@x') on conflict do nothing;
insert into public.perfis (id, nome, email, papel) values ('00000000-0000-0000-0000-0000000000e1','Doc','doc@x','admin') on conflict do nothing;
\echo == anon não registra
set role anon;
select public.registrar_documento('folha', 'Folha', 'setembro', '{}'::jsonb, repeat('a', 64));
reset role;
\echo == admin registra e verifica
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select public.registrar_documento('folha', 'Folha de pagamento', 'setembro de 2026', '{"funcionarios":8,"total":27845.69}'::jsonb, repeat('a', 64)) ~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' as codigo_formato_ok;
select public.registrar_documento('folha', 'x', 'y', '{}'::jsonb, 'hash-ruim');
reset role;
\echo == anon verifica
select codigo as c from public.documentos_emitidos limit 1 \gset
\echo == código gerado no navegador: registro idempotente
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000e1';
select public.registrar_documento('folha', 'Folha', 'outubro', '{"total":10}'::jsonb, repeat('b', 64), 'ABCD-1234-EF56');
select 'repetido igual: ' || public.registrar_documento('folha', 'Folha', 'outubro', '{"total":10}'::jsonb, repeat('b', 64), 'abcd-1234-ef56');
select public.registrar_documento('folha', 'Outra', 'outubro', '{}'::jsonb, repeat('c', 64), 'ABCD-1234-EF56');
select public.registrar_documento('folha', 'x', 'y', '{}'::jsonb, repeat('c', 64), 'código ruim');
select 'linhas com o código: ' || count(*) from public.documentos_emitidos where codigo = 'ABCD-1234-EF56';
reset role;
set role anon; reset request.jwt.claim.sub;
select 'anon verifica o código do navegador: ' || (public.verificar_documento('ABCD-1234-EF56') ->> 'periodo');
select public.verificar_documento(:'c') ->> 'ok' as encontrado, public.verificar_documento(lower(:'c')) ->> 'titulo' as minusculas, public.verificar_documento('0000-0000-0000') ->> 'ok' as inexistente;
select 'anon lê a tabela: ' || count(*) from public.documentos_emitidos;
select public.verificar_documento(:'c') ->> 'emitido_por' as quem;
reset role;
