-- =====================================================================
-- DATOS DE DEMOSTRACIÓN — Beyblade League App
-- =====================================================================
--
-- Para enseñarle la app al cliente con la liga "llena": jugadores, ranking,
-- torneo jugado, estadísticas, rivalidades, logros, eventos y clubes.
--
-- NO ES UNA MIGRACIÓN. Vive fuera de supabase/migrations/ a propósito: es dato,
-- no esquema, y no debe correr como parte de la cadena de migraciones.
--
-- CÓMO USARLO
--   1. Pegar este archivo completo en el SQL Editor de Supabase y ejecutarlo.
--      Eso solo CREA las dos funciones, no siembra nada todavía.
--   2. Sembrar:  select seed_demo_data();
--   3. Borrar:   select remove_demo_data();
--
-- SEGURIDAD DEL BORRADO
--   Todo lo de demo usa UUIDs fijos que empiezan con 'dddddddd'. remove_demo_data()
--   borra exactamente esos ids y nada más, así que NO toca cuentas ni partidas
--   reales. Correr el seed dos veces tampoco duplica: limpia antes de sembrar.
--
-- POR QUÉ NO USA confirm_match_result
--   Esa función exige auth.uid() (una sesión real), y un script de seed no tiene
--   sesión. Aquí se replica su MISMA matemática de ELO (docs/elo-rules.md), así
--   que los datos quedan consistentes: el rating de cada jugador cuadra con la
--   suma de sus cambios, con ranking_snapshots y con rivalries.
--   award_badges SÍ se reutiliza tal cual, porque no depende de auth.uid().
-- =====================================================================


-- ---------------------------------------------------------------------
-- Borrado
-- ---------------------------------------------------------------------
create or replace function remove_demo_data()
returns text
language plpgsql
as $$
declare
  v_players uuid[];
  v_matches uuid[];
  v_tournaments uuid[];
  v_leagues uuid[];
  v_venues uuid[];
  v_events uuid[];
  v_clubs uuid[];
  v_count int;
begin
  -- El prefijo 'dddddddd' es la marca de "esto es demo".
  select array_agg(id) into v_players from players where id::text like 'dddddddd%';
  select array_agg(id) into v_matches from matches where id::text like 'dddddddd%';
  select array_agg(id) into v_tournaments from tournaments where id::text like 'dddddddd%';
  select array_agg(id) into v_leagues from leagues where id::text like 'dddddddd%';
  select array_agg(id) into v_venues from venues where id::text like 'dddddddd%';
  select array_agg(id) into v_events from events where id::text like 'dddddddd%';
  select array_agg(id) into v_clubs from clubs where id::text like 'dddddddd%';

  v_count := coalesce(array_length(v_players, 1), 0);

  -- Orden por dependencias. matches.player_a_id NO tiene on delete cascade,
  -- así que los matches se van antes que los jugadores o el delete falla.
  --
  -- OJO con el orden aquí: rivalries.last_match_id y challenges.match_id
  -- apuntan a matches SIN cascade, así que esas dos tienen que irse ANTES
  -- que los matches o el delete revienta por violación de llave foránea.
  delete from rivalries where player_a_id = any(coalesce(v_players, '{}'))
                           or player_b_id = any(coalesce(v_players, '{}'));
  delete from challenges where challenger_id = any(coalesce(v_players, '{}'))
                            or challenged_id = any(coalesce(v_players, '{}'));
  delete from match_rounds where match_id = any(coalesce(v_matches, '{}'));
  delete from matches where id = any(coalesce(v_matches, '{}'));
  delete from bracket_byes where tournament_id = any(coalesce(v_tournaments, '{}'));
  delete from tournament_registrations where tournament_id = any(coalesce(v_tournaments, '{}'));
  delete from tournaments where id = any(coalesce(v_tournaments, '{}'));

  delete from event_rsvps where event_id = any(coalesce(v_events, '{}'));
  delete from events where id = any(coalesce(v_events, '{}'));

  delete from club_members where club_id = any(coalesce(v_clubs, '{}'));
  delete from clubs where id = any(coalesce(v_clubs, '{}'));

  -- Estas cuelgan de players con cascade, pero se borran explícito para que
  -- el orden sea legible y no dependa de cómo quedó definida cada FK.
  -- combos va después de matches: matches.combo_a_id las referencia.
  delete from ranking_snapshots where player_id = any(coalesce(v_players, '{}'));
  delete from player_badges where player_id = any(coalesce(v_players, '{}'));
  delete from check_ins where player_id = any(coalesce(v_players, '{}'));
  delete from presence where player_id = any(coalesce(v_players, '{}'));
  delete from follows where follower_id = any(coalesce(v_players, '{}'))
                         or followee_id = any(coalesce(v_players, '{}'));
  delete from combos where player_id = any(coalesce(v_players, '{}'));

  delete from league_members where league_id = any(coalesce(v_leagues, '{}'))
                                or player_id = any(coalesce(v_players, '{}'));
  delete from seasons where league_id = any(coalesce(v_leagues, '{}'));
  delete from leagues where id = any(coalesce(v_leagues, '{}'));
  delete from check_ins where venue_id = any(coalesce(v_venues, '{}'));
  delete from venues where id = any(coalesce(v_venues, '{}'));

  delete from players where id = any(coalesce(v_players, '{}'));

  return format('Datos de demo borrados (%s jugadores).', v_count);
