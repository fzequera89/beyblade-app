-- Con qué peonza se jugó CADA round.
--
-- El deck vivía en el combate (`combo_a_id` / `combo_b_id`): una combinación por
-- jugador y por combate. Para 1 vs 1 es correcto —juegas todo con la misma— pero
-- **para 3 vs 3 y 5G es falso**, y esas son las modalidades del reglamento:
-- llevas tres beyblades distintas y usas una por round.
--
-- Preguntar "¿con qué deck jugaste?" una sola vez medía algo que no ocurrió: el
-- rendimiento por combinación quedaba atribuido entero a la que estaba anotada
-- en el combate, aunque hubieras ganado los rounds con otra.
--
-- `match_rounds.combo_id` va NULO en las modalidades de una sola combinación:
-- ahí el dato del combate basta y repetirlo por round sería ruido.
--
-- La función se re-crea a partir de su definición VIGENTE leída de la base, no
-- reescrita de memoria: en la 0052 ese atajo dejó rota la doble marca. Los
-- únicos cambios son la variable del deck, su validación de propiedad y las dos
-- inserciones.

alter table match_rounds add column if not exists combo_id uuid references combos(id);

comment on column match_rounds.combo_id is
  'Con qué combinación se jugó este round. Nulo en modalidades de una sola peonza.';

CREATE OR REPLACE FUNCTION public.report_match_result(p_match_id uuid, p_rounds jsonb, p_combo_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_match matches%rowtype;
  v_caller_player_id uuid;
  v_round jsonb;
  v_round_winner uuid;
  v_round_combo uuid;
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

    -- El deck de ESTE round. En 3 vs 3 y 5G se cambia de peonza entre rounds,
    -- así que preguntarlo una sola vez por combate mide algo que no pasó. Va
    -- nulo en las modalidades de una sola combinación, donde el deck del
    -- combate ya lo dice todo.
    v_round_combo := nullif(v_round ->> 'combo_id', '')::uuid;
    if v_round_combo is not null
       and not exists (select 1 from combos where id = v_round_combo and player_id = v_caller_player_id) then
      raise exception 'El deck del round % no es tuyo', v_i;
    end if;
    if v_finish is null or not (v_finish = any(v_valid)) then
      raise exception 'Resultado invÃ¡lido en el round %: "%" no se permite en modalidad %',
        v_i, coalesce(v_finish, 'nulo'), v_match.mode;
    end if;

    -- Ronda nula / empate: se repite, no da puntos, no tiene ganador.
    if v_finish = 'void' then
      insert into match_rounds (match_id, round_number, winner_id, finish_type, points, combo_id)
      values (p_match_id, v_i, null, 'void', 0, v_round_combo);
      continue;
    end if;

    -- Resultados que sÃ­ puntÃºan (finishes y falla de lanzamiento): necesitan un
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

    insert into match_rounds (match_id, round_number, winner_id, finish_type, points, combo_id)
    values (p_match_id, v_i, v_round_winner, v_finish, v_pts, v_round_combo);
  end loop;

  -- Alguien tuvo que llegar al puntaje objetivo con rondas que puntÃºan.
  if v_score_a < v_match.points_to_win and v_score_b < v_match.points_to_win then
    raise exception 'Nadie llegÃ³ a % puntos (va %â€“%)', v_match.points_to_win, v_score_a, v_score_b;
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
$function$
;
