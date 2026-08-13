-- Reporte de resultado + confirmación + cálculo de ELO real (1.4)
-- Basado en docs/elo-rules.md

create table bracket_byes (
  tournament_id uuid references tournaments(id) on delete cascade,
  bracket_round int not null,
  player_id uuid references players(id) on delete cascade,
  primary key (tournament_id, bracket_round, player_id)
);

alter table bracket_byes enable row level security;

create policy "bracket_byes_select_authenticated"
  on bracket_byes for select
  to authenticated
  using (true);

create policy "bracket_byes_insert_organizer"
  on bracket_byes for insert
  to authenticated
  with check (
    tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      where lm.player_id in (select id from players where auth_user_id = auth.uid())
        and lm.role = 'organizer'
    )
  );

-- Un participante reporta el resultado de su propio match (solo si sigue 'pending').
create policy "matches_update_report_by_participant"
  on matches for update
  to authenticated
  using (
    status = 'pending'
    and (
      player_a_id in (select id from players where auth_user_id = auth.uid())
      or player_b_id in (select id from players where auth_user_id = auth.uid())
    )
  )
  with check (
    status = 'reported'
    and (
      player_a_id in (select id from players where auth_user_id = auth.uid())
      or player_b_id in (select id from players where auth_user_id = auth.uid())
    )
  );

-- El otro participante (no quien reportó) o un organizador puede marcarlo como disputado.
create policy "matches_update_dispute"
  on matches for update
  to authenticated
  using (
    status = 'reported'
    and (
      (
        (
          player_a_id in (select id from players where auth_user_id = auth.uid())
          or player_b_id in (select id from players where auth_user_id = auth.uid())
        )
        and reported_by not in (select id from players where auth_user_id = auth.uid())
      )
      or tournament_id in (
        select t.id from tournaments t
        join league_members lm on lm.league_id = t.league_id
        where lm.player_id in (select id from players where auth_user_id = auth.uid())
          and lm.role = 'organizer'
      )
    )
  )
  with check (status = 'disputed');

-- Un organizador puede resolver una disputa devolviendo el match a 'pending'
-- (se vuelve a reportar desde cero). Sin esto, un match disputado quedaría sin salida.
create policy "matches_update_resolve_dispute"
  on matches for update
  to authenticated
  using (
    status = 'disputed'
    and tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      where lm.player_id in (select id from players where auth_user_id = auth.uid())
        and lm.role = 'organizer'
    )
  )
  with check (status = 'pending');

-- Confirmar un resultado corre el cálculo de ELO completo de forma atómica.
-- SECURITY DEFINER: valida autorización internamente (participante contrario u organizador),
-- así no se necesita una política de RLS separada para el UPDATE que hace el cálculo de ELO.
create function confirm_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_player_a players%rowtype;
  v_player_b players%rowtype;
  v_caller_player_id uuid;
  v_is_organizer boolean;
  v_ea numeric; v_eb numeric;
  v_d int; v_m numeric;
  v_ka int; v_kb int;
  v_sa numeric; v_sb numeric;
  v_delta_a numeric; v_delta_b numeric;
  v_pair_a uuid; v_pair_b uuid;
  v_win_a int; v_win_b int;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'reported' then
    raise exception 'El match no está en estado reportado';
  end if;

  select id into v_caller_player_id from players where auth_user_id = auth.uid();
  if v_caller_player_id is null then
    raise exception 'No autorizado';
  end if;

  if v_caller_player_id = v_match.reported_by then
    raise exception 'Quien reporta no puede confirmar su propio resultado';
  end if;

  v_is_organizer := exists (
    select 1 from league_members lm
    where lm.league_id = v_match.league_id
      and lm.player_id = v_caller_player_id
      and lm.role = 'organizer'
  );

  if not (v_caller_player_id in (v_match.player_a_id, v_match.player_b_id) or v_is_organizer) then
    raise exception 'No autorizado para confirmar este match';
  end if;

  select * into v_player_a from players where id = v_match.player_a_id for update;
  select * into v_player_b from players where id = v_match.player_b_id for update;

  v_ea := 1.0 / (1 + power(10, (v_player_b.elo_rating - v_player_a.elo_rating) / 400.0));
  v_eb := 1 - v_ea;

  v_d := abs(v_match.score_a - v_match.score_b);
  v_m := least(1.30, 1 + 0.20 * ln(v_d + 1));

  v_sa := case when v_match.winner_id = v_player_a.id then 1 else 0 end;
  v_sb := 1 - v_sa;

  v_ka := case when v_player_a.matches_played < 10 then 40 else 24 end;
  v_kb := case when v_player_b.matches_played < 10 then 40 else 24 end;

  v_delta_a := round(v_ka * v_m * (v_sa - v_ea), 2);
  v_delta_b := round(v_kb * v_m * (v_sb - v_eb), 2);

  update matches set
    status = 'confirmed',
    confirmed_by = v_caller_player_id,
    confirmed_at = now(),
    elo_a_before = v_player_a.elo_rating,
    elo_b_before = v_player_b.elo_rating,
    elo_a_change = v_delta_a,
    elo_b_change = v_delta_b
  where id = p_match_id;

  update players set elo_rating = elo_rating + v_delta_a, matches_played = matches_played + 1
  where id = v_player_a.id;

  update players set elo_rating = elo_rating + v_delta_b, matches_played = matches_played + 1
  where id = v_player_b.id;

  insert into ranking_snapshots (scope, scope_id, player_id, rating)
  values
    ('global', null, v_player_a.id, v_player_a.elo_rating + v_delta_a),
    ('global', null, v_player_b.id, v_player_b.elo_rating + v_delta_b);

  if v_player_a.id < v_player_b.id then
    v_pair_a := v_player_a.id; v_pair_b := v_player_b.id;
    v_win_a := v_sa::int; v_win_b := v_sb::int;
  else
    v_pair_a := v_player_b.id; v_pair_b := v_player_a.id;
    v_win_a := v_sb::int; v_win_b := v_sa::int;
  end if;

  insert into rivalries (player_a_id, player_b_id, wins_a, wins_b, last_match_id)
  values (v_pair_a, v_pair_b, v_win_a, v_win_b, p_match_id)
  on conflict (player_a_id, player_b_id)
  do update set
    wins_a = rivalries.wins_a + excluded.wins_a,
    wins_b = rivalries.wins_b + excluded.wins_b,
    last_match_id = excluded.last_match_id,
    updated_at = now();
end;
$$;

grant execute on function confirm_match_result(uuid) to authenticated;
