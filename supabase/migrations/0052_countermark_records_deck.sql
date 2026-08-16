-- El segundo jugador también dice con qué jugó.
--
-- `report_match_result` guarda el deck **del que reporta**: llena `combo_a_id`
-- o `combo_b_id` según quién llame. Pero las dos funciones con las que responde
-- el otro —`submit_countermark` y `accept_reported_result`— ni siquiera recibían
-- un deck.
--
-- Resultado: en juego real, **del segundo jugador nunca se registraba con qué
-- jugó**. Su rendimiento por deck quedaba a medias y el combate solo contaba
-- para la estadística de uno. Pasó desapercibido porque los 65 combates que
-- tienen los dos decks vienen del sembrado de demostración, que los escribe
-- directo sin pasar por estas funciones.
--
-- ⚠️ Estas dos funciones se reescriben COMPLETAS a partir de la 0025, no de
-- memoria. Un primer intento las recortó sin querer —se perdieron el bloqueo de
-- fila, las validaciones de marcador y el valor de retorno— y eso rompe la doble
-- marca entera. Aquí van íntegras, con el deck como único agregado.
--
-- El parámetro va con DEFAULT null a propósito: un APK viejo que llame sin él
-- sigue funcionando, solo que sin registrar el deck. Romper a los clientes
-- instalados para forzar un dato sería peor que el dato faltante.

drop function if exists submit_countermark(uuid, uuid, integer, integer);
drop function if exists submit_countermark(uuid, uuid, integer, integer, uuid);

create or replace function submit_countermark(
  p_match_id uuid,
  p_winner_id uuid,
  p_score_a int,
  p_score_b int,
  p_combo_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_caller uuid;
  v_agree boolean;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'reported' then
    raise exception 'Este combate no está esperando tu marca';
  end if;

  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    raise exception 'No autorizado';
  end if;
  if v_caller not in (v_match.player_a_id, v_match.player_b_id) then
    raise exception 'Solo un participante puede marcar este combate';
  end if;
  if v_caller = v_match.reported_by then
    raise exception 'Ya registraste tu versión; le toca a tu rival';
  end if;
  if v_match.countermark_by is not null then
    raise exception 'Ya marcaste este combate';
  end if;

  if p_winner_id not in (v_match.player_a_id, v_match.player_b_id) then
    raise exception 'El ganador tiene que ser uno de los dos participantes';
  end if;
  if p_score_a < 0 or p_score_b < 0 then
    raise exception 'El marcador no puede ser negativo';
  end if;
  if (p_winner_id = v_match.player_a_id and p_score_a < p_score_b)
     or (p_winner_id = v_match.player_b_id and p_score_b < p_score_a) then
    raise exception 'El marcador contradice al ganador que marcaste';
  end if;

  -- Lo único nuevo: el deck de quien marca, con la misma comprobación de
  -- propiedad que hace `report_match_result`.
  if p_combo_id is not null then
    if not exists (select 1 from combos where id = p_combo_id and player_id = v_caller) then
      raise exception 'Ese deck no es tuyo';
    end if;
  end if;

  update matches set
    countermark_by = v_caller,
    countermark_winner_id = p_winner_id,
    countermark_score_a = p_score_a,
    countermark_score_b = p_score_b,
    countermark_at = now(),
    combo_a_id = case when v_caller = player_a_id and p_combo_id is not null then p_combo_id else combo_a_id end,
    combo_b_id = case when v_caller = player_b_id and p_combo_id is not null then p_combo_id else combo_b_id end
  where id = p_match_id;

  v_agree := (p_winner_id = v_match.winner_id
              and p_score_a = v_match.score_a
              and p_score_b = v_match.score_b);

  -- Coincidan o no, el combate NO se cierra aquí: espera al juez.
  return jsonb_build_object(
    'agreed', v_agree,
    'reported_winner_id', v_match.winner_id,
    'reported_score_a', v_match.score_a,
    'reported_score_b', v_match.score_b
  );
end;
$$;

revoke execute on function submit_countermark(uuid, uuid, int, int, uuid) from public, anon;
grant execute on function submit_countermark(uuid, uuid, int, int, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists accept_reported_result(uuid);
drop function if exists accept_reported_result(uuid, uuid);

create or replace function accept_reported_result(p_match_id uuid, p_combo_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_caller uuid;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'reported' then
    raise exception 'Este combate ya no está esperando tu marca';
  end if;

  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    raise exception 'No autorizado';
  end if;
  if v_caller not in (v_match.player_a_id, v_match.player_b_id) or v_caller = v_match.reported_by then
    raise exception 'No te corresponde aceptar este resultado';
  end if;

  if p_combo_id is not null then
    if not exists (select 1 from combos where id = p_combo_id and player_id = v_caller) then
      raise exception 'Ese deck no es tuyo';
    end if;
  end if;

  update matches set
    countermark_by = v_caller,
    countermark_winner_id = v_match.winner_id,
    countermark_score_a = v_match.score_a,
    countermark_score_b = v_match.score_b,
    countermark_at = now(),
    combo_a_id = case when v_caller = player_a_id and p_combo_id is not null then p_combo_id else combo_a_id end,
    combo_b_id = case when v_caller = player_b_id and p_combo_id is not null then p_combo_id else combo_b_id end
  where id = p_match_id;
end;
$$;

revoke execute on function accept_reported_result(uuid, uuid) from public, anon;
grant execute on function accept_reported_result(uuid, uuid) to authenticated;
