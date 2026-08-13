-- Rol de administrador de plataforma: dueño de toda la organización.
-- Solo el admin puede crear ligas y nombrar/quitar moderadores de cualquier liga.
-- El rol 'organizer' en league_members se sigue llamando así en la base de datos,
-- mostrado en la app como "Moderador de liga".

alter table players add column is_admin boolean not null default false;

update players set is_admin = true
from auth.users
where players.auth_user_id = auth.users.id
  and auth.users.email = 'farid.zeqvil89@gmail.com';

-- Reemplaza la política anterior: ya no cualquier autenticado puede crear una liga.
drop policy "leagues_insert_authenticated" on leagues;

create policy "leagues_insert_admin"
  on leagues for insert
  to authenticated
  with check (
    exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  );

create policy "leagues_update_admin"
  on leagues for update
  to authenticated
  using (exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true));

-- El admin puede nombrar/quitar moderadores de cualquier liga sin depender
-- de ya ser organizador de esa liga en particular.
create policy "league_members_admin_insert"
  on league_members for insert
  to authenticated
  with check (
    exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  );

create policy "league_members_admin_update"
  on league_members for update
  to authenticated
  using (exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true))
  with check (exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true));

create policy "league_members_admin_delete"
  on league_members for delete
  to authenticated
  using (exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true));
