-- Temática del torneo, decidida por votación.
--
-- El reglamento, en la modalidad casual: un torneo puede tener temática (el
-- ejemplo del documento es "solo Blades de metal" o "piezas tipo Defensa"), y la
-- decide la comunidad por votación la semana previa al encuentro.
--
-- Decisiones del cliente (2026-08-15), que es lo que define la forma de esto:
--   · **Cualquiera propone, un moderador acepta.** La lista de opciones no la
--     dicta la organización, pero tampoco entra cualquier cosa a la boleta.
--   · **Votan los miembros de la liga**, no solo los inscritos al torneo: la
--     temática se decide la semana previa, cuando mucha gente todavía no se
--     inscribe.
--   · **Cierra sola en una fecha**, no cuando alguien se acuerde.
--
-- "Cierra sola" sin cron: no hay proceso agendado en este proyecto, así que la
-- función de cierre **es idempotente y la puede llamar cualquiera** — la app la
-- llama al abrir el torneo. Lo que hace que el cierre sea automático no es quién
-- llama, es que la función se niega a cerrar antes de la fecha y, pasada la
-- fecha, cierra igual sin importar quién entre. El primero que abra la pantalla
-- después del plazo lo consuma.

alter table tournaments add column if not exists theme text;
alter table tournaments add column if not exists theme_vote_closes_at timestamptz;

comment on column tournaments.theme is
  'Restricción temática del torneo (ej. "solo tipo Ataque"). Sale de la votación o la escribe el organizador.';

create table if not exists tournament_theme_options (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  label text not null,
  proposed_by uuid references players(id),
  -- Nadie ve una opción en la boleta hasta que un moderador la acepta.
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tournament_id, label)
);

