-- Bladers Near Me (2.4)
create policy "presence_select_authenticated"
  on presence for select
  to authenticated
  using (true);

create policy "presence_insert_self"
  on presence for insert
  to authenticated
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "presence_delete_self"
  on presence for delete
  to authenticated
  using (player_id in (select id from players where auth_user_id = auth.uid()));
