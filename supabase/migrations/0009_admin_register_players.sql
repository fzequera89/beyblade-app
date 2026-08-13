-- Permite al admin registrar jugadores manualmente (sin cuenta todavía, auth_user_id null).
create policy "players_insert_admin"
  on players for insert
  to authenticated
  with check (
    exists (select 1 from players p where p.auth_user_id = auth.uid() and p.is_admin = true)
  );
