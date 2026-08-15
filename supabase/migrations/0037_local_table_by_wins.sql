-- Partir en dos: la tabla LOCAL se ordena por victorias; el VP es del interclubes.
--
-- ── El cambio de regla del cliente (2026-08-15) ──────────────────────────────
--
-- La 0030 construyó los VP como si fueran la tabla local: `season_standings`
-- acumula VP y `season_standings_ordered` ordenaba por `vp desc`. El cliente
-- cerró que son DOS cosas distintas:
--
--   Tabla LOCAL (de cada liga/temporada) → se ordena por VICTORIAS, con la
--       diferencia de puntos como primer desempate. Es lo que decide ascensos,
--       divisiones y títulos dentro de la liga.
--   VP (Puntos de Victoria)             → alimentan el Ranking Unificado
--       INTERCLUBES, que cruza ligas y ciudades. NO ordenan la tabla local.
--
-- Esta migración hace el primer corte: la tabla local deja de ordenar por VP.
-- El VP sigue acumulándose (por si el interclubes lo consume después), pero ya
-- no manda en la liga.
--
-- ── Decisiones que tomé, y que hay que confirmar con el cliente ──────────────
--
-- 1. **Escala de VP = 5/4/3/2/1.** La nota del cliente del 2026-08-15 da esta
--    escala (Challenger 5, Diamante/Platino 4, Oro/Plata 3, Bronce/Hierro 2,
--    Porcelana 1), distinta de la tabla textual del reglamento que implementó la
--    0030 (3/3/3/2/2/1/1/1). Se toma la más reciente. Vive en `categories`:
--    cambiarla es un UPDATE, no una migración.
--
-- 2. **Los desempates después de puntos siguen siendo los del reglamento:**
--    enfrentamiento directo, antigüedad, orden alfabético. El cliente solo movió
--    la CABEZA del orden (victorias antes que VP); el resto se conserva.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La escala de VP nueva
-- ─────────────────────────────────────────────────────────────────────────────

update categories set vp_value = 5 where code = 'challenger';
update categories set vp_value = 4 where code in ('diamante', 'platino');
update categories set vp_value = 3 where code in ('oro', 'plata');
update categories set vp_value = 2 where code in ('bronce', 'hierro');
update categories set vp_value = 1 where code = 'porcelana';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. La tabla local, ahora ordenada por victorias
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Misma firma y mismas columnas que 0030 (no rompe la RPC ni la UI): solo
-- cambia el CRITERIO de orden y, en consecuencia, quién cuenta como "empatado"
-- para el enfrentamiento directo — ahora son los que empatan en victorias y
-- diferencia de puntos, no en VP.

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
  -- Los que empatan en VICTORIAS y en diferencia de puntos: entre ellos decide
  -- el enfrentamiento directo (2º desempate del reglamento).
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
          and b2.matches_won = b.matches_won
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
        b.matches_won desc,     -- 1. VICTORIAS (cambio del cliente 2026-08-15)
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