end;
$$;


-- ---------------------------------------------------------------------
-- Registra un match ya confirmado, con su ELO, rounds, rivalidad y logros.
-- Replica confirm_match_result (0007 + 0015) sin depender de auth.uid().
-- ---------------------------------------------------------------------
create or replace function demo_record_match(
  p_match_id uuid,
  p_a uuid,
  p_b uuid,
  p_winner uuid,
  p_loser_score int,
  p_when timestamptz,
  p_league uuid,
  p_tournament uuid default null,
  p_bracket_round int default null
)
returns void
language plpgsql
as $$
declare
  v_a players%rowtype;
  v_b players%rowtype;
  v_ea numeric; v_eb numeric;
  v_d int; v_m numeric;
  v_ka int; v_kb int;
  v_sa numeric; v_sb numeric;
  v_delta_a numeric; v_delta_b numeric;
  v_score_a int; v_score_b int;
  v_pair_a uuid; v_pair_b uuid;
  v_win_a int; v_win_b int;
  v_finishes text[] := array['spin', 'over', 'burst', 'xtreme'];
  v_seq uuid[];
  v_loser uuid;
  v_i int;
  v_combo_a uuid;
  v_combo_b uuid;
begin
  select * into v_a from players where id = p_a;
  select * into v_b from players where id = p_b;
  v_loser := case when p_winner = p_a then p_b else p_a end;

  v_score_a := case when p_winner = p_a then 3 else p_loser_score end;
  v_score_b := case when p_winner = p_b then 3 else p_loser_score end;

  -- Misma fórmula que docs/elo-rules.md
  v_ea := 1.0 / (1 + power(10, (v_b.elo_rating - v_a.elo_rating) / 400.0));
  v_eb := 1 - v_ea;
  v_d := abs(v_score_a - v_score_b);
  v_m := least(1.30, 1 + 0.20 * ln(v_d + 1));
  v_sa := case when p_winner = p_a then 1 else 0 end;
  v_sb := 1 - v_sa;
  -- K por jugador, según SU propia experiencia (regla 5 de elo-rules.md)
  v_ka := case when v_a.matches_played < 10 then 40 else 24 end;
  v_kb := case when v_b.matches_played < 10 then 40 else 24 end;
  v_delta_a := round(v_ka * v_m * (v_sa - v_ea), 2);
  v_delta_b := round(v_kb * v_m * (v_sb - v_eb), 2);

  select id into v_combo_a from combos where player_id = p_a order by random() limit 1;
  select id into v_combo_b from combos where player_id = p_b order by random() limit 1;

  insert into matches (
    id, tournament_id, league_id, player_a_id, player_b_id,
    combo_a_id, combo_b_id, score_a, score_b, winner_id, status, bracket_round,
    elo_a_before, elo_b_before, elo_a_change, elo_b_change,
    reported_by, confirmed_by, reported_at, confirmed_at
  ) values (
    p_match_id, p_tournament, p_league, p_a, p_b,
    v_combo_a, v_combo_b, v_score_a, v_score_b, p_winner, 'confirmed', p_bracket_round,
    v_a.elo_rating, v_b.elo_rating, v_delta_a, v_delta_b,
    p_winner, v_loser, p_when - interval '5 minutes', p_when
  );

  -- Rounds: el perdedor gana p_loser_score, el ganador 3. El último round
  -- siempre lo gana el ganador, porque ahí es donde se acaba el match.
  v_seq := array[]::uuid[];
  for v_i in 1..p_loser_score loop
    v_seq := v_seq || v_loser;
  end loop;
  for v_i in 1..2 loop
    v_seq := v_seq || p_winner;
  end loop;
  select array_agg(x order by random()) into v_seq from unnest(v_seq) as x;
  v_seq := v_seq || p_winner;

  for v_i in 1..array_length(v_seq, 1) loop
    insert into match_rounds (match_id, round_number, winner_id, finish_type, created_at)
    values (p_match_id, v_i, v_seq[v_i], v_finishes[1 + floor(random() * 4)::int], p_when);
  end loop;

  update players set elo_rating = elo_rating + v_delta_a, matches_played = matches_played + 1
  where id = p_a;
  update players set elo_rating = elo_rating + v_delta_b, matches_played = matches_played + 1
  where id = p_b;

  insert into ranking_snapshots (scope, scope_id, player_id, rating, snapshot_at)
  values ('global', null, p_a, v_a.elo_rating + v_delta_a, p_when),
         ('global', null, p_b, v_b.elo_rating + v_delta_b, p_when);

  -- Pareja normalizada (uuid menor primero), igual que confirm_match_result
  if p_a < p_b then
    v_pair_a := p_a; v_pair_b := p_b;
    v_win_a := v_sa::int; v_win_b := v_sb::int;
  else
    v_pair_a := p_b; v_pair_b := p_a;
    v_win_a := v_sb::int; v_win_b := v_sa::int;
  end if;

  insert into rivalries (player_a_id, player_b_id, wins_a, wins_b, last_match_id, updated_at)
  values (v_pair_a, v_pair_b, v_win_a, v_win_b, p_match_id, p_when)
  on conflict (player_a_id, player_b_id) do update set
    wins_a = rivalries.wins_a + excluded.wins_a,
    wins_b = rivalries.wins_b + excluded.wins_b,
    last_match_id = excluded.last_match_id,
    updated_at = excluded.updated_at;

  perform award_badges(p_a, p_match_id);
  perform award_badges(p_b, p_match_id);
