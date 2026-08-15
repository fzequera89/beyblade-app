-- Ranking Unificado Interclubes: VP acumulados CRUZANDO ligas y ciudades.
--
-- ── Qué es y en qué se diferencia de todo lo demás ──────────────────────────
--
-- Ya hay tres cosas que miden posición y conviene no confundirlas:
--
--   ELO                → habilidad personal, global, no se resetea nunca.
--   Tabla local (0037) → posición en UNA liga/temporada, se ordena por
--                        VICTORIAS, se reinicia cada temporada (3 meses).
--   Interclubes (esto) → VP acumulados a lo largo de TODAS las ligas y ciudades,
--                        el ranking "unificado" del reglamento. Dura ~6 meses.
--
-- El VP dejó de ordenar la tabla local en 0037; su lugar es este. Un mismo
-- combate de ranking suma a la tabla local (por victorias) Y al interclubes (por
-- VP), pero son dos cuentas distintas.
--
-- ── Decisiones que tomé, y que hay que confirmar con el cliente ──────────────
--
-- 1. **El VP de un combate usa la categoría del jugador EN ESA liga/temporada.**
--    Es lo mismo que ya hacía `apply_vp_for_match` para la tabla local: un
--    Diamante aporta 4 y un Porcelana 1. Como el interclubes cruza ligas, un
--    jugador puede aportar distinto en cada una según su categoría allí.
-- 2. **Solo cuenta lo que ya cuenta para el VP local:** combates de RANKING de un
--    torneo con temporada, con ambos jugadores inscritos. Los casuales y los
--    retos sueltos quedan fuera solos (mode='casual').
-- 3. **El periodo se reinicia a mano.** Igual que el cierre de temporada (0031):
--    "dura 6 meses" es un acto de la administración, no un reloj. `reset` cierra
--    el periodo vigente y abre otro; el histórico se conserva por periodo.
-- 4. **Antigüedad = primer combate que puntuó en el periodo** (`first_at`). El
--    reglamento la usa como 3er desempate; es lo más cercano a "más tiempo
--    activo" que se puede medir sin otra tabla.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Periodos del interclubes (siempre hay uno vigente)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists interclub_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  started_on date not null default current_date,
  -- null = vigente. Solo puede haber uno vigente a la vez.
  ended_on date
);

create unique index if not exists interclub_periods_one_open
  on interclub_periods ((ended_on is null)) where ended_on is null;

alter table interclub_periods enable row level security;
drop policy if exists "interclub_periods_read" on interclub_periods;
create policy "interclub_periods_read" on interclub_periods for select to authenticated using (true);

