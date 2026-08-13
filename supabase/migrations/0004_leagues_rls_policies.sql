-- Políticas y trigger para Liga y temporada (1.2)

-- leagues: cualquier autenticado puede ver todas las ligas (descubribles);
-- solo el dueño (owner_player_id) puede editarlas; cualquier autenticado puede crear una.
create policy "leagues_select_authenticated"
  on leagues for select
  to authenticated
  using (true);

create policy "leagues_insert_authenticated"
  on leagues for insert
  to authenticated
  with check (
    owner_player_id in (select id from players where auth_user_id = auth.uid())
  );

create policy "leagues_update_owner"
  on leagues for update
  to authenticated
  using (owner_player_id in (select id from players where auth_user_id = auth.uid()))
  with check (owner_player_id in (select id from players where auth_user_id = auth.uid()));

-- Al crear una liga, el dueño entra automáticamente como organizador.
-- Esto evita que un cliente pueda auto-asignarse el rol 'organizer' vía insert directo a league_members.
create function set_league_owner_as_organizer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into league_members (league_id, player_id, role)
  values (new.id, new.owner_player_id, 'organizer');
  return new;
end;
$$;

create trigger trg_league_owner_as_organizer
  after insert on leagues
  for each row
  execute function set_league_owner_as_organizer();

-- league_members: visible para cualquier autenticado (roster público);
-- un jugador solo puede unirse a sí mismo, y siempre como 'member' (nunca 'organizer' vía insert directo).
-- promover a organizador se hace con UPDATE, solo por un organizador existente de esa liga.
create policy "league_members_select_authenticated"
  on league_members for select
  to authenticated
  using (true);

create policy "league_members_insert_self_as_member"
  on league_members for insert
  to authenticated
  with check (
    role = 'member'
    and player_id in (select id from players where auth_user_id = auth.uid())
  );

create policy "league_members_update_organizer"
  on league_members for update
  to authenticated
  using (
    league_id in (
      select league_id from league_members
      where player_id in (select id from players where auth_user_id = auth.uid())
        and role = 'organizer'
    )
  )
  with check (
    league_id in (
      select league_id from league_members
      where player_id in (select id from players where auth_user_id = auth.uid())
        and role = 'organizer'
    )
  );

create policy "league_members_delete_organizer_or_self"
  on league_members for delete
  to authenticated
  using (
    player_id in (select id from players where auth_user_id = auth.uid())
    or league_id in (
      select league_id from league_members
      where player_id in (select id from players where auth_user_id = auth.uid())
        and role = 'organizer'
    )
  );

-- seasons: visibles para cualquier autenticado; solo un organizador de esa liga puede crear/editar.
create policy "seasons_select_authenticated"
  on seasons for select
  to authenticated
  using (true);

create policy "seasons_insert_organizer"
  on seasons for insert
  to authenticated
  with check (
    league_id in (
      select league_id from league_members
      where player_id in (select id from players where auth_user_id = auth.uid())
        and role = 'organizer'
    )
  );

create policy "seasons_update_organizer"
  on seasons for update
  to authenticated
  using (
    league_id in (
      select league_id from league_members
      where player_id in (select id from players where auth_user_id = auth.uid())
        and role = 'organizer'
    )
  )
  with check (
    league_id in (
      select league_id from league_members
      where player_id in (select id from players where auth_user_id = auth.uid())
        and role = 'organizer'
    )
  );
