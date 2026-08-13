-- Clubes (4.4, módulo M11)
--
-- `clubs` y `club_members` existen desde 0001 pero solo con nombre y liga.
-- Un club es el grupo con el que un jugador se identifica (su equipo), y a
-- diferencia de una liga NO lo crea solo el admin: la escena se organiza sola.

alter table clubs add column if not exists description text;
alter table clubs add column if not exists city text;
alter table clubs add column if not exists owner_player_id uuid references players(id);

create policy "clubs_select_authenticated"
  on clubs for select
  to authenticated
  using (true);

-- Cualquier jugador puede fundar un club, pero solo a su propio nombre.
create policy "clubs_insert_own"
  on clubs for insert
  to authenticated
  with check (owner_player_id in (select id from players where auth_user_id = auth.uid()));

create policy "clubs_update_owner_or_admin"
  on clubs for update
  to authenticated
  using (
    owner_player_id in (select id from players where auth_user_id = auth.uid())
    or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  )
  with check (
    owner_player_id in (select id from players where auth_user_id = auth.uid())
    or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  );

create policy "clubs_delete_owner_or_admin"
  on clubs for delete
  to authenticated
  using (
    owner_player_id in (select id from players where auth_user_id = auth.uid())
    or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  );

-- Mismo patrón que las ligas en 0004: el fundador entra automáticamente como
-- miembro, para que un club nunca exista con el roster vacío.
create function set_club_owner_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into club_members (club_id, player_id)
  values (new.id, new.owner_player_id)
  on conflict do nothing;
  return new;
end;
$$;

create trigger trg_club_owner_as_member
  after insert on clubs
  for each row
  execute function set_club_owner_as_member();

-- El roster es público; cada quien se une y se sale solo.
-- El dueño además puede sacar a alguien de su club.
create policy "club_members_select_authenticated"
  on club_members for select
  to authenticated
  using (true);

create policy "club_members_insert_self"
  on club_members for insert
  to authenticated
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "club_members_delete_self_or_owner"
  on club_members for delete
  to authenticated
  using (
    player_id in (select id from players where auth_user_id = auth.uid())
    or club_id in (
      select id from clubs
      where owner_player_id in (select id from players where auth_user_id = auth.uid())
    )
  );
