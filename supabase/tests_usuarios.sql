-- Verifica a gestão de acessos (0002_gestao_usuarios.sql). Rodado por run_rpc_tests.sh.
\set ON_ERROR_STOP off
\pset pager off
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1','adm2@x'), ('00000000-0000-0000-0000-0000000000c2','ger2@x');
insert into public.perfis (id, nome, email, papel) values
 ('00000000-0000-0000-0000-0000000000c1','Admin Teste','adm2@x','admin'), ('00000000-0000-0000-0000-0000000000c2','Gerente Teste','ger2@x','gerente');

\echo == U1. gerente NÃO cria usuário
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c2';
select public.criar_usuario('novo@x.com','senha123456','Novo','admin');
\echo == U2. anon NÃO executa
reset role; set role anon; reset request.jwt.claim.sub;
select public.criar_usuario('novo@x.com','senha123456','Novo','admin');

\echo == U3. admin cria admin e gerente; valida entradas
reset role; set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.criar_usuario('Segundo.Admin@Escritorio.com ','segredo123','Segundo Admin','admin') ->> 'ok' as criou_admin;
select public.criar_usuario('gerente@escritorio.com','segredo123','Gerente Novo','gerente') ->> 'ok' as criou_gerente;
select public.criar_usuario('gerente@escritorio.com','segredo123','Duplicado','gerente');
select public.criar_usuario('semarroba','segredo123','X','gerente');
select public.criar_usuario('curta@x.com','1234567','X','gerente');
select public.criar_usuario('fraca@x.com','somenteletras','X','gerente');
select public.criar_usuario('papel@x.com','segredo123','X','superuser');
reset role;
select email, papel, ativo from public.perfis order by email;
select email, aud, email_confirmed_at is not null as confirmado, encrypted_password like '$2a$%' as bcrypt from auth.users where email like '%escritorio.com';
select count(*) as identidades from auth.identities i join auth.users u on u.id = i.user_id where u.email like '%escritorio.com';
select 'senha confere' as t, encrypted_password = extensions.crypt('segredo123', encrypted_password) as ok from auth.users where email = 'segundo.admin@escritorio.com';

\echo == U4. promover gerente a admin, rebaixar, desativar
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.atualizar_usuario((select id from public.perfis where email='gerente@escritorio.com'), 'Gerente Novo', 'admin', true) ->> 'ok' as promoveu;
select public.atualizar_usuario((select id from public.perfis where email='gerente@escritorio.com'), 'Gerente Novo', 'gerente', false) ->> 'ok' as rebaixou_e_desativou;
reset role;
select email, papel, ativo from public.perfis where email = 'gerente@escritorio.com';

\echo == U5. redefinir senha
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.redefinir_senha_usuario((select id from public.perfis where email='segundo.admin@escritorio.com'), 'novaSenha99') ->> 'ok' as redefiniu;
select public.redefinir_senha_usuario((select id from public.perfis where email='segundo.admin@escritorio.com'), 'curta');
reset role;
select 'nova senha confere' as t, encrypted_password = extensions.crypt('novaSenha99', encrypted_password) as ok from auth.users where email = 'segundo.admin@escritorio.com';

\echo == U6. proteção do último admin (deixa só c1 como admin ativo)
reset role;
update public.perfis set papel = 'gerente' where email in ('adm@x', 'segundo.admin@escritorio.com');
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.atualizar_usuario('00000000-0000-0000-0000-0000000000c1', null, 'gerente', true);
select public.atualizar_usuario('00000000-0000-0000-0000-0000000000c1', null, 'admin', false);
select public.remover_usuario('00000000-0000-0000-0000-0000000000c1');
reset role;
select email, papel, ativo from public.perfis where email = 'adm2@x';
\echo -- com um segundo admin, o primeiro pode ser rebaixado
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.atualizar_usuario((select id from public.perfis where email='segundo.admin@escritorio.com'), null, 'admin', true) ->> 'ok' as promoveu_segundo;
select public.atualizar_usuario('00000000-0000-0000-0000-0000000000c1', null, 'gerente', true) ->> 'ok' as rebaixou_c1;
reset role;
select email, papel from public.perfis where email in ('adm2@x','segundo.admin@escritorio.com') order by email;
update public.perfis set papel = 'admin' where email = 'adm2@x';

\echo == U7. remover usuário
set role authenticated; set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000c1';
select public.remover_usuario((select id from public.perfis where email='gerente@escritorio.com')) ->> 'ok' as removeu;
reset role;
select count(*) as restantes_escritorio from public.perfis where email like '%escritorio.com';
select count(*) as auth_restantes from auth.users where email = 'gerente@escritorio.com';
