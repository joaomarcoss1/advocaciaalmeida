#!/usr/bin/env bash
# Regera supabase/atualizacao_definitiva.sql (0003 + 0002 + 0004 + 0005) a partir das migrations.
set -euo pipefail
cd "$(dirname "$0")"
{
cat <<'HDR'
-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · ATUALIZAÇÃO DEFINITIVA
-- Rode UMA vez no Supabase → SQL Editor → New query → Run.
-- Seguro: não apaga nada, não mexe em dados, não altera PINs nem senhas.
-- Pode ser executado mais de uma vez (idempotente).
--   1) corrige "function gen_salt(unknown) does not exist" (salvar PIN)
--   2) instala a gestão de acessos (criar admin master / gerência no sistema)
--   3) instala diária fixa, ajuste de dias e edição de marcações
--   4) ativa a cerca de GPS: ponto só até 900 m do escritório
--   5) segurança: busca de funcionário no servidor, PIN de 6+ dígitos, bloqueio por origem,
--      auditoria automática e imutável, senha forte, verificação em duas etapas no servidor
--   6) autenticidade de documentos: código + QR Code nos PDFs
--   7) atestados e atrasos: anexos (PDF/foto), análise do administrador (aceitar/recusar)
-- =====================================================================

-- 0) localiza o pgcrypto onde quer que ele esteja e garante o schema "extensions"
create schema if not exists extensions;
do $$
declare v_schema text;
begin
  select n.nspname into v_schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pgcrypto';
  if v_schema is null then
    create extension pgcrypto with schema extensions;
  elsif v_schema not in ('extensions', 'public') then
    alter extension pgcrypto set schema extensions;
  end if;
end $$;

-- 1) funções passam a enxergar o pgcrypto (PIN e senhas)
HDR
sed -n '/^alter function/,$p' migrations/0003_corrige_search_path.sql
echo
cat migrations/0002_gestao_usuarios.sql
echo
cat migrations/0004_ajustes_manuais.sql
echo
cat migrations/0005_geofence.sql
echo
cat migrations/0006_seguranca.sql
echo
cat migrations/0007_documentos.sql
echo
cat migrations/0008_justificativas.sql
cat <<'FTR'

-- Atualiza o cache da API do Supabase para reconhecer as novas funções/tabelas
notify pgrst, 'reload schema';

-- Conferência: deve listar as funções de acesso e a cerca de GPS ativa (raio 900)
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('criar_usuario','atualizar_usuario','redefinir_senha_usuario','remover_usuario','definir_pin','ponto_bater','ponto_buscar','registrar_documento','verificar_documento','ponto_anexar','ponto_justificar_ausencia') order by 1;
select dados -> 'ponto' ->> 'geofence_ativo' as cerca_ativa, dados -> 'ponto' ->> 'geofence_raio_m' as raio_m from public.configuracoes where id = 'global';
FTR
} > atualizacao_definitiva.sql
