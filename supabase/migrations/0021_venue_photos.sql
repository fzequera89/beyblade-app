-- Foto de la locación (venue).
--
-- La app dibuja una arena generada cuando no hay foto, así que esta columna es
-- opcional: sirve para reemplazar ese dibujo por la foto real del lugar.

alter table venues add column if not exists photo_url text;

-- Bucket público: la portada se ve en la lista, y una URL firmada por cada
-- tarjeta sería una petición extra por locación sin ganar nada — no hay nada
-- privado en la foto de una tienda.
insert into storage.buckets (id, name, public)
values ('venues', 'venues', true)
on conflict (id) do nothing;

-- Lectura abierta, escritura solo para quien ya puede editar la locación
-- (mismo criterio que venues_update_organizer_or_admin en 0010).
drop policy if exists "venue_photos_read" on storage.objects;
create policy "venue_photos_read"
  on storage.objects for select
  using (bucket_id = 'venues');

drop policy if exists "venue_photos_insert" on storage.objects;
create policy "venue_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'venues'
    and exists (
      select 1 from players where auth_user_id = auth.uid()
        and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
    )
  );

drop policy if exists "venue_photos_update" on storage.objects;
create policy "venue_photos_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'venues'
    and exists (
      select 1 from players where auth_user_id = auth.uid()
        and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
    )
  );
