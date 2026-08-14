-- Arbitraje y penalizaciones, según el reglamento de la Dark Masters League.
--
-- Qué había antes: un jugador podía marcar "disputa" y un moderador solo podía
-- REABRIR el match para que lo reportaran otra vez — y únicamente si el match
-- pertenecía a un torneo. Un reto disputado quedaba muerto, y reabrir no es
-- arbitrar: devuelve el problema a las dos personas que ya no se pusieron de
-- acuerdo. El reglamento dice que el juez DECIDE y su decisión es inapelable.
--
-- Qué agrega esta migración:
--   1. Rol de juez (principal / de apoyo) con la regla de conflicto de interés.
--   2. resolve_dispute: el juez fija el resultado y corre el ELO igual que una
--      confirmación normal.
--   3. Penalizaciones con los tres niveles del reglamento y su efecto real en
--      el marcador.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Jueces
-- ─────────────────────────────────────────────────────────────────────────────

-- 'principal' = staff permanente, no juega los torneos que arbitra.
-- 'support'   = Challenger/Diamante habilitados para arbitrar (nunca su propia
--               categoría; mientras no existan las categorías, la restricción
--               que sí se puede aplicar es no arbitrar tu propio combate).
alter table players add column if not exists judge_role text not null default 'none';
alter table players drop constraint if exists players_judge_role_check;
alter table players add constraint players_judge_role_check
  check (judge_role in ('none', 'support', 'principal'));

-- Sanción de conducta que va más allá de un match (infracción crítica).
alter table players add column if not exists suspended_until timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Campos de arbitraje y de penalización en el match
-- ─────────────────────────────────────────────────────────────────────────────

alter table matches add column if not exists arbitrated_by uuid references players(id);
alter table matches add column if not exists arbitrated_at timestamptz;
alter table matches add column if not exists arbitration_reason text;

-- Los puntos de penalización se guardan APARTE de los que salen de los rounds.
-- Si vivieran solo en score_a/score_b, el siguiente reporte los borraría: ese
-- reporte recalcula el marcador desde los rounds.
alter table matches add column if not exists penalty_points_a int not null default 0;
alter table matches add column if not exists penalty_points_b int not null default 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Catálogo de infracciones (tabla del reglamento, textual)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists penalty_codes (
  code text primary key,
  label text not null,
  severity text not null check (severity in ('leve', 'grave', 'critica')),
  description text not null,
  sort_order int not null default 0
);

insert into penalty_codes (code, label, severity, description, sort_order) values
  ('false_launch', 'Lanzamiento en falso', 'leve',
   'No lograr que el Beyblade toque el suelo, o que el lanzador falle antes del contacto. Se permite un reintento.', 1),
  ('early_late_launch', 'Lanzamiento prematuro o retardado', 'leve',
   'Disparar antes de que termine el "¡Go Shoot!" o más de 1 segundo después.', 2),
  ('touched_stadium', 'Tocar el estadio', 'leve',
   'Tocar accidentalmente la base o la protección del estadio con los Beys en movimiento, sin alterar el resultado.', 3),
  ('slow_play', 'Demora de juego', 'leve',
   'Tardar más de 3 minutos en configurar el deck o elegir el Beyblade de la siguiente ronda.', 4),
  ('dangerous_launch', 'Lanzamiento peligroso', 'grave',
   'Lanzar con el brazo por encima del hombro o apuntando directamente al oponente.', 10),
  ('illegal_parts', 'Piezas prohibidas', 'grave',
   'Piezas con desgaste excesivo según la guía de verificación, o de generaciones anteriores incompatibles con el sistema X.', 11),
  ('technical_interference', 'Interferencia técnica', 'grave',
   'Tocar el Beyblade propio o del rival antes de que el árbitro declare el final de la ronda.', 12),
  ('coaching', 'Interferencia de coach o espectadores', 'grave',
   'Recibir instrucciones técnicas una vez que el árbitro inició el protocolo de lanzamiento.', 13),
  ('modified_parts', 'Modificación de piezas', 'critica',
   'Alterar físicamente las piezas: limar el ratchet, añadir peso o usar lubricantes en el bit.', 20),
  ('counterfeit', 'Uso de falsificaciones', 'critica',
   'Competir con reproducciones no oficiales, que carecen de pruebas de seguridad y pueden fragmentarse.', 21),
  ('unsportsmanlike', 'Conducta antideportiva', 'critica',
   'Insultar al árbitro, golpear el estadio por frustración, o agredir física o verbalmente al oponente.', 22),
  ('repeat_offender', 'Reincidencia', 'critica',
   'Acumular tres infracciones graves en un mismo evento.', 23)
