-- El check-in se prueba, no se declara.
--
-- Hasta hoy el jugador se marcaba presente con un botón, desde donde estuviera.
-- Eso vaciaba de sentido al QR y, peor, corrompía dos cosas que dependen de la
-- asistencia: **el emparejamiento** (`phaseParticipants` solo toma a los que
-- tienen check-in, así que alguien en su casa podía quedar emparejado) y **la
-- eliminación por inasistencia** del reglamento, que se vuelve ficción si la
-- presencia se puede declarar por control remoto.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Por qué el QR necesita un SECRETO y no basta el id del torneo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El QR llevaba "torneo:<id>". Ese id lo tiene cualquiera que abra el torneo en
-- la app, así que una función que solo pidiera el id se podría llamar desde la
-- cama: seguiría siendo un botón, con más pasos.
--
-- Por eso hay un código por torneo, **en su propia tabla y solo legible por la
-- organización**. No puede ser una columna de `tournaments`: esa tabla la lee
-- cualquier autenticado, y Postgres no tiene permisos por columna en RLS — el
-- código quedaría a la vista de todos y no sería secreto.
--
-- Lo que esto SÍ garantiza: que alguien vio la pantalla del organizador. Lo que
-- NO puede garantizar: que no le hayan mandado la foto del QR por WhatsApp. Eso
-- es inherente a cualquier check-in por código, y por eso el organizador
-- conserva el marcado manual y puede rotar el código si se le fue de las manos.

create table if not exists tournament_checkin_codes (
  tournament_id uuid primary key references tournaments(id) on delete cascade,
  code text not null,
  rotated_at timestamptz not null default now()
);

alter table tournament_checkin_codes enable row level security;

-- Solo la organización lo lee. Si lo leyera el jugador, no sería un secreto y
-- volveríamos al botón.
drop policy if exists "checkin_codes_read_organizer" on tournament_checkin_codes;
create policy "checkin_codes_read_organizer" on tournament_checkin_codes
  for select to authenticated
  using (
    exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
    or exists (
      select 1 from tournaments t
      join league_members lm on lm.league_id = t.league_id
      join players p on p.id = lm.player_id
      where t.id = tournament_checkin_codes.tournament_id
        and p.auth_user_id = auth.uid()
        and lm.role = 'organizer'
    )
  );

-- Sin escritura desde la app: los códigos nacen por trigger y se rotan por
-- función.

create or replace function random_checkin_code()
returns text
language sql
volatile
as $$
  -- Corto a propósito: cabe holgado en un QR y se puede dictar por teléfono si
  -- la cámara de alguien no coopera.
  select upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
$$;

insert into tournament_checkin_codes (tournament_id, code)
select t.id, random_checkin_code()
from tournaments t
where not exists (
  select 1 from tournament_checkin_codes c where c.tournament_id = t.id
);

create or replace function tournament_gets_checkin_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into tournament_checkin_codes (tournament_id, code)
  values (new.id, random_checkin_code())
  on conflict (tournament_id) do nothing;
  return null;
end;
$$;

drop trigger if exists tournaments_checkin_code on tournaments;
create trigger tournaments_checkin_code
  after insert on tournaments
  for each row execute function tournament_gets_checkin_code();

-- ─────────────────────────────────────────────────────────────────────────────
-- El check-in, contra el código
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function check_in_with_code(p_tournament_id uuid, p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_code text;
  v_nombre text;
begin
  select id into v_player from players where auth_user_id = auth.uid();
  if v_player is null then
    raise exception 'No autorizado';
  end if;

  select code into v_code from tournament_checkin_codes where tournament_id = p_tournament_id;
  if v_code is null then
    raise exception 'Ese torneo no tiene código de check-in';
  end if;

  -- Se compara sin mayúsculas ni espacios: el código puede llegar dictado.
  if upper(btrim(coalesce(p_code, ''))) <> v_code then
    raise exception 'Ese código no es de este torneo';
  end if;

  if not exists (
    select 1 from tournament_registrations
    where tournament_id = p_tournament_id and player_id = v_player
  ) then
    raise exception 'No estás inscrito en este torneo';
  end if;

  update tournament_registrations
  set checked_in_at = coalesce(checked_in_at, now())
  where tournament_id = p_tournament_id and player_id = v_player;

  select name into v_nombre from tournaments where id = p_tournament_id;
  return v_nombre;
end;
$$;

revoke execute on function check_in_with_code(uuid, text) from public, anon;
grant execute on function check_in_with_code(uuid, text) to authenticated;

-- Rotar el código: para cuando el QR se fue por WhatsApp.
create or replace function rotate_checkin_code(p_tournament_id uuid)
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
  select league_id into v_league from tournaments where id = p_tournament_id;
  if v_league is null then
    raise exception 'Torneo no encontrado';
  end if;

  if not (
    exists (select 1 from players where id = v_caller and is_admin = true)
    or exists (
      select 1 from league_members
      where player_id = v_caller and league_id = v_league and role = 'organizer'
    )
  ) then
    raise exception 'Solo la organización rota el código';
  end if;

  update tournament_checkin_codes
  set code = random_checkin_code(), rotated_at = now()
  where tournament_id = p_tournament_id;
end;
$$;

revoke execute on function rotate_checkin_code(uuid) from public, anon;
grant execute on function rotate_checkin_code(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Y se cierra la puerta de atrás
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Quitar el botón de la interfaz no bastaba: la política dejaba que cualquiera
-- escribiera su propio `checked_in_at` con la anon key. Ahora el jugador solo
-- puede EDITAR su inscripción para cosas que no sean la asistencia — en la
-- práctica, borrarse del torneo, que tiene su propia política.
--
-- La organización conserva el marcado manual, que es la puerta legítima para el
-- teléfono sin batería, y queda con nombre de quién la abrió.

drop policy if exists "tournament_registrations_update_self_or_organizer" on tournament_registrations;
create policy "tournament_registrations_update_organizer"
  on tournament_registrations for update
  to authenticated
  using (
    exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
    or tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      join players p on p.id = lm.player_id
      where p.auth_user_id = auth.uid() and lm.role = 'organizer'
    )
  )
  with check (
    exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
    or tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      join players p on p.id = lm.player_id
      where p.auth_user_id = auth.uid() and lm.role = 'organizer'
    )
  );
