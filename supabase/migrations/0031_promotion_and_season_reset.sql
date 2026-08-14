-- Reto de ascenso, divisiones por cupo y cierre de temporada.
--
-- Segunda mitad del bloque del reglamento (secciones II, III y V). La 0030
-- puso el escalafón y los VP; esto pone lo que lo hace MOVERSE.
--
-- ── Decisiones que tomé, y que hay que confirmar con el cliente ──────────────
--
-- 1. **El reto de ascenso lo abre el organizador, no es automático.** El
--    reglamento lo llama "Fase de Desafío" dentro de un torneo de ranking, y
--    dice que el 1º "PUEDE retar" — es un derecho que se ejerce, no algo que
--    ocurra solo. Además necesita que el round robin haya terminado para saber
--    quién es 1º. Automatizarlo obligaría a decidir cuándo cierra la fase, que
--    el reglamento no define.
--
-- 2. **Se juega como un combate normal.** Reutiliza todo el flujo que ya
--    existe: reporte round a round, doble marca a ciegas, aprobación del juez,
--    ELO. Lo único distinto es qué pasa DESPUÉS de que se confirma.
--
-- 3. **El cierre de temporada es manual.** El reglamento dice "al finalizar se
--    realiza un reinicio", que es un acto de la administración, no un reloj. Un
--    reset automático por fecha borraría una tabla en medio de un torneo si
--    alguien se pasó de la fecha.
--
-- 4. **Al cerrar, cada quien conserva su categoría** y se reinician posiciones,
--    VP y marcadores. El reglamento habla de "reinicio de posiciones para
--    reestructurar categorías": el movimiento ENTRE categorías es el reto de
--    ascenso, no el reset.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Retos de ascenso
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists promotion_challenges (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  challenger_id uuid not null references players(id) on delete cascade,
  defender_id uuid not null references players(id) on delete cascade,
  -- Categorías al momento de abrir el reto: si el reto se resuelve tarde, hay
  -- que saber qué se estaba disputando, no lo que dice la tabla hoy.
  challenger_category text not null references categories(code),
  defender_category text not null references categories(code),
  match_id uuid references matches(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'won', 'lost')),
  created_by uuid references players(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists promotion_challenges_match_idx on promotion_challenges (match_id);
create index if not exists promotion_challenges_season_idx on promotion_challenges (season_id, status);

alter table promotion_challenges enable row level security;

drop policy if exists "promotion_challenges_read" on promotion_challenges;
create policy "promotion_challenges_read" on promotion_challenges for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Abrir un reto de ascenso
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Reglamento: "El 1º lugar de una categoría puede retar al último lugar de la
-- categoría inmediata superior". Las dos puntas se calculan con la misma
-- función de tabla que ve el jugador, para que no haya dos verdades sobre
-- quién va primero.

create or replace function open_promotion_challenge(
  p_season_id uuid,
  p_challenger_id uuid,
  p_tournament_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_league uuid;
  v_cat text;
  v_tier int;
  v_upper text;
  v_first uuid;
  v_defender uuid;
  v_match uuid;
  v_id uuid;
begin
  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    raise exception 'No autorizado';
  end if;

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
    raise exception 'Solo la organización de la liga abre un reto de ascenso';
  end if;

  select category_code into v_cat from season_standings
  where season_id = p_season_id and player_id = p_challenger_id;
  if v_cat is null then
    raise exception 'Ese jugador no está inscrito en la temporada';
  end if;

  select tier into v_tier from categories where code = v_cat;

  -- La categoría inmediata superior es la del tier siguiente que tenga gente.
  select c.code into v_upper
  from categories c
  where c.tier > v_tier
    and exists (
      select 1 from season_standings s
      where s.season_id = p_season_id and s.category_code = c.code and s.active
    )
  order by c.tier asc
  limit 1;

  if v_upper is null then
    raise exception 'No hay categoría superior con jugadores: ya está en lo más alto';
  end if;

  -- El retador tiene que ir 1º de la suya.
  select o.player_id into v_first
  from season_standings_ordered(p_season_id, v_cat) o
  where o.place = 1
  limit 1;

  if v_first is distinct from p_challenger_id then
    raise exception 'Solo el 1º de la categoría puede retar al ascenso';
  end if;

  -- El defensor es el ÚLTIMO de la superior.
  select o.player_id into v_defender
  from season_standings_ordered(p_season_id, v_upper) o
  where o.active
  order by o.place desc
  limit 1;

  if v_defender is null then
    raise exception 'La categoría superior no tiene a nadie activo';
  end if;

  if exists (
    select 1 from promotion_challenges
    where season_id = p_season_id and challenger_id = p_challenger_id and status = 'pending'
  ) then
    raise exception 'Ese jugador ya tiene un reto de ascenso abierto';
  end if;

  -- Se juega como un combate de ranking cualquiera: reporte, doble marca,
  -- aprobación del juez y ELO. Lo único distinto pasa al confirmarse.
  insert into matches (tournament_id, league_id, player_a_id, player_b_id, mode)
  values (p_tournament_id, v_league, p_challenger_id, v_defender, 'ranking')
  returning id into v_match;

  insert into promotion_challenges (
    season_id, challenger_id, defender_id,
    challenger_category, defender_category, match_id, created_by
  )
  values (p_season_id, p_challenger_id, v_defender, v_cat, v_upper, v_match, v_caller)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function open_promotion_challenge(uuid, uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Resolverlo cuando el combate se confirma
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Reglamento: "Si el retador gana, intercambian posiciones en la tabla para el
-- siguiente torneo. Si pierde, ambos mantienen su lugar."
--
-- Intercambian POSICIONES, o sea categoría y puesto: el retador sube al puesto
-- que ocupaba el defensor, y el defensor baja al que ocupaba el retador. Los VP
-- acumulados NO se intercambian — son de la temporada del jugador, no del
-- asiento en la tabla.

create or replace function resolve_promotion_challenge(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pc promotion_challenges%rowtype;
  v_match matches%rowtype;
  v_ch_cat text; v_ch_pos int; v_ch_div text;
  v_df_cat text; v_df_pos int; v_df_div text;
begin
  select * into v_pc from promotion_challenges
  where match_id = p_match_id and status = 'pending'
  for update;
  if not found then return; end if;

  select * into v_match from matches where id = p_match_id;
  if v_match.winner_id is null then return; end if;

  if v_match.winner_id = v_pc.challenger_id then
    select category_code, position, division into v_ch_cat, v_ch_pos, v_ch_div
    from season_standings
    where season_id = v_pc.season_id and player_id = v_pc.challenger_id;

    select category_code, position, division into v_df_cat, v_df_pos, v_df_div
    from season_standings
    where season_id = v_pc.season_id and player_id = v_pc.defender_id;

    update season_standings
      set category_code = v_df_cat, position = v_df_pos, division = v_df_div
    where season_id = v_pc.season_id and player_id = v_pc.challenger_id;

    update season_standings
      set category_code = v_ch_cat, position = v_ch_pos, division = v_ch_div
    where season_id = v_pc.season_id and player_id = v_pc.defender_id;

    update promotion_challenges
      set status = 'won', resolved_at = now()
    where id = v_pc.id;
  else
    -- Pierde: ambos mantienen su lugar. El combate igual contó para ELO y VP.
    update promotion_challenges
      set status = 'lost', resolved_at = now()
    where id = v_pc.id;
  end if;
end;
$$;

revoke all on function resolve_promotion_challenge(uuid) from public, anon, authenticated;

-- Se engancha en el punto de extensión que dejó 0030, en vez de reescribir
-- `apply_match_confirmation` por cuarta vez.
create or replace function apply_league_effects(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform apply_vp_for_match(p_match_id);
  perform resolve_promotion_challenge(p_match_id);
end;
$$;

revoke all on function apply_league_effects(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Divisiones cuando una categoría se pasa de cupo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Reglamento: máximo 10 por rango; si se supera, se abren divisiones (Oro A /
-- Oro B). Se reparte por posición en zigzag —1º a la A, 2º a la B, 3º a la A…—
-- para que las dos divisiones queden parejas en nivel. Repartir por corte
-- (los 10 mejores a la A) dejaría una división de élite y otra de relleno.

create or replace function rebalance_divisions(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_league uuid;
  v_cat record;
  v_count int;
  v_cap int;
  v_row record;
  v_i int;
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
    raise exception 'Solo la organización de la liga reorganiza divisiones';
  end if;

  for v_cat in select code, max_capacity from categories where max_capacity is not null
  loop
    select count(*) into v_count from season_standings
    where season_id = p_season_id and category_code = v_cat.code and active;

    v_cap := v_cat.max_capacity;

    if v_count > v_cap then
      v_i := 0;
      for v_row in
        select player_id from season_standings_ordered(p_season_id, v_cat.code)
        order by place
      loop
        update season_standings
          set division = case when v_i % 2 = 0 then 'A' else 'B' end
        where season_id = p_season_id and player_id = v_row.player_id;
        v_i := v_i + 1;
      end loop;
    else
      -- Cabe en una sola: se quitan las divisiones que hubiera.
      update season_standings set division = null
      where season_id = p_season_id and category_code = v_cat.code;
    end if;
  end loop;
end;
$$;

grant execute on function rebalance_divisions(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cerrar la temporada y sembrar la siguiente
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Qué hace, en orden:
--   1. Cuenta un título a quien terminó 1º de su categoría (para el Challenger,
--      que se gana al llegar 1º cinco veces).
--   2. Da el estatus Challenger, con un año de vigencia, a quien llegue a 5.
--   3. Siembra la temporada siguiente: cada quien conserva CATEGORÍA, y se
--      reinician posiciones, VP y marcadores.
--   4. Los eliminados por inasistencia reingresan al ÚLTIMO puesto de
--      Porcelana. El Challenger vigente es inmune a eso.

create or replace function close_season(p_season_id uuid, p_next_season_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_league uuid;
  v_row record;
  v_porcelana int;
  v_pos int;
begin
  select id into v_caller from players where auth_user_id = auth.uid();
  select league_id into v_league from seasons where id = p_season_id;
  if v_league is null then
    raise exception 'Temporada no encontrada';
  end if;
  if not exists (select 1 from seasons where id = p_next_season_id and league_id = v_league) then
    raise exception 'La temporada siguiente tiene que ser de la misma liga';
  end if;
  if p_season_id = p_next_season_id then
    raise exception 'La temporada siguiente no puede ser la misma';
  end if;

  if not (
    exists (select 1 from players where id = v_caller and is_admin = true)
    or exists (
      select 1 from league_members
      where player_id = v_caller and league_id = v_league and role = 'organizer'
    )
  ) then
    raise exception 'Solo la organización de la liga cierra una temporada';
  end if;

  -- 1 y 2. Títulos de categoría y ascenso a Challenger.
  for v_row in
    select o.player_id from season_standings_ordered(p_season_id, null) o where o.place = 1
  loop
    update players set category_titles = category_titles + 1 where id = v_row.player_id;

    update players
      set challenger_until = greatest(
        coalesce(challenger_until, current_date),
        current_date + interval '1 year'
      )::date
    where id = v_row.player_id and category_titles >= 5;
  end loop;

  -- 3 y 4. Sembrar la siguiente.
  select coalesce(max(position), 0) into v_porcelana
  from season_standings
  where season_id = p_next_season_id and category_code = 'porcelana';

  for v_row in
    select s.player_id, s.category_code, s.active, s.position,
           (p.challenger_until is not null and p.challenger_until >= current_date) as is_challenger
    from season_standings s
    join players p on p.id = s.player_id
    where s.season_id = p_season_id
    order by s.category_code, s.position
  loop
    if v_row.active or v_row.is_challenger then
      v_pos := v_row.position;
      insert into season_standings (season_id, player_id, category_code, position)
      values (p_next_season_id, v_row.player_id, v_row.category_code, v_pos)
      on conflict (season_id, player_id) do nothing;
    else
      -- Reingreso por inasistencia: último puesto de Porcelana.
      v_porcelana := v_porcelana + 1;
      insert into season_standings (season_id, player_id, category_code, position)
      values (p_next_season_id, v_row.player_id, 'porcelana', v_porcelana)
      on conflict (season_id, player_id) do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function close_season(uuid, uuid) to authenticated;

-- Marcar a alguien como eliminado por inasistencia (o reactivarlo).
create or replace function set_season_attendance(p_season_id uuid, p_player_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_league uuid;
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
    raise exception 'Solo la organización de la liga marca la asistencia';
  end if;

  update season_standings set active = p_active
  where season_id = p_season_id and player_id = p_player_id;
end;
$$;

grant execute on function set_season_attendance(uuid, uuid, boolean) to authenticated;
