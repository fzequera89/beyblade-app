-- Categorías, escalafón por temporada y Puntos de Victoria (VP).
--
-- ── De dónde sale esto ───────────────────────────────────────────────────────
--
-- Reglamento DML, secciones II a IV. Es el sistema competitivo REAL de la liga,
-- y hasta hoy no existía nada: `RANKS` vivía en `src/theme.ts` como decoración
-- que ninguna pantalla usaba.
--
-- ── Lo que NO es esto: el ELO ────────────────────────────────────────────────
--
-- El ELO y los VP miden cosas distintas y conviven a propósito (decisión ya
-- cerrada con el cliente):
--
--   ELO  → habilidad personal, global, cruza ligas y temporadas. Es lo que hace
--          útil el emparejamiento y el League Passport. No se resetea nunca.
--   VP   → posición oficial en la liga, por temporada, se resetea cada 3 meses.
--          Es lo que dice el reglamento y lo que define ascensos y descensos.
--
-- Ninguno se calcula a partir del otro. Un jugador puede tener ELO alto y estar
-- en Bronce porque acaba de entrar, y eso está bien.
--
-- ── Decisiones que tomé, y que hay que confirmar con el cliente ──────────────
--
-- 1. **VP de Challenger = 3.** El reglamento da la tabla para Diamante/Platino
--    (3), Oro/Plata (2) y Bronce/Hierro/Porcelana (1), pero NO dice cuánto vale
--    Challenger. Se asume la banda superior por ser el estrato más alto. Está
--    en la tabla `categories`, así que cambiarlo es un UPDATE, no una migración.
--
-- 2. **`tier` cuenta al revés que el reglamento.** El documento lista "de mayor
--    a menor" (Challenger = 1). Aquí Challenger = 8 y Porcelana = 1, para que
--    "la categoría inmediata superior" sea `tier + 1` y no `tier - 1`. Se lee
--    peor en el papel y mucho mejor en el código.
--
-- 3. **La derrota RESTA.** El reglamento es explícito: "3 VP (Win) / 3 VP
--    (Loss)". No es un marcador acumulativo, es un balance — se puede terminar
--    la temporada en negativo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Catálogo de categorías
-- ─────────────────────────────────────────────────────────────────────────────
--
-- En tabla y no en código, por la misma razón que los badges y las
-- penalizaciones: el cliente puede corregir un nombre, un cupo o un valor de VP
-- sin que nadie toque el repo ni genere un build.

create table if not exists categories (
  code text primary key,
  label text not null,
  tier int not null unique,
  vp_value int not null,
  max_capacity int,
  note text
);

insert into categories (code, label, tier, vp_value, max_capacity, note) values
  ('porcelana',  'Porcelana',  1, 1, 20, 'Iniciación. Todos los nuevos entran aquí. Cupo al doble de las superiores para no bloquear el ingreso.'),
  ('hierro',     'Hierro',     2, 1, 10, null),
  ('bronce',     'Bronce',     3, 1, 10, null),
  ('plata',      'Plata',      4, 2, 10, null),
  ('oro',        'Oro',        5, 2, 10, null),
  ('platino',    'Platino',    6, 3, 10, null),
  ('diamante',   'Diamante',   7, 3, 10, 'Habilitados como jueces de apoyo.'),
  ('challenger', 'Challenger', 8, 3, null, 'Élite. Sin cupo. El VP de 3 es una ASUNCIÓN: el reglamento no lo especifica.')
on conflict (code) do update set
  label = excluded.label,
  tier = excluded.tier,
  vp_value = excluded.vp_value,
  max_capacity = excluded.max_capacity,
  note = excluded.note;

alter table categories enable row level security;

drop policy if exists "categories_read" on categories;
create policy "categories_read" on categories for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Estatus Challenger — es del JUGADOR, no de la temporada
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El reglamento le da vigencia de 1 año e inmunidad al reseteo por
-- inasistencia, así que no puede vivir en la tabla de la temporada: sobrevive
-- a los resets. Se accede al llegar 1º de la tabla en 5 ocasiones.

alter table players add column if not exists challenger_until date;
alter table players add column if not exists category_titles int not null default 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. El escalafón: dónde está cada jugador en cada temporada
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists season_standings (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  category_code text not null references categories(code),
  -- Cuando una categoría pasa de su cupo se abren divisiones (Oro A / Oro B).
  division text,
  position int,
  vp int not null default 0,
  points_for int not null default 0,
  points_against int not null default 0,
  matches_won int not null default 0,
  matches_lost int not null default 0,
  -- false = eliminado por inasistencia. No se borra la fila: el historial de la
  -- temporada tiene que seguir cuadrando aunque alguien deje de asistir.
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (season_id, player_id)
);

create index if not exists season_standings_season_idx
  on season_standings (season_id, category_code, division);

alter table season_standings enable row level security;

-- La tabla de posiciones es pública dentro de la liga: es el punto entero.
drop policy if exists "season_standings_read" on season_standings;
create policy "season_standings_read" on season_standings for select to authenticated using (true);

