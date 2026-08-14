-- El factor K se calibra con partidas DE RANKING, no con todas.
--
-- ── Qué quedó abierto en 0026 ────────────────────────────────────────────────
--
-- 0026 dejó que `matches_played` suba también en los combates casuales, y el
-- motivo era bueno: es una partida jugada de verdad, seis pantallas la muestran
-- como total, y `losses = matches_played - wins` se rompe si no cuenta todo.
--
-- Lo que ese razonamiento no cubrió es el OTRO uso del mismo contador: decidir
-- el factor K. Un jugador con menos de 10 partidas se considera en calibración
-- y usa K=40; a partir de ahí, K=24.
--
-- El escenario concreto: alguien nuevo llega a una noche Arcade y juega 10
-- combates casuales — exactamente para lo que existe esa modalidad. Su
-- `matches_played` llega a 10. Entra a su PRIMER combate de ranking y el
-- sistema ya lo trata como establecido: K=24 en vez de K=40, y su rating
-- converge a poco más de la mitad de velocidad justo en la ventana que existe
-- para colocarlo rápido. Cuanto mejor funcione la modalidad casual, peor
-- calibra a los novatos.
--
-- ── La solución ─────────────────────────────────────────────────────────────
--
-- Separar los dos contadores, porque miden cosas distintas:
--   · `matches_played`        — total de partidas. Lo que ve el jugador.
--   · `ranked_matches_played` — solo ranking. Lo que calibra el ELO.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'players'
      and column_name = 'ranked_matches_played'
  ) then
    alter table players add column ranked_matches_played int not null default 0;
    -- Todo combate anterior a 0026 fue de ranking: el total ES el de ranking.
    -- Va dentro del if para que correr esto dos veces no reescriba el valor de
    -- alguien que legítimamente tenga 0 partidas de ranking y varias casuales.
    update players set ranked_matches_played = matches_played;
  end if;
end;
$$;

-- Misma función de 0026 con dos cambios: de dónde sale el K, y qué contador
-- sube en cada modalidad.

create or replace function apply_match_confirmation(p_match_id uuid, p_closed_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_player_a players%rowtype;
  v_player_b players%rowtype;
  v_ea numeric; v_eb numeric;
  v_d int; v_m numeric;
  v_ka int; v_kb int;
  v_sa numeric; v_sb numeric;
  v_delta_a numeric; v_delta_b numeric;
  v_pair_a uuid; v_pair_b uuid;
  v_win_a int; v_win_b int;
  v_ranked boolean;
begin
  select * into v_match from matches where id = p_match_id for update;
  if v_match.winner_id is null then
    raise exception 'El match no tiene ganador definido';
  end if;

  select * into v_player_a from players where id = v_match.player_a_id for update;
  select * into v_player_b from players where id = v_match.player_b_id for update;

  -- Todo lo anterior a 0026 era 'ranking'; solo el casual explícito cambia.
  v_ranked := (v_match.mode is distinct from 'casual');

  v_sa := case when v_match.winner_id = v_player_a.id then 1 else 0 end;
  v_sb := 1 - v_sa;

  if v_ranked then
    v_ea := 1.0 / (1 + power(10, (v_player_b.elo_rating - v_player_a.elo_rating) / 400.0));
    v_eb := 1 - v_ea;

    v_d := abs(v_match.score_a - v_match.score_b);
    v_m := least(1.30, 1 + 0.20 * ln(v_d + 1));

    -- El cambio de fondo: el K sale del contador de ranking, no del total.
    v_ka := case when v_player_a.ranked_matches_played < 10 then 40 else 24 end;
    v_kb := case when v_player_b.ranked_matches_played < 10 then 40 else 24 end;

    v_delta_a := round(v_ka * v_m * (v_sa - v_ea), 2);
    v_delta_b := round(v_kb * v_m * (v_sb - v_eb), 2);
  else
    -- Casual (Arcade): "sin presión de ranking". El rating no se mueve.
    v_delta_a := 0;
    v_delta_b := 0;
  end if;

  update matches set
    status = 'confirmed',
    confirmed_by = p_closed_by,
    confirmed_at = now(),
    elo_a_before = v_player_a.elo_rating,
    elo_b_before = v_player_b.elo_rating,
    elo_a_change = v_delta_a,
    elo_b_change = v_delta_b
  where id = p_match_id;

  -- `matches_played` sube siempre: es el total que muestran las pantallas.
  -- `ranked_matches_played` solo en ranking: es el que calibra el K.
  update players set
    elo_rating = elo_rating + v_delta_a,
    matches_played = matches_played + 1,
    ranked_matches_played = ranked_matches_played + case when v_ranked then 1 else 0 end
  where id = v_player_a.id;

  update players set
    elo_rating = elo_rating + v_delta_b,
    matches_played = matches_played + 1,
    ranked_matches_played = ranked_matches_played + case when v_ranked then 1 else 0 end
  where id = v_player_b.id;

  -- La curva de ELO solo registra combates de ranking.
  if v_ranked then
    insert into ranking_snapshots (scope, scope_id, player_id, rating)
    values
      ('global', null, v_player_a.id, v_player_a.elo_rating + v_delta_a),
      ('global', null, v_player_b.id, v_player_b.elo_rating + v_delta_b);
  end if;

  -- La pareja de rivalries se guarda normalizada (uuid menor primero).
  if v_player_a.id < v_player_b.id then
    v_pair_a := v_player_a.id; v_pair_b := v_player_b.id;
    v_win_a := v_sa::int; v_win_b := v_sb::int;
  else
    v_pair_a := v_player_b.id; v_pair_b := v_player_a.id;
    v_win_a := v_sb::int; v_win_b := v_sa::int;
  end if;

  insert into rivalries (player_a_id, player_b_id, wins_a, wins_b, last_match_id)
  values (v_pair_a, v_pair_b, v_win_a, v_win_b, p_match_id)
  on conflict (player_a_id, player_b_id)
  do update set
    wins_a = rivalries.wins_a + excluded.wins_a,
    wins_b = rivalries.wins_b + excluded.wins_b,
    last_match_id = excluded.last_match_id,
    updated_at = now();

  perform award_badges(v_player_a.id, p_match_id);
  perform award_badges(v_player_b.id, p_match_id);
end;
$$;

-- `create or replace` conserva los permisos, pero se re-asienta el candado de
-- 0023 por si acaso: esta función la llaman otras funciones SECURITY DEFINER,
-- nunca el cliente.
revoke all on function apply_match_confirmation(uuid, uuid) from public, anon, authenticated;