end;
$$;


-- ---------------------------------------------------------------------
-- Siembra
-- ---------------------------------------------------------------------
create or replace function seed_demo_data()
returns text
language plpgsql
as $$
declare
  v_names text[] := array[
    'Diego Ramírez', 'Sofía Herrera', 'Mateo Castillo', 'Valentina Ortiz',
    'Emiliano Vargas', 'Camila Reyes', 'Santiago Mendoza', 'Renata Guzmán',
    'Leonardo Cruz', 'Ximena Peña', 'Sebastián Ríos', 'Regina Flores',
    'Adrián Cortés', 'Fernanda Lara', 'Rodrigo Salinas', 'Paulina Ibarra'
  ];
  v_cities text[] := array[
    'Monterrey', 'Monterrey', 'Guadalajara', 'CDMX',
    'Monterrey', 'Guadalajara', 'CDMX', 'Monterrey',
    'Guadalajara', 'CDMX', 'Monterrey', 'Guadalajara',
    'CDMX', 'Monterrey', 'Guadalajara', 'CDMX'
  ];
  -- "Habilidad" oculta: solo la usa el simulador para decidir resultados.
  -- Así el ranking final se ve creíble en vez de aleatorio puro.
  v_skill int[] := array[95, 90, 86, 83, 80, 77, 74, 71, 68, 65, 62, 58, 54, 50, 45, 40];
  v_styles text[] := array['Ataque', 'Defensa', 'Resistencia', 'Balance'];
  v_blades text[] := array[
    'Dran Sword', 'Hells Scythe', 'Wizard Arrow', 'Knight Shield',
    'Shark Edge', 'Leon Claw', 'Viper Tail', 'Phoenix Wing',
    'Dranzer Spiral', 'Hells Chain', 'Wyvern Gale', 'Cobalt Drake',
    'Silver Wolf', 'Black Shell', 'Weiss Tiger', 'Tyranno Beat'
  ];
  v_ratchets text[] := array['3-60', '4-60', '9-60', '1-60', '3-80', '4-80', '5-60', '7-60'];
  v_bits text[] := array['Ball', 'Flat', 'Taper', 'Needle', 'Point', 'Rush', 'Orb', 'Accel'];

  v_pid uuid;
  v_i int; v_j int; v_k int;
  v_league_central uuid := 'dddddddd-0000-4000-8000-00000000ce01';
  v_league_norte   uuid := 'dddddddd-0000-4000-8000-00000000ce02';
  v_season uuid := 'dddddddd-0000-4000-8000-000000005ea1';
  -- Ojo: todo esto son UUIDs, así que solo admiten hexadecimal (0-9, a-f).
  v_venue1 uuid := 'dddddddd-0000-4000-8000-000000000fe1';
  v_venue2 uuid := 'dddddddd-0000-4000-8000-000000000fe2';
  v_venue3 uuid := 'dddddddd-0000-4000-8000-000000000fe3';
  v_club1 uuid := 'dddddddd-0000-4000-8000-00000000c1b1';
  v_club2 uuid := 'dddddddd-0000-4000-8000-00000000c1b2';
  v_tourney uuid := 'dddddddd-0000-4000-8000-0000000070a1';
  v_next_tourney uuid := 'dddddddd-0000-4000-8000-0000000070a2';

  v_a uuid; v_b uuid; v_winner uuid;
  v_skill_a int; v_skill_b int;
  v_prob numeric;
  v_loser_score int;
  v_when timestamptz;
  v_match_seq int := 0;
  v_bracket uuid[];
  v_next_bracket uuid[];
  v_match_count int;
