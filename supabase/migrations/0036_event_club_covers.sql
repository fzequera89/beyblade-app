-- Portadas para eventos y clubes.
--
-- Misma regla del cliente que ligas/torneos: todo lo que se crea puede llevar
-- imagen, "solo cuando suma y no resta". El bucket 'covers' ya existe (0034) y
-- cover.ts ya sabe subir a event/<id> y club/<id>; faltaban dos cosas: la
-- columna donde guardar la URL, y que la POLÍTICA del bucket deje escribir a
-- quien de verdad puede.
--
-- Ojo con el permiso: un club lo funda CUALQUIERA (0018) y un evento abierto lo
-- crea CUALQUIERA (0016). La política de 0034 solo deja subir a admin o
-- moderador de liga — perfecto para ligas y torneos, pero dejaría sin portada
-- justo a los clubes y a los eventos abiertos. Se amplía para que además pueda:
--   - el DUEÑO del club subir la portada de club/<id>/...
--   - el CREADOR del evento subir la de event/<id>/...
-- La ruta es '<tipo>/<id>/cover.jpg', así que el tipo y el id salen de
-- foldername(name)[1] y [2] (los arreglos de Postgres empiezan en 1).

alter table events add column if not exists photo_url text;
alter table clubs add column if not exists photo_url text;

drop policy if exists "covers_insert" on storage.objects;
create policy "covers_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'covers'
    and (
      exists (
        select 1 from players
        where auth_user_id = auth.uid()
          and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
      )
      or (
        (storage.foldername(name))[1] = 'club'
        and (storage.foldername(name))[2] in (
          select id::text from clubs
          where owner_player_id = (select id from players where auth_user_id = auth.uid())
        )
      )
      or (
        (storage.foldername(name))[1] = 'event'
        and (storage.foldername(name))[2] in (
          select id::text from events
          where created_by = (select id from players where auth_user_id = auth.uid())
        )
      )
    )
  );

drop policy if exists "covers_update" on storage.objects;
create policy "covers_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'covers'
    and (
      exists (
        select 1 from players
        where auth_user_id = auth.uid()
          and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
      )
      or (
        (storage.foldername(name))[1] = 'club'
        and (storage.foldername(name))[2] in (
          select id::text from clubs
          where owner_player_id = (select id from players where auth_user_id = auth.uid())
        )
      )
      or (
        (storage.foldername(name))[1] = 'event'
        and (storage.foldername(name))[2] in (
          select id::text from events
          where created_by = (select id from players where auth_user_id = auth.uid())
        )
      )
    )
  );
