-- Eventos y asistencia (4.1, módulo M8)
--
-- Las tablas `events` y `event_rsvps` existen desde 0001 con RLS activado y sin
-- políticas. Aquí se abren y se agrega la descripción, que hacía falta para que
-- un evento se explique solo en la lista.

alter table events add column if not exists description text;

-- Índice para la consulta principal de la pantalla: próximos eventos por fecha.
create index if not exists events_starts_at_idx on events (starts_at);

create policy "events_select_authenticated"
  on events for select
  to authenticated
  using (true);

-- Quién puede crear un evento:
--   - Eventos DE LIGA (league_id no nulo): solo el admin o un moderador de esa liga.
--     Son oficiales y cuentan para la liga, así que no los abre cualquiera.
--   - Eventos ABIERTOS (league_id nulo): cualquier jugador. Son las quedadas
--     casuales del módulo M8 (free_play, meetup, practice_night); si esto se
--     cerrara a moderadores, la mitad del módulo perdería sentido.
-- En ambos casos created_by tiene que ser uno mismo, para que la autoría sea real.
create policy "events_insert_organizer_or_open"
  on events for insert
  to authenticated
  with check (
    created_by in (select id from players where auth_user_id = auth.uid())
    and (
      league_id is null
      or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
      or league_id in (
        select league_id from league_members
        where player_id in (select id from players where auth_user_id = auth.uid())
          and role = 'organizer'
      )
    )
  );

create policy "events_update_creator_or_admin"
  on events for update
  to authenticated
  using (
    created_by in (select id from players where auth_user_id = auth.uid())
    or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  )
  with check (
    created_by in (select id from players where auth_user_id = auth.uid())
    or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  );

create policy "events_delete_creator_or_admin"
  on events for delete
  to authenticated
  using (
    created_by in (select id from players where auth_user_id = auth.uid())
    or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  );

-- event_rsvps: la lista de asistentes es pública (de eso se trata el módulo),
-- pero cada quien solo se apunta y se borra a sí mismo.
create policy "event_rsvps_select_authenticated"
  on event_rsvps for select
  to authenticated
  using (true);

create policy "event_rsvps_insert_self"
  on event_rsvps for insert
  to authenticated
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "event_rsvps_delete_self"
  on event_rsvps for delete
  to authenticated
  using (player_id in (select id from players where auth_user_id = auth.uid()));
