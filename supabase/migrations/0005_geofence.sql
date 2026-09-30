-- =====================================================================
-- ALMEIDA ADVOCACIA PLATAFORMA ADMINISTRATIVA · cerca de GPS (geofence)
-- O ponto só é registrado dentro de 900 m do escritório (Posto FC, Codó-MA).
--  * ponto_bater passa a falhar "fechado" (sem coordenadas configuradas usa o escritório)
--  * ativa a cerca com o endereço/coordenadas do escritório na primeira execução;
--    se o administrador já definiu a localização pelo sistema, NÃO sobrescreve.
-- Idempotente.
-- =====================================================================
create or replace function public.ponto_bater(
  p_func_id uuid, p_pin text, p_tipo text, p_justificativa text default null,
  p_lat double precision default null, p_lng double precision default null
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_pin text; v_pt jsonb; v_local timestamp := now() at time zone 'America/Fortaleza'; v_data date;
  v_min int; v_dias jsonb; v_prev text; v_c record; v_id uuid; v_dist double precision; v_raio int;
begin
  v_pin := public._validar_pin(p_func_id, p_pin);
  if v_pin <> 'ok' then return public._erro(v_pin); end if;
  if p_tipo not in ('entrada','saida_intervalo','retorno_intervalo','saida') then return public._erro('TIPO_INVALIDO'); end if;
  v_data := v_local::date;
  v_min := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  select coalesce(dados -> 'ponto', '{}'::jsonb) into v_pt from public.configuracoes where id = 'global';
  v_pt := coalesce(v_pt, '{}'::jsonb);

  -- Cerca de GPS: só registra dentro do raio do escritório. O servidor recalcula a distância (o navegador é só conveniência).
  if coalesce((v_pt ->> 'geofence_ativo')::boolean, false) then
    if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then return public._erro('GPS_OBRIGATORIO'); end if;
    v_raio := coalesce(nullif((v_pt ->> 'geofence_raio_m')::int, 0), 900);
    -- sem coordenadas configuradas, usa o endereço do escritório (nunca "abre" a cerca por falta de dado)
    v_dist := public._distancia_m(p_lat, p_lng,
      coalesce((v_pt ->> 'geofence_lat')::double precision, -4.460791217811178),
      coalesce((v_pt ->> 'geofence_lng')::double precision, -43.88809954417763));
    if v_dist > v_raio then return public._erro('FORA_DA_AREA', format('%s m (máx. %s m)', round(v_dist), v_raio)); end if;
  end if;

  if exists (select 1 from public.registros_ponto where funcionario_id = p_func_id and data = v_data
              and tipo = p_tipo and status_aprovacao <> 'rejeitado') then
    return public._erro('JA_REGISTRADO');
  end if;

  select e.dias into v_dias from public.escalas e join public.funcionarios f on f.escala_id = e.id where f.id = p_func_id;
  v_prev := public._turno_previsto(v_dias, extract(dow from v_data)::int, p_tipo);
  select * into v_c from public._classificar(p_tipo, v_prev, v_min,
      coalesce((v_pt ->> 'tolerancia_min')::int, 5), coalesce((v_pt ->> 'limite_atraso_min')::int, 30));

  if v_c.status in ('atraso','saida_antecipada') and length(trim(coalesce(p_justificativa, ''))) < 3 then
    return public._erro('JUSTIFICATIVA_OBRIGATORIA', v_c.status);
  end if;

  insert into public.registros_ponto (funcionario_id, data, tipo, horario_previsto, horario_real, diferenca_minutos,
                                      status, justificativa, latitude, longitude)
  values (p_func_id, v_data, p_tipo, v_prev, now(), v_c.diferenca, v_c.status, nullif(trim(p_justificativa), ''), p_lat, p_lng)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'status', v_c.status, 'diferenca_minutos', v_c.diferenca, 'horario_real', now());
end $$;

update public.configuracoes
   set dados = jsonb_set(coalesce(dados, '{}'::jsonb), '{ponto}',
         coalesce(dados -> 'ponto', '{}'::jsonb) || jsonb_build_object(
           'geofence_ativo', true,
           'geofence_lat', -4.460791217811178,
           'geofence_lng', -43.88809954417763,
           'geofence_raio_m', 900,
           'geofence_endereco', 'Posto FC - Av. Augusto Teixeira, S/N, R. São Sebastião, 02 - Sala 02, Codó - MA, 65400-000'))
 where id = 'global' and not (coalesce(dados -> 'ponto', '{}'::jsonb) ? 'geofence_endereco');

insert into public.configuracoes (id, dados)
select 'global', jsonb_build_object('ponto', jsonb_build_object(
  'tolerancia_min', 5, 'limite_atraso_min', 30, 'geofence_ativo', true,
  'geofence_lat', -4.460791217811178, 'geofence_lng', -43.88809954417763, 'geofence_raio_m', 900,
  'geofence_endereco', 'Posto FC - Av. Augusto Teixeira, S/N, R. São Sebastião, 02 - Sala 02, Codó - MA, 65400-000'))
where not exists (select 1 from public.configuracoes where id = 'global');

grant execute on function public.ponto_bater(uuid, text, text, text, double precision, double precision) to anon, authenticated;