begin
  perform remove_demo_data();
  -- Semilla fija: correrlo dos veces da exactamente los mismos resultados.
  perform setseed(0.42);

  -- ---------------- Jugadores ----------------
  -- auth_user_id queda en null: son jugadores registrados "a mano", el mismo
  -- caso que ya contempla el panel de admin (migración 0009). Nadie puede
  -- iniciar sesión como ellos, que es justo lo que queremos en una demo.
  for v_i in 1..16 loop
    insert into players (
      id, auth_user_id, display_name, city, country,
      main_beyblade, play_style, elo_rating, matches_played, created_at
    ) values (
      ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid,
      null,
      v_names[v_i],
      v_cities[v_i],
      'México',
      v_blades[v_i],
      v_styles[1 + (v_i % 4)],
      1000,
      0,
      now() - (interval '1 day' * (120 - v_i * 3))
    );
  end loop;

  -- ---------------- Combos ----------------
  -- Dos por jugador, para que "rendimiento por combo" tenga con qué comparar.
  for v_i in 1..16 loop
    v_pid := ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid;
    for v_j in 1..2 loop
      insert into combos (player_id, name, parts, created_at) values (
        v_pid,
        v_blades[1 + ((v_i + v_j * 5) % 16)] || ' ' || v_ratchets[1 + ((v_i + v_j) % 8)],
        jsonb_build_object(
          'blade', v_blades[1 + ((v_i + v_j * 5) % 16)],
          'ratchet', v_ratchets[1 + ((v_i + v_j) % 8)],
          'bit', v_bits[1 + ((v_i * v_j) % 8)]
        ),
        now() - interval '90 days'
      );
    end loop;
  end loop;

  -- ---------------- Venues ----------------
  insert into venues (id, name, address, city, country, qr_code, created_at) values
    (v_venue1, 'Hobby Center Cumbres', 'Av. Paseo de los Leones 2500', 'Monterrey', 'México', 'demo-venue-cumbres', now() - interval '100 days'),
    (v_venue2, 'Torre de Batalla GDL', 'Av. Chapultepec 480', 'Guadalajara', 'México', 'demo-venue-gdl', now() - interval '95 days'),
    (v_venue3, 'Arena Roma Norte', 'Calle Orizaba 42', 'CDMX', 'México', 'demo-venue-roma', now() - interval '90 days');

  -- ---------------- Ligas, temporada y miembros ----------------
  insert into leagues (id, name, description, owner_player_id, created_at) values
    (v_league_central, 'Liga CML Central',
     'La liga principal. Torneos mensuales y ranking oficial.',
     'dddddddd-0000-4000-8000-000000000001', now() - interval '110 days'),
    (v_league_norte, 'Liga CML Norte',
     'Circuito regional del norte. Sede fija en Monterrey.',
     'dddddddd-0000-4000-8000-000000000005', now() - interval '80 days');

  -- Los dueños ya entraron como organizadores por el trigger de 0004,
  -- así que aquí solo se agregan los demás.
  for v_i in 1..16 loop
    v_pid := ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid;
    insert into league_members (league_id, player_id, role, joined_at)
    values (v_league_central, v_pid, case when v_i = 2 then 'organizer' else 'member' end,
            now() - (interval '1 day' * (100 - v_i * 2)))
    on conflict do nothing;

    -- La liga norte solo agrupa a los de Monterrey.
    if v_cities[v_i] = 'Monterrey' then
      insert into league_members (league_id, player_id, role, joined_at)
      values (v_league_norte, v_pid, 'member', now() - (interval '1 day' * (70 - v_i)))
      on conflict do nothing;
    end if;
  end loop;

  insert into seasons (id, league_id, name, start_date, end_date, created_at) values
    (v_season, v_league_central, 'Temporada 2026', (now() - interval '90 days')::date,
     (now() + interval '90 days')::date, now() - interval '90 days');

  -- ---------------- Clubes ----------------
  insert into clubs (id, league_id, name, description, city, owner_player_id, created_at) values
    (v_club1, v_league_central, 'Dragones de Acero',
     'Club de ataque puro. Entrenamos los martes en Cumbres.', 'Monterrey',
     'dddddddd-0000-4000-8000-000000000001', now() - interval '75 days'),
    (v_club2, v_league_central, 'Guardianes del Oeste',
     'Defensa y resistencia. Todos son bienvenidos.', 'Guadalajara',
     'dddddddd-0000-4000-8000-000000000003', now() - interval '70 days');

  for v_i in 1..16 loop
    v_pid := ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid;
    if v_cities[v_i] = 'Monterrey' then
      insert into club_members (club_id, player_id, joined_at)
      values (v_club1, v_pid, now() - interval '60 days') on conflict do nothing;
    elsif v_cities[v_i] = 'Guadalajara' then
      insert into club_members (club_id, player_id, joined_at)
      values (v_club2, v_pid, now() - interval '60 days') on conflict do nothing;
    end if;
  end loop;

  -- ---------------- Follows ----------------
  -- Los mejores del ranking acumulan más seguidores, como pasaría de verdad.
  for v_i in 1..16 loop
    for v_j in 1..16 loop
      if v_i <> v_j and v_skill[v_j] > v_skill[v_i] - 10 and random() < 0.35 then
        insert into follows (follower_id, followee_id, created_at) values (
          ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid,
          ('dddddddd-0000-4000-8000-0000000000' || lpad(v_j::text, 2, '0'))::uuid,
          now() - (interval '1 day' * floor(random() * 60))
        ) on conflict do nothing;
      end if;
    end loop;
  end loop;

  -- ---------------- Matches de liga (últimos 60 días) ----------------
  -- 60 encuentros sueltos. El de más habilidad gana más seguido, pero hay
  -- sorpresas: sin ellas el ranking sale plano y el ELO no se ve creíble.
  for v_k in 1..60 loop
    v_i := 1 + floor(random() * 16)::int;
    v_j := 1 + floor(random() * 16)::int;
    continue when v_i = v_j;

    v_a := ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid;
    v_b := ('dddddddd-0000-4000-8000-0000000000' || lpad(v_j::text, 2, '0'))::uuid;
    v_skill_a := v_skill[v_i];
    v_skill_b := v_skill[v_j];

    v_prob := 1.0 / (1 + power(10, (v_skill_b - v_skill_a) / 25.0));
    v_winner := case when random() < v_prob then v_a else v_b end;
    v_loser_score := floor(random() * 3)::int;
    -- Van de hace 64 días a hace 5. El torneo se juega DESPUÉS (hace 3 días),
    -- y se siembra después, para que el orden de inserción coincida con el
    -- cronológico: si no, la gráfica de ELO mostraría saltos hacia atrás.
    v_when := now() - (interval '1 day' * (65 - v_k)) - (interval '1 hour' * floor(random() * 10));
    v_match_seq := v_match_seq + 1;

    perform demo_record_match(
      ('dddddddd-0000-4000-8000-0000aa' || lpad(v_match_seq::text, 6, '0'))::uuid,
      v_a, v_b, v_winner, v_loser_score, v_when, v_league_central
    );
  end loop;

  -- ---------------- Torneo terminado (8 jugadores, 3 rondas) ----------------
  insert into tournaments (id, league_id, season_id, name, format, status, created_at) values
    (v_tourney, v_league_central, v_season, 'Copa Central — Agosto', 'single_elimination',
     'completed', now() - interval '5 days');

  v_bracket := array[]::uuid[];
  for v_i in 1..8 loop
    v_pid := ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid;
    v_bracket := v_bracket || v_pid;
    insert into tournament_registrations (tournament_id, player_id, registered_at, checked_in_at)
    values (v_tourney, v_pid, now() - interval '5 days', now() - interval '3 days');
  end loop;

  for v_k in 1..3 loop
    v_next_bracket := array[]::uuid[];
    v_i := 1;
    while v_i < array_length(v_bracket, 1) + 1 loop
      v_a := v_bracket[v_i];
      v_b := v_bracket[v_i + 1];
      -- Los dos últimos caracteres del uuid del jugador son su número (01..16),
      -- que es justo el índice de su habilidad en v_skill.
      v_skill_a := v_skill[(substring(v_a::text from 35 for 2))::int];
      v_skill_b := v_skill[(substring(v_b::text from 35 for 2))::int];
      v_prob := 1.0 / (1 + power(10, (v_skill_b - v_skill_a) / 25.0));
      v_winner := case when random() < v_prob then v_a else v_b end;
      v_loser_score := floor(random() * 3)::int;
      v_match_seq := v_match_seq + 1;

      perform demo_record_match(
        ('dddddddd-0000-4000-8000-0000aa' || lpad(v_match_seq::text, 6, '0'))::uuid,
        v_a, v_b, v_winner, v_loser_score,
        now() - (interval '3 days') + (interval '40 minutes' * v_k),
        v_league_central, v_tourney, v_k
      );

      v_next_bracket := v_next_bracket || v_winner;
      v_i := v_i + 2;
    end loop;
    v_bracket := v_next_bracket;
  end loop;

  -- ---------------- Torneo próximo (inscripciones abiertas) ----------------
  insert into tournaments (id, league_id, season_id, name, format, status, created_at) values
    (v_next_tourney, v_league_central, v_season, 'Copa Central — Septiembre',
     'single_elimination', 'pending', now() - interval '3 days');

  for v_i in 1..11 loop
    insert into tournament_registrations (tournament_id, player_id, registered_at, checked_in_at)
    values (v_next_tourney,
            ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid,
            now() - (interval '1 day' * floor(random() * 3)), null);
  end loop;

  -- ---------------- Check-ins ----------------
  for v_i in 1..16 loop
    v_pid := ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid;
    for v_j in 1..(2 + floor(random() * 4)::int) loop
      insert into check_ins (player_id, venue_id, checked_in_at) values (
        v_pid,
        case v_cities[v_i] when 'Monterrey' then v_venue1
                           when 'Guadalajara' then v_venue2
                           else v_venue3 end,
        now() - (interval '1 day' * floor(random() * 40))
      );
    end loop;
  end loop;

  -- Unos cuantos check-ins de hoy, para que "Who's Playing Here" tenga qué mostrar.
  for v_i in 1..5 loop
    insert into check_ins (player_id, venue_id, checked_in_at) values (
      ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid,
      v_venue1,
      now() - (interval '1 hour' * v_i)
    );
  end loop;

  -- ---------------- Presencia ("buscando jugar") ----------------
  for v_i in 1..6 loop
    insert into presence (player_id, status, venue_id, expires_at, created_at) values (
      ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid,
      'looking_to_play',
      case when v_i <= 3 then v_venue1 else null end,
      now() + interval '4 hours',
      now() - interval '30 minutes'
    );
  end loop;

  -- ---------------- Eventos ----------------
  insert into events (id, venue_id, league_id, season_id, type, title, description, starts_at, ends_at, created_by, created_at) values
    ('dddddddd-0000-4000-8000-00000000e001', v_venue1, v_league_central, v_season, 'tournament',
     'Copa Central — Septiembre', 'Torneo mensual con ranking oficial. Registro desde las 10:00.',
     now() + interval '9 days', now() + interval '9 days 6 hours',
     'dddddddd-0000-4000-8000-000000000001', now() - interval '3 days'),
    ('dddddddd-0000-4000-8000-00000000e002', v_venue1, null, null, 'free_play',
     'Juego libre de los martes', 'Sin registro, sin ranking. Caes y juegas.',
     now() + interval '2 days', now() + interval '2 days 4 hours',
     'dddddddd-0000-4000-8000-000000000005', now() - interval '10 days'),
    ('dddddddd-0000-4000-8000-00000000e003', v_venue2, v_league_central, v_season, 'league_night',
     'Noche de liga GDL', 'Matches oficiales que sí cuentan para el ranking.',
     now() + interval '5 days', now() + interval '5 days 5 hours',
     'dddddddd-0000-4000-8000-000000000002', now() - interval '8 days'),
    ('dddddddd-0000-4000-8000-00000000e004', v_venue3, null, null, 'beginner_day',
     'Día de novatos CDMX', 'Si nunca has competido, este es tu evento. Prestamos beys.',
     now() + interval '14 days', now() + interval '14 days 4 hours',
     'dddddddd-0000-4000-8000-000000000004', now() - interval '5 days'),
    ('dddddddd-0000-4000-8000-00000000e005', v_venue1, v_league_norte, null, 'club_battle',
     'Dragones vs Guardianes', 'Batalla de clubes. Se juega por equipos de 5.',
     now() + interval '21 days', now() + interval '21 days 5 hours',
     'dddddddd-0000-4000-8000-000000000001', now() - interval '2 days');

  for v_i in 1..16 loop
    v_pid := ('dddddddd-0000-4000-8000-0000000000' || lpad(v_i::text, 2, '0'))::uuid;
    if random() < 0.7 then
      insert into event_rsvps (event_id, player_id, created_at)
      values ('dddddddd-0000-4000-8000-00000000e001', v_pid, now() - interval '2 days')
      on conflict do nothing;
    end if;
    if random() < 0.5 then
      insert into event_rsvps (event_id, player_id, created_at)
      values ('dddddddd-0000-4000-8000-00000000e002', v_pid, now() - interval '1 day')
      on conflict do nothing;
    end if;
    if v_cities[v_i] = 'Guadalajara' then
      insert into event_rsvps (event_id, player_id, created_at)
      values ('dddddddd-0000-4000-8000-00000000e003', v_pid, now() - interval '3 days')
      on conflict do nothing;
    end if;
  end loop;

  select count(*) into v_match_count from matches where id::text like 'dddddddd%';

  return format(
    'Demo lista: 16 jugadores, 2 ligas, 2 clubes, 3 venues, 2 torneos, 5 eventos y %s matches confirmados. Para borrarla: select remove_demo_data();',
    v_match_count
  );
end;
$$;
