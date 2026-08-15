-- Deck card: el "3+1" del reglamento.
--
-- En las modalidades con deck (3 vs 3, 5G) no se juega con un combo suelto: se
-- registra ANTES del torneo una tarjeta con las combinaciones que vas a usar, y
-- esa tarjeta se bloquea. Dos reglas que hoy el software no podía ni
-- representar:
--
--   1. **No se repite ninguna pieza** entre las combinaciones del deck. Con tres
--      beyblades, los tres blades, los tres ratchets y los tres bits tienen que
--      ser distintos. Es la regla que hace del deck una decisión y no una lista.
--   2. **Se bloquea durante el torneo.** Si se pudiera editar a media llave,
--      cualquiera cambiaría su deck después de ver el bracket, y la tarjeta
--      dejaría de significar nada.
--
-- Modelado como tarjeta POR TORNEO y no como propiedad del jugador: el mismo
-- jugador lleva decks distintos a torneos distintos, y el del torneo pasado
-- tiene que quedar registrado tal como se jugó.
--
-- Las piezas NO se modelan como tablas de catálogo. `combos.parts` ya guarda
-- blade/ratchet/bit como texto desde 0016, y un catálogo cerrado obligaría a
-- una migración cada vez que Takara Tomy saca una pieza. La validación de "no
-- repetir" compara el texto normalizado.

create table if not exists deck_cards (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  -- Nulo = todavía se puede editar. Con fecha = bloqueada.
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tournament_id, player_id)
);

create table if not exists deck_card_combos (
  deck_card_id uuid not null references deck_cards(id) on delete cascade,
  combo_id uuid not null references combos(id) on delete cascade,
  slot int not null,
  primary key (deck_card_id, slot),
  unique (deck_card_id, combo_id)
);

create index if not exists deck_cards_tournament_idx on deck_cards (tournament_id);

alter table deck_cards enable row level security;
alter table deck_card_combos enable row level security;

-- Los decks son públicos dentro de la app a propósito: el rival y el juez
-- tienen que poder verificar con qué se está jugando. Esconderlos convertiría
-- cualquier reclamo en la palabra de uno contra la del otro.
drop policy if exists "deck_cards_read" on deck_cards;
create policy "deck_cards_read" on deck_cards for select to authenticated using (true);

drop policy if exists "deck_card_combos_read" on deck_card_combos;
create policy "deck_card_combos_read" on deck_card_combos for select to authenticated using (true);

-- Sin políticas de escritura: todo entra por `save_deck_card`, que es donde
-- viven las dos reglas. Con un insert directo se podría guardar un deck con
-- tres veces el mismo bit.

-- ─────────────────────────────────────────────────────────────────────────────
-- Guardar (o rehacer) la tarjeta
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function save_deck_card(p_tournament_id uuid, p_combo_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_tournament tournaments%rowtype;
  v_expected int;
  v_deck uuid;
  v_locked timestamptz;
  v_dupes int;
  v_i int;
begin
  select id into v_player from players where auth_user_id = auth.uid();
  if v_player is null then
    raise exception 'No autorizado';
  end if;

  select * into v_tournament from tournaments where id = p_tournament_id;
  if not found then
    raise exception 'Torneo no encontrado';
  end if;

  v_expected := case v_tournament.combat_mode
                  when 'deck3' then 3
                  when 'deck5' then 5
                  else 1
                end;

  if v_expected = 1 then
    raise exception 'Este torneo se juega con una sola combinación: no lleva deck';
  end if;

  if not exists (
    select 1 from tournament_registrations
    where tournament_id = p_tournament_id and player_id = v_player
  ) then
    raise exception 'Primero inscríbete en el torneo';
  end if;

  -- La tarjeta se congela cuando el torneo arranca. Editarla con el bracket ya
  -- armado sería elegir el deck DESPUÉS de ver contra quién te tocó.
  select locked_at into v_locked from deck_cards
  where tournament_id = p_tournament_id and player_id = v_player;

  if v_locked is not null then
    raise exception 'Tu deck ya está bloqueado para este torneo';
  end if;

  if v_tournament.status <> 'pending' then
    raise exception 'El torneo ya empezó: el deck se registra antes';
  end if;

  if array_length(p_combo_ids, 1) is distinct from v_expected then
    raise exception 'Este torneo pide % combinaciones, llegaron %',
      v_expected, coalesce(array_length(p_combo_ids, 1), 0);
  end if;

  if exists (
    select 1 from unnest(p_combo_ids) c(id)
    where not exists (select 1 from combos where id = c.id and player_id = v_player)
  ) then
    raise exception 'Solo puedes armar el deck con tus propios combos';
  end if;

  -- La regla del reglamento: ninguna pieza se repite entre las combinaciones.
  -- Se compara en minúsculas y sin espacios de sobra, porque "Wizard Rod" y
  -- "wizard  rod" son la misma pieza escrita por dos personas distintas.
  select count(*) into v_dupes from (
    select lower(btrim(value)) as piece, count(*) as veces
    from combos c,
         lateral (values (c.parts->>'blade'), (c.parts->>'ratchet'), (c.parts->>'bit')) as p(value)
    where c.id = any(p_combo_ids)
      and nullif(btrim(coalesce(value, '')), '') is not null
    group by lower(btrim(value))
    having count(*) > 1
  ) repetidas;

  if v_dupes > 0 then
    raise exception 'El deck repite % pieza(s). En deck no se puede repetir blade, ratchet ni bit', v_dupes;
  end if;

  insert into deck_cards (tournament_id, player_id)
  values (p_tournament_id, v_player)
  on conflict (tournament_id, player_id) do update set tournament_id = excluded.tournament_id
  returning id into v_deck;

  delete from deck_card_combos where deck_card_id = v_deck;

  v_i := 1;
  while v_i <= v_expected loop
    insert into deck_card_combos (deck_card_id, combo_id, slot)
    values (v_deck, p_combo_ids[v_i], v_i);
    v_i := v_i + 1;
  end loop;

  return v_deck;
end;
$$;

grant execute on function save_deck_card(uuid, uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bloquear los decks del torneo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Lo hace la organización al cerrar el registro. Se bloquean TODOS de una vez y
-- no cada quien el suyo: si dependiera del jugador, nadie bloquearía el propio.

create or replace function lock_tournament_decks(p_tournament_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_league uuid;
  v_locked int;
begin
  select id into v_caller from players where auth_user_id = auth.uid();
  select league_id into v_league from tournaments where id = p_tournament_id;
  if v_league is null then
    raise exception 'Torneo no encontrado';
  end if;

  if not (
    exists (select 1 from players where id = v_caller and is_admin = true)
    or exists (
      select 1 from league_members
      where player_id = v_caller and league_id = v_league and role = 'organizer'
    )
  ) then
    raise exception 'Solo la organización bloquea los decks';
  end if;

  update deck_cards
  set locked_at = now()
  where tournament_id = p_tournament_id and locked_at is null;

  get diagnostics v_locked = row_count;
  return v_locked;
end;
$$;

grant execute on function lock_tournament_decks(uuid) to authenticated;
