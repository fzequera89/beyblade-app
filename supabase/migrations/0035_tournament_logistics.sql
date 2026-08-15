-- Lo que un torneo necesita para existir en el mundo real: cuándo, dónde,
-- cuántos caben, hasta cuándo hay inscripciones, y qué se gana.
--
-- Hasta hoy un torneo era nombre + estructura. Eso alcanza para armar la llave,
-- pero no para que alguien decida si va: falta la fecha, el lugar y si todavía
-- queda lugar.

alter table tournaments add column if not exists starts_at timestamptz;
alter table tournaments add column if not exists venue_id uuid references venues(id);

-- NULL = sin límite. Es una decisión del cliente: hay torneos abiertos donde
-- entra quien llegue.
alter table tournaments add column if not exists capacity int;
alter table tournaments drop constraint if exists tournaments_capacity_check;
alter table tournaments add constraint tournaments_capacity_check
  check (capacity is null or capacity >= 2);

alter table tournaments add column if not exists registration_closes_at timestamptz;
alter table tournaments add column if not exists level text;
alter table tournaments add column if not exists prize text;

-- ─────────────────────────────────────────────────────────────────────────────
-- Inscribirse, con el cupo hecho valer del lado del servidor
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La política de RLS deja que cualquiera se inscriba a sí mismo, y la app puede
-- contar antes de insertar — pero entre que cuenta y que inserta, otro pudo
-- entrar. Con el cupo lleno al límite, dos personas tocando "Inscribirme" a la
-- vez pasan las dos. Por eso el conteo y la inserción ocurren aquí, con la
-- fila del torneo bloqueada: el segundo espera y se encuentra el cupo lleno.

create or replace function register_for_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament tournaments%rowtype;
  v_player uuid;
  v_taken int;
begin
  -- for update: serializa a los que llegan al mismo tiempo.
  select * into v_tournament from tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Torneo no encontrado';
  end if;

  select id into v_player from players where auth_user_id = auth.uid();
  if v_player is null then
    raise exception 'No autorizado';
  end if;

  if v_tournament.status <> 'pending' then
    raise exception 'Este torneo ya empezó';
  end if;

  if v_tournament.registration_closes_at is not null
     and now() > v_tournament.registration_closes_at then
    raise exception 'Las inscripciones ya cerraron';
  end if;

  if exists (
    select 1 from tournament_registrations
    where tournament_id = p_tournament_id and player_id = v_player
  ) then
    raise exception 'Ya estás inscrito en este torneo';
  end if;

  if v_tournament.capacity is not null then
    select count(*) into v_taken
    from tournament_registrations
    where tournament_id = p_tournament_id;

    if v_taken >= v_tournament.capacity then
      raise exception 'El torneo está lleno (% de %)', v_taken, v_tournament.capacity;
    end if;
  end if;

  insert into tournament_registrations (tournament_id, player_id)
  values (p_tournament_id, v_player);
end;
$$;

grant execute on function register_for_tournament(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Crear una locación desde el armador de torneos
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El cliente pidió que la sede salga de las locaciones ya registradas, con la
-- opción de agregar una nueva ahí mismo — y que esa nueva quede guardada en
-- Locaciones, no suelta dentro del torneo.
--
-- Va por función para devolver el id en un solo viaje y para generar el código
-- del QR con la misma forma que usa la pantalla de locaciones.

create or replace function create_venue_quick(p_name text, p_city text default null, p_address text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_id uuid;
begin
  select id into v_caller from players
  where auth_user_id = auth.uid()
    and (is_admin = true or id in (select player_id from league_members where role = 'organizer'));
  if v_caller is null then
    raise exception 'Solo un moderador o el administrador puede registrar una locación';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'La locación necesita un nombre';
  end if;

  insert into venues (name, city, address, qr_code)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    'venue-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 6)
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function create_venue_quick(text, text, text) to authenticated;
