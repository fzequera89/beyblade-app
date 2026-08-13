-- Torneo y bracket (1.3). Correr después de 0005 (por separado).

alter table matches alter column status set default 'pending';
alter table matches add column bracket_round int;

create table tournament_registrations (
  tournament_id uuid references tournaments(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  registered_at timestamptz not null default now(),
  checked_in_at timestamptz,
  primary key (tournament_id, player_id)
);

alter table tournament_registrations enable row level security;

-- tournaments
create policy "tournaments_select_authenticated"
  on tournaments for select
  to authenticated
  using (true);

create policy "tournaments_insert_organizer"
  on tournaments for insert
  to authenticated
  with check (
    league_id in (
      select league_id from league_members
      where player_id in (select id from players where auth_user_id = auth.uid())
        and role = 'organizer'
    )
  );

create policy "tournaments_update_organizer"
  on tournaments for update
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

-- tournament_registrations
create policy "tournament_registrations_select_authenticated"
  on tournament_registrations for select
  to authenticated
  using (true);

create policy "tournament_registrations_insert_self"
  on tournament_registrations for insert
  to authenticated
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "tournament_registrations_update_self_or_organizer"
  on tournament_registrations for update
  to authenticated
  using (
    player_id in (select id from players where auth_user_id = auth.uid())
    or tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      where lm.player_id in (select id from players where auth_user_id = auth.uid())
        and lm.role = 'organizer'
    )
  )
  with check (
    player_id in (select id from players where auth_user_id = auth.uid())
    or tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      where lm.player_id in (select id from players where auth_user_id = auth.uid())
        and lm.role = 'organizer'
    )
  );

create policy "tournament_registrations_delete_self_or_organizer"
  on tournament_registrations for delete
  to authenticated
  using (
    player_id in (select id from players where auth_user_id = auth.uid())
    or tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      where lm.player_id in (select id from players where auth_user_id = auth.uid())
        and lm.role = 'organizer'
    )
  );

-- matches: lectura pública, creación (bracket) solo organizador.
-- El UPDATE (reportar/confirmar resultado) se agrega en 1.4.
create policy "matches_select_authenticated"
  on matches for select
  to authenticated
  using (true);

create policy "matches_insert_organizer"
  on matches for insert
  to authenticated
  with check (
    tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      where lm.player_id in (select id from players where auth_user_id = auth.uid())
        and lm.role = 'organizer'
    )
  );
