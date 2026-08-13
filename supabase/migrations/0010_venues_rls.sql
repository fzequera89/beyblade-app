-- Venues (2.1): lectura pública para autenticados, alta/edición solo admin o moderador de alguna liga.
create policy "venues_select_authenticated"
  on venues for select
  to authenticated
  using (true);

create policy "venues_insert_organizer_or_admin"
  on venues for insert
  to authenticated
  with check (
    exists (
      select 1 from players where auth_user_id = auth.uid()
        and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
    )
  );

create policy "venues_update_organizer_or_admin"
  on venues for update
  to authenticated
  using (
    exists (
      select 1 from players where auth_user_id = auth.uid()
        and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
    )
  )
  with check (
    exists (
      select 1 from players where auth_user_id = auth.uid()
        and (is_admin = true or id in (select player_id from league_members where role = 'organizer'))
    )
  );