create table if not exists tournament_theme_votes (
  tournament_id uuid not null references tournaments(id) on delete cascade,
  option_id uuid not null references tournament_theme_options(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Un voto por persona y por torneo: la llave es el torneo, no la opción. Con
  -- la opción como llave, cambiar de opinión dejaría dos votos vivos.
  primary key (tournament_id, player_id)
);

create index if not exists theme_options_tournament_idx on tournament_theme_options (tournament_id);

alter table tournament_theme_options enable row level security;
alter table tournament_theme_votes enable row level security;

drop policy if exists "theme_options_read" on tournament_theme_options;
create policy "theme_options_read" on tournament_theme_options for select to authenticated using (true);

-- Los votos son públicos: el conteo es el punto entero de una votación, y
-- esconder quién votó qué no protege nada en una liga de barrio.
drop policy if exists "theme_votes_read" on tournament_theme_votes;
create policy "theme_votes_read" on tournament_theme_votes for select to authenticated using (true);

-- Sin políticas de escritura: todo pasa por las funciones de abajo, que son las
-- que saben quién puede proponer, quién aceptar y quién votar.

-- ─────────────────────────────────────────────────────────────────────────────
-- Proponer (cualquier miembro de la liga)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function suggest_theme_option(p_tournament_id uuid, p_label text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_league uuid;
  v_id uuid;
begin
  select id into v_player from players where auth_user_id = auth.uid();
  select league_id into v_league from tournaments where id = p_tournament_id;
  if v_league is null then
    raise exception 'Torneo no encontrado';
  end if;

  if not exists (
    select 1 from league_members where player_id = v_player and league_id = v_league
  ) then
    raise exception 'Solo los miembros de la liga proponen temáticas';
  end if;

  if length(btrim(coalesce(p_label, ''))) < 3 then
    raise exception 'La temática necesita un nombre';
  end if;

  -- El organizador se ahorra un paso: lo que propone entra aceptado.
  insert into tournament_theme_options (tournament_id, label, proposed_by, approved)
  values (
    p_tournament_id,
    btrim(p_label),
    v_player,
    exists (
      select 1 from league_members
      where player_id = v_player and league_id = v_league and role = 'organizer'
    ) or exists (select 1 from players where id = v_player and is_admin = true)
  )
  on conflict (tournament_id, label) do nothing
  returning id into v_id;

  if v_id is null then
    raise exception 'Esa temática ya fue propuesta';
  end if;

  return v_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Aceptar o quitar de la boleta (moderador)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function approve_theme_option(p_option_id uuid, p_approved boolean default true)
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

  select t.league_id into v_league
  from tournament_theme_options o
  join tournaments t on t.id = o.tournament_id
  where o.id = p_option_id;

  if v_league is null then
    raise exception 'Opción no encontrada';
  end if;

  if not (
    exists (select 1 from players where id = v_caller and is_admin = true)
    or exists (
      select 1 from league_members
      where player_id = v_caller and league_id = v_league and role = 'organizer'
    )
  ) then
    raise exception 'Solo un moderador acepta las temáticas propuestas';
  end if;

  update tournament_theme_options set approved = p_approved where id = p_option_id;

  -- Quitar una opción de la boleta se lleva sus votos: dejarlos vivos daría un
  -- conteo que no corresponde a ninguna opción votable.
  if p_approved = false then
    delete from tournament_theme_votes where option_id = p_option_id;
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Votar (miembros de la liga, un voto, cambiable hasta el cierre)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function vote_theme_option(p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_tournament uuid;
  v_league uuid;
  v_closes timestamptz;
  v_theme text;
begin
  select id into v_player from players where auth_user_id = auth.uid();

  select o.tournament_id, t.league_id, t.theme_vote_closes_at, t.theme
  into v_tournament, v_league, v_closes, v_theme
  from tournament_theme_options o
  join tournaments t on t.id = o.tournament_id
  where o.id = p_option_id and o.approved = true;

  if v_tournament is null then
    raise exception 'Esa temática no está en la boleta';
  end if;

  if not exists (
    select 1 from league_members where player_id = v_player and league_id = v_league
  ) then
    raise exception 'Solo los miembros de la liga votan';
  end if;

  if v_theme is not null then
    raise exception 'La votación ya cerró: la temática es "%"', v_theme;
  end if;

  if v_closes is not null and now() > v_closes then
    raise exception 'La votación ya cerró';
  end if;

  insert into tournament_theme_votes (tournament_id, option_id, player_id)
  values (v_tournament, p_option_id, v_player)
  on conflict (tournament_id, player_id) do update set option_id = excluded.option_id,
                                                       created_at = now();
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Cerrar (sola, en la fecha)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La puede llamar cualquiera y no pasa nada si se llama de más: antes de la
-- fecha no hace nada, después hace lo mismo siempre. Gana la más votada; el
-- empate lo rompe la que se propuso primero, que es la que la comunidad tuvo
-- más tiempo a la vista.

create or replace function close_theme_vote(p_tournament_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closes timestamptz;
  v_theme text;
  v_ganadora text;
begin
  select theme_vote_closes_at, theme into v_closes, v_theme
  from tournaments where id = p_tournament_id;

  if v_theme is not null then
    return v_theme;
  end if;

  if v_closes is null or now() <= v_closes then
    return null;
  end if;

  select o.label into v_ganadora
  from tournament_theme_options o
  left join tournament_theme_votes v on v.option_id = o.id
  where o.tournament_id = p_tournament_id and o.approved = true
  group by o.id, o.label, o.created_at
  order by count(v.player_id) desc, o.created_at asc
  limit 1;

  if v_ganadora is null then
    return null;
  end if;

  update tournaments set theme = v_ganadora where id = p_tournament_id;
  return v_ganadora;
end;
$$;

revoke execute on function suggest_theme_option(uuid, text) from public, anon;
revoke execute on function approve_theme_option(uuid, boolean) from public, anon;
revoke execute on function vote_theme_option(uuid) from public, anon;
revoke execute on function close_theme_vote(uuid) from public, anon;

grant execute on function suggest_theme_option(uuid, text) to authenticated;
grant execute on function approve_theme_option(uuid, boolean) to authenticated;
grant execute on function vote_theme_option(uuid) to authenticated;
grant execute on function close_theme_vote(uuid) to authenticated;