on conflict (code) do update set
  label = excluded.label,
  severity = excluded.severity,
  description = excluded.description,
  sort_order = excluded.sort_order;

alter table penalty_codes enable row level security;

drop policy if exists "penalty_codes_read" on penalty_codes;
create policy "penalty_codes_read" on penalty_codes for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Infracciones registradas
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists penalties (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  player_id uuid not null references players(id),
  judge_id uuid not null references players(id),
  code text not null references penalty_codes(code),
  severity text not null check (severity in ('leve', 'grave', 'critica')),
  notes text,
  -- Si esta infracción fue la que otorgó el punto al rival (segunda leve del
  -- mismo tipo), queda marcado aquí para poder explicar el marcador.
  awarded_point boolean not null default false,
  forfeited_match boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists penalties_match_idx on penalties (match_id);
create index if not exists penalties_player_idx on penalties (player_id, created_at desc);

alter table penalties enable row level security;

-- Lectura abierta a autenticados: una sanción es pública dentro de la liga, es
-- parte del historial del competidor.
drop policy if exists "penalties_read" on penalties;
create policy "penalties_read" on penalties for select to authenticated using (true);

-- Sin políticas de escritura a propósito: solo se registran por la función,
-- que valida que quien la llama pueda arbitrar ese combate.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ¿Quién puede arbitrar este match?
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function can_arbitrate(p_player_id uuid, p_match_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_player players%rowtype;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then return false; end if;

  select * into v_player from players where id = p_player_id;
  if not found then return false; end if;

  -- Nadie arbitra un combate que está jugando. El reglamento lo pide explícito
  -- para los jueces de apoyo, y para los principales dice que no participan en
  -- los torneos que arbitran.
  if p_player_id in (v_match.player_a_id, v_match.player_b_id) then
    return false;
  end if;

  if v_player.is_admin or v_player.judge_role in ('principal', 'support') then
    return true;
  end if;

  -- Un moderador de la liga del match también puede: es quien organiza el
  -- evento cuando no hay cuerpo de jueces presente.
  return exists (
    select 1 from league_members lm
    where lm.player_id = p_player_id
      and lm.role = 'organizer'
      and (
        lm.league_id = v_match.league_id
        or lm.league_id in (select league_id from tournaments where id = v_match.tournament_id)
      )
  );
end;
$$;

grant execute on function can_arbitrate(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. El cierre de un match, en un solo lugar
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Antes esto vivía dentro de confirm_match_result. Ahora lo necesitan dos
-- caminos — la confirmación normal y la decisión de un juez — y tener la
-- matemática de ELO copiada en dos funciones es garantía de que un día se
-- separen. Cada quien valida SUS permisos y luego llama aquí.

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
begin
  select * into v_match from matches where id = p_match_id for update;
  if v_match.winner_id is null then
    raise exception 'El match no tiene ganador definido';
  end if;

  select * into v_player_a from players where id = v_match.player_a_id for update;
  select * into v_player_b from players where id = v_match.player_b_id for update;

  v_ea := 1.0 / (1 + power(10, (v_player_b.elo_rating - v_player_a.elo_rating) / 400.0));
  v_eb := 1 - v_ea;

  v_d := abs(v_match.score_a - v_match.score_b);
  v_m := least(1.30, 1 + 0.20 * ln(v_d + 1));

  v_sa := case when v_match.winner_id = v_player_a.id then 1 else 0 end;
  v_sb := 1 - v_sa;

  v_ka := case when v_player_a.matches_played < 10 then 40 else 24 end;
  v_kb := case when v_player_b.matches_played < 10 then 40 else 24 end;

  v_delta_a := round(v_ka * v_m * (v_sa - v_ea), 2);
  v_delta_b := round(v_kb * v_m * (v_sb - v_eb), 2);

  update matches set
    status = 'confirmed',
    confirmed_by = p_closed_by,
    confirmed_at = now(),
    elo_a_before = v_player_a.elo_rating,
    elo_b_before = v_player_b.elo_rating,
    elo_a_change = v_delta_a,
    elo_b_change = v_delta_b
  where id = p_match_id;

  update players set elo_rating = elo_rating + v_delta_a, matches_played = matches_played + 1
  where id = v_player_a.id;

  update players set elo_rating = elo_rating + v_delta_b, matches_played = matches_played + 1
  where id = v_player_b.id;

  insert into ranking_snapshots (scope, scope_id, player_id, rating)
  values
    ('global', null, v_player_a.id, v_player_a.elo_rating + v_delta_a),
    ('global', null, v_player_b.id, v_player_b.elo_rating + v_delta_b);

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

-- Solo la llaman otras funciones SECURITY DEFINER, nunca el cliente: no valida
-- permisos porque no sabe por qué se está cerrando el match.
revoke all on function apply_match_confirmation(uuid, uuid) from public;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Confirmación normal (misma regla de siempre, ahora delegando el cierre)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function confirm_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_caller_player_id uuid;
  v_is_organizer boolean;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'reported' then
    raise exception 'El match no está en estado reportado';
  end if;

  select id into v_caller_player_id from players where auth_user_id = auth.uid();
  if v_caller_player_id is null then
    raise exception 'No autorizado';
  end if;

  if v_caller_player_id = v_match.reported_by then
    raise exception 'Quien reporta no puede confirmar su propio resultado';
  end if;

  v_is_organizer := exists (
    select 1 from league_members lm
    where lm.league_id = v_match.league_id
      and lm.player_id = v_caller_player_id
      and lm.role = 'organizer'
  );

  if not (v_caller_player_id in (v_match.player_a_id, v_match.player_b_id) or v_is_organizer) then
    raise exception 'No autorizado para confirmar este match';
  end if;

  perform apply_match_confirmation(p_match_id, v_caller_player_id);
end;
$$;

grant execute on function confirm_match_result(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. El juez resuelve la disputa
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Las decisiones tomadas por los Jueces Principales son inapelables": el match
-- queda confirmado por esta vía, no vuelve a manos de los jugadores.

create or replace function resolve_dispute(
  p_match_id uuid,
  p_winner_id uuid,
  p_score_a int,
  p_score_b int,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_judge uuid;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status not in ('reported', 'disputed') then
    raise exception 'Solo se puede arbitrar un match reportado o en disputa';
  end if;

  select id into v_judge from players where auth_user_id = auth.uid();
  if v_judge is null then
    raise exception 'No autorizado';
  end if;
  if not can_arbitrate(v_judge, p_match_id) then
    raise exception 'No puedes arbitrar este combate';
  end if;

  if p_winner_id not in (v_match.player_a_id, v_match.player_b_id) then
    raise exception 'El ganador tiene que ser uno de los dos participantes';
  end if;
  if p_score_a < 0 or p_score_b < 0 then
    raise exception 'El marcador no puede ser negativo';
  end if;

  -- Un fallo que declara ganador a quien tiene menos puntos se contradice solo.
  if (p_winner_id = v_match.player_a_id and p_score_a < p_score_b)
     or (p_winner_id = v_match.player_b_id and p_score_b < p_score_a) then
    raise exception 'El marcador contradice al ganador que declaraste';
  end if;

  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Hay que dejar escrito por qué se resolvió así';
  end if;

  update matches set
    score_a = p_score_a,
    score_b = p_score_b,
    winner_id = p_winner_id,
    arbitrated_by = v_judge,
    arbitrated_at = now(),
    arbitration_reason = trim(p_reason)
  where id = p_match_id;

  perform apply_match_confirmation(p_match_id, v_judge);
end;
$$;

grant execute on function resolve_dispute(uuid, uuid, int, int, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Registrar una infracción
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Reglamento:
--   Leve    → dos advertencias DEL MISMO TIPO en un combate dan 1 punto al rival.
--   Grave   → el infractor pierde el combate.
--   Crítica → pierde el combate y queda marcada para que la administración
--             decida expulsión, suspensión o baneo (suspend_player).

create or replace function register_penalty(
  p_match_id uuid,
  p_player_id uuid,
  p_code text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_judge uuid;
  v_severity text;
  v_same_code int;
  v_awarded boolean := false;
  v_forfeit boolean := false;
  v_rival uuid;
  v_offender_is_a boolean;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status = 'confirmed' then
    raise exception 'Este combate ya está cerrado';
  end if;

  select id into v_judge from players where auth_user_id = auth.uid();
  if v_judge is null then
    raise exception 'No autorizado';
  end if;
  if not can_arbitrate(v_judge, p_match_id) then
    raise exception 'Solo un juez puede sancionar este combate';
  end if;

  if p_player_id not in (v_match.player_a_id, v_match.player_b_id) then
    raise exception 'Ese jugador no participa en este combate';
  end if;

  select severity into v_severity from penalty_codes where code = p_code;
  if v_severity is null then
    raise exception 'Infracción desconocida: %', p_code;
  end if;

  v_offender_is_a := p_player_id = v_match.player_a_id;
  v_rival := case when v_offender_is_a then v_match.player_b_id else v_match.player_a_id end;

  if v_severity = 'leve' then
    select count(*) into v_same_code
    from penalties
    where match_id = p_match_id and player_id = p_player_id and code = p_code;

    -- La que va a entrar es la (v_same_code + 1). Cada par de infracciones del
    -- mismo tipo otorga un punto: la 2ª, la 4ª, etc.
    if (v_same_code + 1) % 2 = 0 then
      v_awarded := true;
      if v_offender_is_a then
        update matches set penalty_points_b = penalty_points_b + 1 where id = p_match_id;
      else
        update matches set penalty_points_a = penalty_points_a + 1 where id = p_match_id;
      end if;
    end if;
  else
    v_forfeit := true;
  end if;

  insert into penalties (match_id, player_id, judge_id, code, severity, notes, awarded_point, forfeited_match)
  values (p_match_id, p_player_id, v_judge, p_code, v_severity, nullif(trim(coalesce(p_notes, '')), ''), v_awarded, v_forfeit);

  -- El marcador oficial siempre es rounds + penalizaciones.
  update matches m set
    score_a = coalesce((select sum(points) from match_rounds r where r.match_id = m.id and r.winner_id = m.player_a_id), 0) + m.penalty_points_a,
    score_b = coalesce((select sum(points) from match_rounds r where r.match_id = m.id and r.winner_id = m.player_b_id), 0) + m.penalty_points_b
  where m.id = p_match_id;

  if v_forfeit then
    update matches set
      winner_id = v_rival,
      arbitrated_by = v_judge,
      arbitrated_at = now(),
      arbitration_reason = 'Infracción ' || v_severity || ': ' ||
        (select label from penalty_codes where code = p_code)
    where id = p_match_id;

    perform apply_match_confirmation(p_match_id, v_judge);
  end if;

  return jsonb_build_object(
    'severity', v_severity,
    'awarded_point', v_awarded,
    'forfeited_match', v_forfeit
  );
end;
$$;

grant execute on function register_penalty(uuid, uuid, text, text) to authenticated;

-- Nombrar jueces.
--
-- Va por función y no por UPDATE directo porque la política de `players` (0003)
-- solo deja que cada quien edite SU propia fila: un admin tocando la fila de
-- otro no da error, simplemente no afecta ninguna fila y el botón parece roto.
create or replace function set_judge_role(p_player_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
begin
  select id into v_caller from players where auth_user_id = auth.uid() and is_admin = true;
  if v_caller is null then
    raise exception 'Solo la administración nombra jueces';
  end if;
  if p_role not in ('none', 'support', 'principal') then
    raise exception 'Rol de juez inválido: %', p_role;
  end if;

  update players set judge_role = p_role where id = p_player_id;
end;
$$;

grant execute on function set_judge_role(uuid, text) to authenticated;

-- Suspensión / baneo por infracción crítica. Solo administración.
create or replace function suspend_player(p_player_id uuid, p_days int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
begin
  select id into v_caller from players where auth_user_id = auth.uid() and is_admin = true;
  if v_caller is null then
    raise exception 'Solo la administración puede suspender a un jugador';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Hay que dejar escrita la razón de la suspensión';
  end if;

  update players set
    suspended_until = case when p_days is null then 'infinity'::timestamptz else now() + make_interval(days => p_days) end
  where id = p_player_id;

  insert into penalties (match_id, player_id, judge_id, code, severity, notes)
  values (null, p_player_id, v_caller, 'unsportsmanlike', 'critica', trim(p_reason));
end;
$$;

grant execute on function suspend_player(uuid, int, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. El reporte tiene que contar los puntos de penalización
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Misma función de 0020 con un solo cambio real: el marcador no arranca en 0–0,
-- arranca en los puntos que ya otorgaron las sanciones. Si no, un reporte
-- posterior borraría el punto que el juez le dio al rival.

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
