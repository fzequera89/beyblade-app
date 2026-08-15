-- Round robin por categoría y torneo inicial (G3).
--
-- El reglamento describe el torneo de ranking en dos fases: primero un
-- ROUND ROBIN DENTRO DE CADA CATEGORÍA (un grupo de 5 juega 4 combates y se
-- reacomoda internamente), y después el RETO DE ASCENSO del 1º contra el último
-- de la categoría superior (eso ya existe desde 0031).
--
-- Hasta hoy el motor sabía armar "grupos", pero los repartía por siembra: el
-- grupo era una consecuencia del orden de ELO, no de la categoría. Para el
-- reglamento el grupo ES la categoría, así que hace falta una estructura que
-- sepa de dónde salen los grupos.
--
-- Tres piezas:
--   1. La fase 'category_rr' — el motor de emparejamiento arma un todos contra
--      todos DENTRO de cada categoría (y de cada división, si están abiertas).
--   2. `enroll_season_in_tournament` — inscribe de una vez a la temporada
--      entera. Sin esto la organización tendría que inscribir a mano a los 30,
--      o cada jugador inscribirse solo, cuando ya está inscrito en la temporada.
--   3. `seed_season_from_tournament` — el torneo inicial G3: el resultado de una
--      eliminación directa fija la POSICIÓN inicial de cada quien dentro de su
--      categoría. Es lo que el reglamento pide para arrancar una temporada.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La fase por categoría
-- ─────────────────────────────────────────────────────────────────────────────

alter table tournament_phases drop constraint if exists tournament_phases_kind_check;
alter table tournament_phases add constraint tournament_phases_kind_check
  check (kind in ('round_robin', 'blocks', 'swiss', 'single_elim', 'double_elim', 'category_rr'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Inscribir a la temporada completa
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Solo a los ACTIVOS: quien fue eliminado por inasistencia (0031) no entra al
-- torneo de ranking hasta que reingrese. Y sin check-in — presentarse el día del
-- torneo sigue siendo un acto aparte, que es justo lo que la asistencia mide.

create or replace function enroll_season_in_tournament(p_tournament_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_league uuid;
  v_season uuid;
  v_added int;
begin
  select id into v_caller from players where auth_user_id = auth.uid();

  select league_id, season_id into v_league, v_season
  from tournaments where id = p_tournament_id;

  if v_league is null then
    raise exception 'Torneo no encontrado';
  end if;

  if v_season is null then
    raise exception 'Este torneo no pertenece a ninguna temporada';
  end if;

  if not (
    exists (select 1 from players where id = v_caller and is_admin = true)
    or exists (
      select 1 from league_members
      where player_id = v_caller and league_id = v_league and role = 'organizer'
    )
  ) then
    raise exception 'Solo la organización de la liga inscribe a la temporada completa';
  end if;

  insert into tournament_registrations (tournament_id, player_id)
  select p_tournament_id, s.player_id
  from season_standings s
  where s.season_id = v_season
    and s.active = true
    and not exists (
      select 1 from tournament_registrations r
      where r.tournament_id = p_tournament_id and r.player_id = s.player_id
    );

  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

grant execute on function enroll_season_in_tournament(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Los grupos de la fase por categoría
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Devuelve, para los jugadores CON CHECK-IN de un torneo, a qué grupo pertenece
-- cada uno y en qué orden va dentro de él. El emparejamiento se arma en el
-- cliente (motor puro, probado con `npm run test:formats`); lo que no puede
-- hacer el cliente es cruzar el escalafón, porque son tres tablas.
--
-- El orden dentro del grupo importa: el método del círculo empareja al primero
-- con el último, así que entrar ordenado por posición reparte los cruces fuertes
-- a lo largo de la fase en vez de amontonarlos en la ronda 1.

create or replace function tournament_category_groups(p_tournament_id uuid)
returns table (
  player_id uuid,
  category_code text,
  division text,
  tier int,
  position int
)
language sql
stable
security definer
set search_path = public
as $$
  select s.player_id,
         s.category_code,
         s.division,
         c.tier,
         s.position
  from tournament_registrations r
  join tournaments t on t.id = r.tournament_id
  join season_standings s on s.season_id = t.season_id and s.player_id = r.player_id
  join categories c on c.code = s.category_code
  where r.tournament_id = p_tournament_id
    and r.checked_in_at is not null
    and s.active = true
  order by c.tier desc, s.division nulls first, s.position nulls last, s.joined_at;
$$;

grant execute on function tournament_category_groups(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Torneo inicial (G3): el resultado fija la posición de arranque
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Torneo inicial = eliminación directa (G3) para fijar la posición inicial."
--
-- El orden sale de HASTA DÓNDE LLEGÓ cada quien, que es lo que mide una
-- eliminación directa: la ronda más alta que jugó, y si la ganó o no. Los
-- empates se rompen con victorias y diferencia de puntos del torneo.
--
-- Solo reordena DENTRO de cada categoría. Un torneo no cambia de categoría a
-- nadie —para eso está el reto de ascenso—, fija el orden de arranque.

create or replace function seed_season_from_tournament(p_season_id uuid, p_tournament_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_league uuid;
  v_tournament_season uuid;
  v_touched int;
begin
  select id into v_caller from players where auth_user_id = auth.uid();
  select league_id into v_league from seasons where id = p_season_id;

  if v_league is null then
    raise exception 'Temporada no encontrada';
  end if;

  if not (
    exists (select 1 from players where id = v_caller and is_admin = true)
    or exists (
      select 1 from league_members
      where player_id = v_caller and league_id = v_league and role = 'organizer'
    )
  ) then
    raise exception 'Solo la organización de la liga siembra las posiciones';
  end if;

  select season_id into v_tournament_season from tournaments where id = p_tournament_id;
  if v_tournament_season is distinct from p_season_id then
    raise exception 'Ese torneo no pertenece a esta temporada';
  end if;

  with played as (
    select m.player_a_id as player_id, m.bracket_round,
           (m.winner_id = m.player_a_id) as won,
           m.score_a as pf, m.score_b as pa
    from matches m
    where m.tournament_id = p_tournament_id and m.status = 'confirmed'
    union all
    select m.player_b_id, m.bracket_round,
           (m.winner_id = m.player_b_id),
           m.score_b, m.score_a
    from matches m
    where m.tournament_id = p_tournament_id and m.status = 'confirmed'
  ),
  summary as (
    select player_id,
           max(bracket_round) as depth,
           count(*) filter (where won) as wins,
           sum(pf) - sum(pa) as diff
    from played
    group by player_id
  ),
  last_result as (
    select p.player_id, bool_or(p.won) as won_last
    from played p
    join summary s on s.player_id = p.player_id and p.bracket_round = s.depth
    group by p.player_id
  ),
  ranked as (
    select s.player_id,
           st.category_code,
           st.division,
           row_number() over (
             partition by st.category_code, st.division
             order by s.depth desc, l.won_last desc, s.wins desc, s.diff desc
           ) as new_position
    from summary s
    join last_result l on l.player_id = s.player_id
    join season_standings st
      on st.season_id = p_season_id and st.player_id = s.player_id
    where st.active = true
  )
  update season_standings st
  set position = r.new_position
  from ranked r
  where st.season_id = p_season_id and st.player_id = r.player_id;

  get diagnostics v_touched = row_count;
  return v_touched;
end;
$$;

grant execute on function seed_season_from_tournament(uuid, uuid) to authenticated;
