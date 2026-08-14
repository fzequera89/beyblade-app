-- Modalidad del torneo (Casual / Ranking) y su efecto en el ELO.
--
-- ── Qué dice el reglamento (sección "Modalidades de juego y competición") ────
--
-- La liga juega en dos modalidades y no son un matiz, son reglas distintas:
--
--   Casual (Arcade)              Ranking (Estructura de Temporada)
--   ─────────────────────        ─────────────────────────────────
--   Emparejamiento al azar       Round robin / bracket por categoría
--   Aerial Finish vale (3 pts)   Aerial NO vale
--   "Sin presión de ranking"     Alimenta el ranking
--   Premio físico al terminar    Posición en la tabla
--
-- ── Qué había en el código ───────────────────────────────────────────────────
--
-- La marca ya EXISTÍA a nivel de combate (`matches.mode`, desde 0020): el
-- reporte ya valida el Aerial según el modo, y el cliente ya ofrece el finish
-- Aerial solo en casual (`finishesFor`). Lo que faltaba:
--   1. El torneo no tenía modalidad — todo combate nacía 'ranking' por defecto.
--   2. `apply_match_confirmation` (el cierre del combate) no miraba el modo, así
--      que un combate casual movía el ELO igual que uno de ranking. Es lo
--      contrario exacto de "sin presión de ranking".
--
-- Esta migración cierra los dos huecos. El emparejamiento al azar del casual y
-- el selector de modalidad viven en el cliente (`src/lib/bracket.ts`,
-- `TournamentsScreen`), que es donde se arma el bracket.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La modalidad vive en el torneo, y de ahí baja a cada combate del bracket
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Se agrega una columna `mode` propia, gemela de `matches.mode`, en vez de
-- reusar `format` (texto libre sin usar): así el valor está acotado y se lee
-- igual en los dos lugares.

alter table tournaments add column if not exists mode text not null default 'ranking';
alter table tournaments drop constraint if exists tournaments_mode_check;
alter table tournaments add constraint tournaments_mode_check check (mode in ('ranking', 'casual'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El cierre del combate deja de mover el ELO en casual
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Misma función de 0022, con una sola idea nueva: si el combate es casual, el
-- cambio de ELO es 0. Todo LO DEMÁS se registra igual que en ranking —marcador,
-- rounds (ya guardados por el reporte), partidas jugadas, rivalidad y logros—
-- porque un torneo casual es justamente donde se prueban piezas y esas
-- estadísticas por combo son lo que lo hace valioso. Lo único que NO ocurre es
-- que el rating se mueva.
--
-- Qué se salta el casual, en concreto:
--   · el delta de ELO (queda en 0, y el rating de cada jugador no cambia);
--   · el punto en `ranking_snapshots` (la curva de ELO): el rating no cambió,
--     un punto plano solo ensuciaría la gráfica.
-- Qué SÍ hace el casual, igual que ranking:
--   · cierra el combate (confirmed);
--   · sube `matches_played` (es una partida jugada de verdad: cuenta en las
--     estadísticas y en los logros de volumen, y como el delta es 0 el rating
--     sigue sin moverse);
--   · actualiza la rivalidad (récord head-to-head) y evalúa los logros.

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

    v_ka := case when v_player_a.matches_played < 10 then 40 else 24 end;
    v_kb := case when v_player_b.matches_played < 10 then 40 else 24 end;

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

  -- `matches_played` sube en las dos modalidades: es una partida jugada. En
  -- casual el delta es 0, así que el rating no cambia aunque el contador suba.
  update players set elo_rating = elo_rating + v_delta_a, matches_played = matches_played + 1
  where id = v_player_a.id;

  update players set elo_rating = elo_rating + v_delta_b, matches_played = matches_played + 1
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
