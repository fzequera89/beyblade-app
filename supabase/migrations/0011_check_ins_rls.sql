-- Check-in por QR de venue (2.2)
create policy "check_ins_select_authenticated"
  on check_ins for select
  to authenticated
  using (true);

create policy "check_ins_insert_self"
  on check_ins for insert
  to authenticated
  with check (
    player_id in (select id from players where auth_user_id = auth.uid())
  );
