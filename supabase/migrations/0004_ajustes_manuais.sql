-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · edição manual da folha
--  * funcionarios.diaria_fixa: valor de diária definido à mão (opcional)
--  * ajustes_dia: corrige um dia (presente / abonado / falta) sobre o ponto
--  * gerência pode lançar e corrigir marcações de ponto
-- Idempotente: pode ser executado mais de uma vez.
-- =====================================================================
alter table public.funcionarios
  add column if not exists diaria_fixa numeric(12,2) check (diaria_fixa is null or diaria_fixa >= 0);

create table if not exists public.ajustes_dia (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  data date not null,
  situacao text not null check (situacao in ('presente', 'abonado', 'falta')),
  observacao text,
  created_at timestamptz not null default now(),
  unique (funcionario_id, data)
);
alter table public.ajustes_dia enable row level security;
drop policy if exists "admin total" on public.ajustes_dia;
create policy "admin total" on public.ajustes_dia for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
drop policy if exists "gerencia le" on public.ajustes_dia;
create policy "gerencia le" on public.ajustes_dia for select to authenticated using (public.eh_gestao());

drop policy if exists "gerencia grava registros" on public.registros_ponto;
create policy "gerencia grava registros" on public.registros_ponto for insert to authenticated with check (public.eh_gestao());
drop policy if exists "gerencia edita registros" on public.registros_ponto;
create policy "gerencia edita registros" on public.registros_ponto for update to authenticated using (public.eh_gestao()) with check (public.eh_gestao());