-- Sin políticas de escritura: todo entra por función.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Inscribir a alguien en una temporada
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Reglamento: "Nuevos: Inician obligatoriamente en Porcelana". La única
-- excepción es el Challenger, que tiene "elección de categoría para competir" —
-- por eso la función acepta una categoría explícita, pero solo se la permite a
-- quien tenga el estatus vigente.

create or replace function enroll_in_season(
  p_season_id uuid,
  p_player_id uuid,
  p_category_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_league uuid;
  v_is_organizer boolean;
  v_category text;
  v_is_challenger boolean;
  v_last int;
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

  v_is_organizer := exists (
    select 1 from league_members lm
    where lm.player_id = v_caller and lm.league_id = v_league and lm.role = 'organizer'
  ) or exists (select 1 from players where id = v_caller and is_admin = true);

  -- O te inscribes tú, o te inscribe quien organiza la liga.
  if v_caller <> p_player_id and not v_is_organizer then
    raise exception 'No puedes inscribir a otro jugador';
  end if;

  if not exists (
    select 1 from league_members where league_id = v_league and player_id = p_player_id
  ) then
    raise exception 'El jugador no es miembro de esta liga';
  end if;

  select (challenger_until is not null and challenger_until >= current_date)
    into v_is_challenger
  from players where id = p_player_id;

  if p_category_code is null then
    v_category := 'porcelana';
  elsif p_category_code = 'porcelana' then
    v_category := 'porcelana';
  elsif v_is_challenger or v_is_organizer then
    -- El Challenger elige categoría; el organizador puede sembrar la tabla
    -- inicial de una temporada (el torneo G3 fija posiciones de arranque).
    if not exists (select 1 from categories where code = p_category_code) then
      raise exception 'Categoría desconocida: %', p_category_code;
    end if;
    v_category := p_category_code;
  else
    raise exception 'Los jugadores nuevos entran en Porcelana';
  end if;

  -- Entra al final de su categoría.
  select coalesce(max(position), 0) into v_last
  from season_standings
  where season_id = p_season_id and category_code = v_category;

  insert into season_standings (season_id, player_id, category_code, position)
  values (p_season_id, p_player_id, v_category, v_last + 1)
  on conflict (season_id, player_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from season_standings
    where season_id = p_season_id and player_id = p_player_id;
  end if;

  return v_id;
end;
$$;

grant execute on function enroll_in_season(uuid, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Los VP se acreditan al cerrar el combate
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Solo cuentan los combates DE RANKING que pertenecen a un torneo con
-- temporada. Los casuales no puntúan ("sin presión de ranking") y los retos
-- sueltos son casuales desde 0027, así que quedan fuera solos.
--
-- El valor lo pone la categoría DE CADA JUGADOR, no la del rival: por eso un
-- Diamante arriesga 3 y un Porcelana 1 en el mismo combate.

create or replace function apply_vp_for_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_season uuid;
  v_a season_standings%rowtype;
  v_b season_standings%rowtype;
  v_vp_a int;
  v_vp_b int;
  v_a_won boolean;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then return; end if;

  -- Casual no puntúa.
  if v_match.mode is not distinct from 'casual' then return; end if;
  if v_match.winner_id is null then return; end if;

  select season_id into v_season from tournaments where id = v_match.tournament_id;
  if v_season is null then return; end if;

  select * into v_a from season_standings
  where season_id = v_season and player_id = v_match.player_a_id;
  select * into v_b from season_standings
  where season_id = v_season and player_id = v_match.player_b_id;

  -- Si alguno no está inscrito en la temporada, este combate no mueve la tabla.
  if v_a.id is null or v_b.id is null then return; end if;

  select vp_value into v_vp_a from categories where code = v_a.category_code;
  select vp_value into v_vp_b from categories where code = v_b.category_code;

  v_a_won := (v_match.winner_id = v_match.player_a_id);

  update season_standings set
    vp = vp + case when v_a_won then v_vp_a else -v_vp_a end,
    points_for = points_for + v_match.score_a,
    points_against = points_against + v_match.score_b,
    matches_won = matches_won + case when v_a_won then 1 else 0 end,
    matches_lost = matches_lost + case when v_a_won then 0 else 1 end
  where id = v_a.id;

  update season_standings set
    vp = vp + case when v_a_won then -v_vp_b else v_vp_b end,
    points_for = points_for + v_match.score_b,
    points_against = points_against + v_match.score_a,
    matches_won = matches_won + case when v_a_won then 0 else 1 end,
    matches_lost = matches_lost + case when v_a_won then 1 else 0 end
  where id = v_b.id;
end;
$$;

revoke all on function apply_vp_for_match(uuid) from public, anon, authenticated;

-- Punto de extensión para todo lo que la LIGA (no el ELO) tiene que hacer al
-- cerrarse un combate. Existe para que lo que venga después —resolver un reto
-- de ascenso, contar asistencia— se enganche AQUÍ y no obligue a reescribir
-- `apply_match_confirmation`, que ya son 150 líneas. Tener esa función copiada
-- en varios lados es justo lo que 0022 vino a evitar.

create or replace function apply_league_effects(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform apply_vp_for_match(p_match_id);
end;
$$;

revoke all on function apply_league_effects(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Engancharlo al cierre del combate
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Misma función de 0029 con una línea nueva al final. Se llama después de todo
-- lo demás porque lee `matches` ya actualizado (marcador y ganador definitivos,
-- incluidas las penalizaciones).

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

  v_ranked := (v_match.mode is distinct from 'casual');

  v_sa := case when v_match.winner_id = v_player_a.id then 1 else 0 end;
  v_sb := 1 - v_sa;

  if v_ranked then
    v_ea := 1.0 / (1 + power(10, (v_player_b.elo_rating - v_player_a.elo_rating) / 400.0));
    v_eb := 1 - v_ea;

    v_d := abs(v_match.score_a - v_match.score_b);
    v_m := least(1.30, 1 + 0.20 * ln(v_d + 1));

    v_ka := case when v_player_a.ranked_matches_played < 10 then 40 else 24 end;
    v_kb := case when v_player_b.ranked_matches_played < 10 then 40 else 24 end;

    v_delta_a := round(v_ka * v_m * (v_sa - v_ea), 2);
    v_delta_b := round(v_kb * v_m * (v_sb - v_eb), 2);
  else
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

  if v_ranked then
    insert into ranking_snapshots (scope, scope_id, player_id, rating)
    values
      ('global', null, v_player_a.id, v_player_a.elo_rating + v_delta_a),
      ('global', null, v_player_b.id, v_player_b.elo_rating + v_delta_b);
  end if;

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

  -- Escalafón del reglamento. Va al final: lee el marcador ya definitivo.
  perform apply_league_effects(p_match_id);
end;
$$;

revoke all on function apply_match_confirmation(uuid, uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. La tabla de posiciones, con los 4 criterios de desempate
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Reglamento, en orden: 1) diferencia de puntos, 2) enfrentamiento directo,
-- 3) antigüedad, 4) orden alfabético.
--
-- El enfrentamiento directo es el difícil: no es un valor por jugador, es una
-- relación entre dos. Ordenarlo bien para un empate de 3+ jugadores requeriría
-- resolver un grafo. Aquí se generaliza como **victorias contra los demás
-- jugadores empatados en VP y diferencia** — para el caso de dos, que es el que
-- el reglamento describe, da exactamente el mismo resultado.

create or replace function season_standings_ordered(p_season_id uuid, p_category text default null)
returns table (
  player_id uuid,
  display_name text,
  category_code text,
  division text,
  vp int,
  points_for int,
  points_against int,
  point_diff int,
  matches_won int,
  matches_lost int,
  h2h_wins int,
  active boolean,
  tier int,
  place int
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      s.player_id,
      p.display_name,
      s.category_code,
      s.division,
      s.vp,
      s.points_for,
      s.points_against,
      s.points_for - s.points_against as point_diff,
      s.matches_won,
      s.matches_lost,
      s.active,
      s.joined_at,
      c.tier
    from season_standings s
    join players p on p.id = s.player_id
    join categories c on c.code = s.category_code
    where s.season_id = p_season_id
      and (p_category is null or s.category_code = p_category)
  ),
  -- Los que empatan en VP y en diferencia de puntos: entre ellos decide el
  -- enfrentamiento directo.
  h2h as (
    select
      b.player_id,
      (
        select count(*)::int
        from matches m
        join tournaments t on t.id = m.tournament_id
        join base b2
          on b2.player_id = case
               when m.player_a_id = b.player_id then m.player_b_id
               else m.player_a_id
             end
        where t.season_id = p_season_id
          and m.status = 'confirmed'
          and m.mode is distinct from 'casual'
          and m.winner_id = b.player_id
          and b.player_id in (m.player_a_id, m.player_b_id)
          and b2.player_id <> b.player_id
          and b2.vp = b.vp
          and b2.point_diff = b.point_diff
          and b2.category_code = b.category_code
      ) as h2h_wins
    from base b
  )
  select
    b.player_id,
    b.display_name,
    b.category_code,
    b.division,
    b.vp,
    b.points_for,
    b.points_against,
    b.point_diff,
    b.matches_won,
    b.matches_lost,
    h.h2h_wins,
    b.active,
    b.tier,
    row_number() over (
      partition by b.category_code, b.division
      order by
        b.active desc,          -- los eliminados por inasistencia van al final
        b.vp desc,              -- 1. VP
        b.point_diff desc,      -- 2. diferencia de puntos
        h.h2h_wins desc,        -- 3. enfrentamiento directo
        b.joined_at asc,        -- 4. antigüedad
        b.display_name asc      -- 5. orden alfabético
    )::int as place
  from base b
  join h2h h on h.player_id = b.player_id
  order by b.tier desc, b.division nulls first, place;
$$;

grant execute on function season_standings_ordered(uuid, text) to authenticated;
