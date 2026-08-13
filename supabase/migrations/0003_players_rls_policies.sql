-- Políticas mínimas para que Auth + Perfil (1.1) funcione.
-- Lectura abierta a cualquier usuario autenticado (rankings/perfiles públicos dentro de la liga).
-- Escritura solo sobre el propio registro (auth_user_id = auth.uid()).

create policy "players_select_authenticated"
  on players for select
  to authenticated
  using (true);

create policy "players_insert_own"
  on players for insert
  to authenticated
  with check (auth_user_id = auth.uid());

create policy "players_update_own"
  on players for update
  to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());
