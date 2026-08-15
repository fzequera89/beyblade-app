-- Portada para las ligas, y un lugar común para todas las portadas.
--
-- Regla del cliente: todo lo que se crea en la app —torneos, ligas, eventos,
-- clubes— debe poder llevar imagen, "solo cuando suma y no resta". Las
-- locaciones y los torneos ya la tienen; las ligas no.
--
-- Las portadas de torneo se estaban guardando en el bucket 'venues' por
-- reaprovechar el código. Funciona, pero deja archivos de torneos dentro de un
-- bucket llamado "locaciones": el que entre dentro de un año a limpiar no va a
-- saber qué puede borrar. Se crea 'covers', con las rutas separadas por tipo.

alter table leagues add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

drop policy if exists "covers_read" on storage.objects;
create policy "covers_read"
  on storage.objects for select
  using (bucket_id = 'covers');

-- Escribe quien organiza algo: admin o moderador de alguna liga. Es el mismo
-- criterio que ya rige crear ligas, torneos y locaciones.
drop policy if exists "covers_insert" on storage.objects;
create policy "covers_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'covers'
    and exists (
      select 1 from players
      where auth_user_id = auth.uid()
        and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
    )
  );

drop policy if exists "covers_update" on storage.objects;
create policy "covers_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'covers'
    and exists (
      select 1 from players
      where auth_user_id = auth.uid()
        and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
    )
  );
