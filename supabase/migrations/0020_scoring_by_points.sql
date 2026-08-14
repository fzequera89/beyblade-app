-- Marcador por PUNTOS, según el reglamento de la Dark Masters League
--
-- Lo construido hasta ahora contaba rounds ganados: "el primero que gana 3".
-- El reglamento real dice otra cosa: cada round vale distinto según cómo
-- terminó, y gana el primero que ACUMULA cierta cantidad de puntos.
--
--   Spin Finish    1 punto
--   Over Finish    2 puntos
--   Burst Finish   2 puntos
--   Xtreme Finish  3 puntos
--   Aerial Finish  3 puntos  ← SOLO en modalidad casual
--
-- Con esto un match puede acabar 4–0 en dos rounds. El modelo anterior no podía
-- representar eso, y el error contaminaba el ELO, las estadísticas y los
-- desempates de la liga (que se resuelven por diferencia de puntos).

-- Cuántos puntos hace falta acumular. En ranked siempre 4; en torneos abiertos
-- puede ser 4, 5, 7 o 10 según la dinámica, por eso es una columna y no una
-- constante en el código.
alter table matches add column if not exists points_to_win int not null default 4;

-- La modalidad decide qué finishes son válidos. En ranking no se permite Aerial.
alter table matches add column if not exists mode text not null default 'ranking';

alter table matches drop constraint if exists matches_mode_check;
alter table matches add constraint matches_mode_check check (mode in ('ranking', 'casual'));

alter table matches drop constraint if exists matches_points_to_win_check;
alter table matches add constraint matches_points_to_win_check check (points_to_win between 1 and 20);

-- Los puntos que otorgó cada round se guardan, no se recalculan al leer: si el
-- reglamento cambia el valor de un finish, los matches viejos deben conservar
-- el marcador con el que se jugaron.
alter table match_rounds add column if not exists points int not null default 1;

-- Tabla de valores. Es una función y no una constante en el cliente para que
-- el marcador se calcule del lado del servidor, donde nadie lo puede alterar.
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
    else 0
  end;
$$;

-- Reportar el resultado round a round, sumando puntos.
--
-- Reemplaza a la versión de 0014, que derivaba el marcador contando rounds.
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
  v_score_a int := 0;
  v_score_b int := 0;
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

  -- El Aerial Finish solo existe en modalidad casual (reglamento, sección de
  -- modalidades). En ranking se rechaza.
  v_valid := case when v_match.mode = 'casual'
    then array['spin', 'over', 'burst', 'xtreme', 'aerial']
    else array['spin', 'over', 'burst', 'xtreme']
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

    -- Un round después de que alguien ya llegó al límite no debería existir:
    -- el match termina en el momento en que se alcanza el puntaje.
    if v_score_a >= v_match.points_to_win or v_score_b >= v_match.points_to_win then
      raise exception 'El match ya estaba ganado antes del round %', v_i;
    end if;

    v_round_winner := (v_round ->> 'winner_id')::uuid;
    v_finish := v_round ->> 'finish_type';

    if v_round_winner not in (v_match.player_a_id, v_match.player_b_id) then
      raise exception 'El ganador del round % no es participante del match', v_i;
    end if;
    if v_finish is null or not (v_finish = any(v_valid)) then
      raise exception 'Finish inválido en el round %: "%" no se permite en modalidad %',
        v_i, coalesce(v_finish, 'nulo'), v_match.mode;
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

  -- Alguien tuvo que llegar al límite: si no, el match sigue en curso y no hay
  -- resultado que reportar.
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
grant execute on function finish_points(text) to authenticated;

-- NOTA sobre el ELO: confirm_match_result calcula el margen de victoria con
-- D = |score_a - score_b|. Ese valor ahora es una diferencia de PUNTOS y ya no
-- de rounds, que es más fiel a lo que el documento de ELO llamaba "margen de
-- victoria". La fórmula no cambia; lo que cambia es que D puede llegar más alto
-- (hasta 4 en ranked en vez de 3), así que las palizas pesan un poco más.
-- Ver docs/elo-rules.md.
