-- Reglas de ronda del reglamento DML: puntuación SIN contacto válido y empates.
--
-- ── Qué dice el reglamento (sección "Puntuación") ───────────────────────────
--
-- No toda salida del estadio da puntos: la clave es el "contacto válido" (ambos
-- Beys tocaron el suelo y hubo al menos una colisión). SIN contacto válido:
--
--   · Lanzamiento nulo (1ª vez): advertencia, la ronda se repite SIN puntos.
--   · 2ª falla consecutiva del mismo jugador: 1 punto al rival ("Falla de
--     Lanzamiento").
--   · Self-Over/Xtreme (el Bey cae solo en un bolsillo sin tocar al rival): NO
--     valen los 2/3 puntos normales; se trata como error de lanzamiento
--     (advertencia, o 1 punto al rival si reincide).
--   · Empate (ambos se detienen o salen a la vez): se repite la ronda sin puntos.
--
-- ── Qué faltaba en el modelo ─────────────────────────────────────────────────
--
-- Hasta ahora toda ronda era un "finish" con ganador y puntos (1..3). No había
-- forma de registrar (a) una ronda que no otorga puntos y se repite, ni (b) un
-- punto por falla de lanzamiento, que no es un finish. Se agregan DOS resultados
-- de ronda, guardados en `match_rounds.finish_type` (la columna `winner_id` ya
-- es nullable desde 0001, así que el esquema no cambia):
--
--   · 'launch_fail' → 1 punto al jugador anotado (el rival del que falló).
--   · 'void'        → 0 puntos, sin ganador. La ronda se repite (empate o 1er
--                     lanzamiento nulo). Se guarda como constancia; no cuenta
--                     para llegar al puntaje objetivo.
--
-- La advertencia vs. el punto (1ª vs. 2ª falla) la decide el juez/los jugadores
-- en la mesa y se refleja eligiendo 'void' o 'launch_fail'; la app registra el
-- resultado, no lleva el conteo de reincidencia (igual que el resto del reporte).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Valor de cada resultado de ronda
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function finish_points(p_finish text)
returns int
language sql
immutable
as $$
  select case p_finish
    when 'spin' then 1
    when 'over' then 2
    when 'burst' then 2
    when 'xtreme' then 3
    when 'aerial' then 3
    when 'launch_fail' then 1   -- falla de lanzamiento: 1 al rival
    when 'void' then 0          -- empate / lanzamiento nulo: se repite
    else 0
  end;
$$;

grant execute on function finish_points(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El reporte acepta rondas nulas y fallas de lanzamiento
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Misma función de 0022 (arranca el marcador en los puntos de penalización) con
-- dos cambios: 'void' y 'launch_fail' son resultados válidos, y una ronda 'void'
-- no tiene ganador ni suma puntos.

create or replace function report_match_result(
  p_match_id uuid,
  p_rounds jsonb,
  p_combo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_caller_player_id uuid;
  v_round jsonb;
  v_round_winner uuid;
  v_finish text;
  v_pts int;
  v_score_a int;
  v_score_b int;
  v_winner_id uuid;
  v_i int := 0;
  v_valid text[];
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'pending' then
    raise exception 'Este match ya fue reportado';
  end if;

  select id into v_caller_player_id from players where auth_user_id = auth.uid();
  if v_caller_player_id is null then
    raise exception 'No autorizado';
  end if;
  if v_caller_player_id not in (v_match.player_a_id, v_match.player_b_id) then
    raise exception 'Solo un participante puede reportar este match';
  end if;

  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) = 0 then
    raise exception 'Hay que registrar al menos un round';
  end if;

  -- Los puntos que ya otorgaron las penalizaciones cuentan desde el inicio.
  v_score_a := v_match.penalty_points_a;
  v_score_b := v_match.penalty_points_b;

  -- El Aerial solo vale en casual; 'launch_fail' y 'void' (reglas de lanzamiento)
  -- valen en las dos modalidades.
  v_valid := case when v_match.mode = 'casual'
    then array['spin', 'over', 'burst', 'xtreme', 'aerial', 'launch_fail', 'void']
    else array['spin', 'over', 'burst', 'xtreme', 'launch_fail', 'void']
  end;

  if p_combo_id is not null then
    if not exists (select 1 from combos where id = p_combo_id and player_id = v_caller_player_id) then
      raise exception 'Ese combo no es tuyo';
    end if;
  end if;

  delete from match_rounds where match_id = p_match_id;

  for v_round in select * from jsonb_array_elements(p_rounds)
  loop
    v_i := v_i + 1;

    if v_score_a >= v_match.points_to_win or v_score_b >= v_match.points_to_win then
      raise exception 'El match ya estaba ganado antes del round %', v_i;
    end if;

    v_finish := v_round ->> 'finish_type';
    if v_finish is null or not (v_finish = any(v_valid)) then
      raise exception 'Resultado inválido en el round %: "%" no se permite en modalidad %',
        v_i, coalesce(v_finish, 'nulo'), v_match.mode;
    end if;

    -- Ronda nula / empate: se repite, no da puntos, no tiene ganador.
    if v_finish = 'void' then
      insert into match_rounds (match_id, round_number, winner_id, finish_type, points)
      values (p_match_id, v_i, null, 'void', 0);
      continue;
    end if;

    -- Resultados que sí puntúan (finishes y falla de lanzamiento): necesitan un
    -- ganador entre los dos participantes.
    v_round_winner := nullif(v_round ->> 'winner_id', '')::uuid;
    if v_round_winner is null or v_round_winner not in (v_match.player_a_id, v_match.player_b_id) then
      raise exception 'El ganador del round % no es participante del match', v_i;
    end if;

    v_pts := finish_points(v_finish);

    if v_round_winner = v_match.player_a_id then
      v_score_a := v_score_a + v_pts;
    else
      v_score_b := v_score_b + v_pts;
    end if;

    insert into match_rounds (match_id, round_number, winner_id, finish_type, points)
    values (p_match_id, v_i, v_round_winner, v_finish, v_pts);
  end loop;

  -- Alguien tuvo que llegar al puntaje objetivo con rondas que puntúan.
  if v_score_a < v_match.points_to_win and v_score_b < v_match.points_to_win then
    raise exception 'Nadie llegó a % puntos (va %–%)', v_match.points_to_win, v_score_a, v_score_b;
  end if;

  v_winner_id := case when v_score_a > v_score_b then v_match.player_a_id else v_match.player_b_id end;

  update matches set
    score_a = v_score_a,
    score_b = v_score_b,
    winner_id = v_winner_id,
    status = 'reported',
    reported_by = v_caller_player_id,
    reported_at = now(),
    combo_a_id = case when v_caller_player_id = v_match.player_a_id then p_combo_id else combo_a_id end,
    combo_b_id = case when v_caller_player_id = v_match.player_b_id then p_combo_id else combo_b_id end
  where id = p_match_id;
end;
$$;

grant execute on function report_match_result(uuid, jsonb, uuid) to authenticated;
