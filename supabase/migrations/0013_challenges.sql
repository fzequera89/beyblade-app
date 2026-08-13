-- Find a Battle / Challenge (2.5)

create table challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid references players(id) on delete cascade not null,
  challenged_id uuid references players(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  match_id uuid references matches(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (challenger_id <> challenged_id)
);

alter table challenges enable row level security;

create policy "challenges_select_participant"
  on challenges for select
  to authenticated
  using (
    challenger_id in (select id from players where auth_user_id = auth.uid())
    or challenged_id in (select id from players where auth_user_id = auth.uid())
  );

create policy "challenges_insert_challenger"
  on challenges for insert
  to authenticated
  with check (
    status = 'pending'
    and challenger_id in (select id from players where auth_user_id = auth.uid())
    and challenger_id <> challenged_id
  );

create policy "challenges_update_challenged_decline"
  on challenges for update
  to authenticated
  using (
    status = 'pending'
    and challenged_id in (select id from players where auth_user_id = auth.uid())
  )
  with check (status = 'declined');

create policy "challenges_update_challenger_cancel"
  on challenges for update
  to authenticated
  using (
    status = 'pending'
    and challenger_id in (select id from players where auth_user_id = auth.uid())
  )
  with check (status = 'cancelled');

-- Aceptar crea el match de forma atómica (evita dar permiso amplio de insert directo en matches).
create function accept_challenge(p_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge challenges%rowtype;
  v_caller_player_id uuid;
  v_match_id uuid;
begin
  select * into v_challenge from challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Reto no encontrado';
  end if;
  if v_challenge.status <> 'pending' then
    raise exception 'Este reto ya no está pendiente';
  end if;

  select id into v_caller_player_id from players where auth_user_id = auth.uid();
  if v_caller_player_id is null or v_caller_player_id <> v_challenge.challenged_id then
    raise exception 'No autorizado para aceptar este reto';
  end if;

  insert into matches (player_a_id, player_b_id, bracket_round)
  values (v_challenge.challenger_id, v_challenge.challenged_id, null)
  returning id into v_match_id;

  update challenges set status = 'accepted', match_id = v_match_id, responded_at = now()
  where id = p_challenge_id;

  return v_match_id;
end;
$$;

grant execute on function accept_challenge(uuid) to authenticated;