-- Arranca un periodo si no hay ninguno.
insert into interclub_periods (label)
select 'Temporada interclubes ' || to_char(current_date, 'YYYY')
where not exists (select 1 from interclub_periods);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. El acumulado por jugador dentro de un periodo
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists interclub_standings (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references interclub_periods(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  vp int not null default 0,
  points_for int not null default 0,
  points_against int not null default 0,
  matches_won int not null default 0,
  matches_lost int not null default 0,
  -- Primer combate que le puntuó en el periodo: antigüedad para el desempate.
  first_at timestamptz not null default now(),
  unique (period_id, player_id)
);

create index if not exists interclub_standings_period_idx on interclub_standings (period_id);

alter table interclub_standings enable row level security;
drop policy if exists "interclub_standings_read" on interclub_standings;
create policy "interclub_standings_read" on interclub_standings for select to authenticated using (true);
-- Sin políticas de escritura: todo entra por función.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. El periodo vigente
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function current_interclub_period()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from interclub_periods where ended_on is null
  order by started_on desc limit 1;
$$;

grant execute on function current_interclub_period() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Acreditar VP — a la tabla local Y al interclubes
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Misma función de 0030/0037 con el bloque del interclubes al final. El VP por
-- combate se calcula una vez y se aplica a las dos cuentas.

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
  v_delta_a int;
  v_delta_b int;
  v_period uuid;
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

  -- Si alguno no está inscrito en la temporada, este combate no mueve nada.
  if v_a.id is null or v_b.id is null then return; end if;

  select vp_value into v_vp_a from categories where code = v_a.category_code;
  select vp_value into v_vp_b from categories where code = v_b.category_code;

  v_a_won := (v_match.winner_id = v_match.player_a_id);
  v_delta_a := case when v_a_won then v_vp_a else -v_vp_a end;
  v_delta_b := case when v_a_won then -v_vp_b else v_vp_b end;

  -- ── Tabla local (por liga/temporada) ──
  update season_standings set
    vp = vp + v_delta_a,
    points_for = points_for + v_match.score_a,
    points_against = points_against + v_match.score_b,
    matches_won = matches_won + case when v_a_won then 1 else 0 end,
    matches_lost = matches_lost + case when v_a_won then 0 else 1 end
  where id = v_a.id;

  update season_standings set
    vp = vp + v_delta_b,
    points_for = points_for + v_match.score_b,
    points_against = points_against + v_match.score_a,
    matches_won = matches_won + case when v_a_won then 0 else 1 end,
    matches_lost = matches_lost + case when v_a_won then 1 else 0 end
  where id = v_b.id;

  -- ── Interclubes (cruza ligas), al periodo vigente ──
  v_period := current_interclub_period();
  if v_period is not null then
    insert into interclub_standings (
      period_id, player_id, vp, points_for, points_against, matches_won, matches_lost
    ) values (
      v_period, v_match.player_a_id, v_delta_a, v_match.score_a, v_match.score_b,
      case when v_a_won then 1 else 0 end, case when v_a_won then 0 else 1 end
    )
    on conflict (period_id, player_id) do update set
      vp = interclub_standings.vp + excluded.vp,
      points_for = interclub_standings.points_for + excluded.points_for,
      points_against = interclub_standings.points_against + excluded.points_against,
      matches_won = interclub_standings.matches_won + excluded.matches_won,
      matches_lost = interclub_standings.matches_lost + excluded.matches_lost;

    insert into interclub_standings (
      period_id, player_id, vp, points_for, points_against, matches_won, matches_lost
    ) values (
      v_period, v_match.player_b_id, v_delta_b, v_match.score_b, v_match.score_a,
      case when v_a_won then 0 else 1 end, case when v_a_won then 1 else 0 end
    )
    on conflict (period_id, player_id) do update set
      vp = interclub_standings.vp + excluded.vp,
      points_for = interclub_standings.points_for + excluded.points_for,
      points_against = interclub_standings.points_against + excluded.points_against,
      matches_won = interclub_standings.matches_won + excluded.matches_won,
      matches_lost = interclub_standings.matches_lost + excluded.matches_lost;
  end if;
end;
$$;

revoke all on function apply_vp_for_match(uuid) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. El ranking interclubes ordenado (con los 4 desempates)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Orden: VP → diferencia de puntos → enfrentamiento directo → antigüedad →
-- alfabético. El alfabético es el desempate propio del Ranking Unificado
-- (reglamento). Si no se pasa periodo, usa el vigente.

create or replace function interclub_ranking_ordered(p_period_id uuid default null)
returns table (
  player_id uuid,
  display_name text,
  city text,
  avatar_key text,
  avatar_url text,
  vp int,
  point_diff int,
  matches_won int,
  matches_lost int,
  h2h_wins int,
  place int
)
language sql
stable
security definer
set search_path = public
as $$
  with per as (
    select coalesce(p_period_id, current_interclub_period()) as id
  ),
  base as (
    select
      s.player_id,
      p.display_name,
      p.city,
      p.avatar_key,
      p.avatar_url,
      s.vp,
      s.points_for - s.points_against as point_diff,
      s.matches_won,
      s.matches_lost,
      s.first_at
    from interclub_standings s
    join players p on p.id = s.player_id
    where s.period_id = (select id from per)
  ),
  -- Empatados en VP y diferencia: entre ellos decide el enfrentamiento directo,
  -- contando victorias en combates de ranking confirmados contra ese grupo.
  h2h as (
    select
      b.player_id,
      (
        select count(*)::int
        from matches m
        join base b2
          on b2.player_id = case
               when m.player_a_id = b.player_id then m.player_b_id
               else m.player_a_id
             end
        where m.status = 'confirmed'
          and m.mode is distinct from 'casual'
          and m.winner_id = b.player_id
          and b.player_id in (m.player_a_id, m.player_b_id)
          and b2.player_id <> b.player_id
          and b2.vp = b.vp
          and b2.point_diff = b.point_diff
      ) as h2h_wins
    from base b
  )
  select
    b.player_id,
    b.display_name,
    b.city,
    b.avatar_key,
    b.avatar_url,
    b.vp,
    b.point_diff,
    b.matches_won,
    b.matches_lost,
    h.h2h_wins,
    row_number() over (
      order by
        b.vp desc,
        b.point_diff desc,
        h.h2h_wins desc,
        b.first_at asc,
        b.display_name asc
    )::int as place
  from base b
  join h2h h on h.player_id = b.player_id
  order by place;
$$;

grant execute on function interclub_ranking_ordered(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Reiniciar el periodo (cierra el vigente y abre otro) — solo administración
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function reset_interclub_ranking(p_label text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_id uuid;
begin
  select id into v_caller from players where auth_user_id = auth.uid();
  if not exists (select 1 from players where id = v_caller and is_admin = true) then
    raise exception 'Solo el administrador reinicia el ranking interclubes';
  end if;

  update interclub_periods set ended_on = current_date where ended_on is null;

  insert into interclub_periods (label)
  values (coalesce(nullif(trim(p_label), ''), 'Temporada interclubes ' || to_char(current_date, 'YYYY-MM')))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function reset_interclub_ranking(text) to authenticated;
