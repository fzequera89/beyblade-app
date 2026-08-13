-- Gamificación: badges y logros (3.3, módulo M10)
--
-- Las tablas `badges` y `player_badges` existen vacías desde 0001 y tenían RLS
-- sin políticas. Aquí se llena el catálogo, se abre la lectura y se agrega el
-- otorgamiento automático al confirmar un match.
--
-- Correr DESPUÉS de 0014 (award_badges lee match_rounds.finish_type).

create policy "badges_select_authenticated"
  on badges for select
  to authenticated
  using (true);

-- player_badges: solo lectura por política. Los otorga award_badges (SECURITY DEFINER),
-- para que nadie pueda auto-asignarse un logro con un insert directo.
create policy "player_badges_select_authenticated"
  on player_badges for select
  to authenticated
  using (true);

-- Catálogo. `code` es la llave estable que usa la lógica; el nombre y la
-- descripción son texto de UI y se pueden editar sin tocar código.
insert into badges (code, name, description) values
  ('first_win',    'Primera sangre',    'Gana tu primer match oficial.'),
  ('matches_10',   'Veterano',          'Juega 10 matches oficiales.'),
  ('matches_50',   'Leyenda local',     'Juega 50 matches oficiales.'),
  ('streak_3',     'En racha',          'Gana 3 matches seguidos.'),
  ('streak_5',     'Imparable',         'Gana 5 matches seguidos.'),
  ('streak_10',    'Dominación',        'Gana 10 matches seguidos.'),
  ('elo_1100',     'Ascenso',           'Alcanza 1100 de ELO.'),
  ('elo_1200',     'Competidor serio',  'Alcanza 1200 de ELO.'),
  ('elo_1300',     'Élite',             'Alcanza 1300 de ELO.'),
  ('giant_slayer', 'Mata gigantes',     'Vence a alguien con 100 puntos más de ELO que tú.'),
  ('flawless',     'Impecable',         'Gana un match sin ceder un solo round.'),
  ('xtreme',       'Xtreme',            'Gana un round con Xtreme Finish.'),
  ('burst_master', 'Maestro del burst', 'Gana 10 rounds por Burst Finish.'),
  ('nemesis',      'Némesis',           'Enfréntate 5 veces al mismo rival.')
on conflict (code) do nothing;

create function grant_badge(p_player_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into player_badges (player_id, badge_id)
  select p_player_id, b.id from badges b where b.code = p_code
  on conflict (player_id, badge_id) do nothing;
end;
$$;

-- Evalúa todos los logros de un jugador a raíz de un match recién confirmado.
-- Es idempotente: grant_badge ignora los que ya tiene, así que se puede llamar
-- las veces que sea sin duplicar nada.
create function award_badges(p_player_id uuid, p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players%rowtype;
  v_match matches%rowtype;
  v_wins int;
  v_streak int;
  v_my_elo_before numeric;
  v_rival_elo_before numeric;
  v_my_score int;
  v_rival_score int;
  v_burst_rounds int;
begin
  select * into v_player from players where id = p_player_id;
  select * into v_match from matches where id = p_match_id;
  if not found then
    return;
  end if;

  -- Volumen de partidas
  if v_player.matches_played >= 10 then
    perform grant_badge(p_player_id, 'matches_10');
  end if;
  if v_player.matches_played >= 50 then
    perform grant_badge(p_player_id, 'matches_50');
  end if;

  -- Hitos de ELO
  if v_player.elo_rating >= 1100 then
    perform grant_badge(p_player_id, 'elo_1100');
  end if;
  if v_player.elo_rating >= 1200 then
    perform grant_badge(p_player_id, 'elo_1200');
  end if;
  if v_player.elo_rating >= 1300 then
    perform grant_badge(p_player_id, 'elo_1300');
  end if;

  -- Primera victoria
  select count(*) into v_wins
  from matches m
  where m.status = 'confirmed' and m.winner_id = p_player_id;
  if v_wins >= 1 then
    perform grant_badge(p_player_id, 'first_win');
  end if;

  -- Racha actual: se cuenta hacia atrás desde el match más reciente
  -- hasta toparse con la primera derrota.
  with ordered as (
    select (m.winner_id = p_player_id) as won,
           row_number() over (order by m.confirmed_at desc) as rn
    from matches m
    where m.status = 'confirmed'
      and (m.player_a_id = p_player_id or m.player_b_id = p_player_id)
  )
  select coalesce(
    (select min(rn) - 1 from ordered where not won),
    (select count(*) from ordered)
  ) into v_streak;

  if v_streak >= 3 then
    perform grant_badge(p_player_id, 'streak_3');
  end if;
  if v_streak >= 5 then
    perform grant_badge(p_player_id, 'streak_5');
  end if;
  if v_streak >= 10 then
    perform grant_badge(p_player_id, 'streak_10');
  end if;

  -- Logros que dependen de ESTE match, solo si lo ganó
  if v_match.winner_id = p_player_id then
    if p_player_id = v_match.player_a_id then
      v_my_elo_before := v_match.elo_a_before;
      v_rival_elo_before := v_match.elo_b_before;
      v_my_score := v_match.score_a;
      v_rival_score := v_match.score_b;
    else
      v_my_elo_before := v_match.elo_b_before;
      v_rival_elo_before := v_match.elo_a_before;
      v_my_score := v_match.score_b;
      v_rival_score := v_match.score_a;
    end if;

    if v_rival_elo_before - v_my_elo_before >= 100 then
      perform grant_badge(p_player_id, 'giant_slayer');
    end if;

    if v_rival_score = 0 then
      perform grant_badge(p_player_id, 'flawless');
    end if;
  end if;

  -- Finishes (cuenta rounds ganados por el jugador en toda su historia)
  if exists (
    select 1 from match_rounds
    where match_id = p_match_id and winner_id = p_player_id and finish_type = 'xtreme'
  ) then
    perform grant_badge(p_player_id, 'xtreme');
  end if;

  select count(*) into v_burst_rounds
  from match_rounds mr
  join matches m on m.id = mr.match_id
  where mr.winner_id = p_player_id
    and mr.finish_type = 'burst'
    and m.status = 'confirmed';
  if v_burst_rounds >= 10 then
    perform grant_badge(p_player_id, 'burst_master');
  end if;

  -- Rivalidad: 5 o más encuentros contra el mismo oponente
  if exists (
    select 1 from rivalries r
    where (r.player_a_id = p_player_id or r.player_b_id = p_player_id)
      and (r.wins_a + r.wins_b) >= 5
  ) then
    perform grant_badge(p_player_id, 'nemesis');
  end if;
end;
$$;

grant execute on function award_badges(uuid, uuid) to authenticated;

-- Se re-declara confirm_match_result (definida en 0007) para enganchar el
-- otorgamiento de logros al final. El cuerpo es idéntico salvo las dos
-- llamadas a award_badges, que van después de actualizar players y rivalries
-- porque los logros se evalúan sobre el estado YA actualizado.
create or replace function confirm_match_result(p_match_id uuid)
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

  perform award_badges(v_player_a.id, p_match_id);
  perform award_badges(v_player_b.id, p_match_id);
end;
$$;
