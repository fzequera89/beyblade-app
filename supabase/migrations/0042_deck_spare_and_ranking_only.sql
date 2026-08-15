-- El deck es 3+1, y solo existe en ranking.
--
-- Dos cosas que la 0040 dejó cortas, leyendo el reglamento otra vez:
--
--   1. **El extra.** El deck no es de 3: es de "3 Beyblades principales y 1
--      extra", y de ahí el nombre 3+1. Ese cuarto puede jugarse completo O
--      desarmarse para dar piezas a los tres principales. La 0040 exigía
--      exactamente 3 y no tenía dónde poner el cuarto.
--   2. **Solo ranking.** El reglamento dice explícito que la deck card se usa
--      en la modalidad de ranking y NO en casual. La 0040 la pedía en cualquier
--      torneo con deck.
--
-- La firma de `save_deck_card` no cambia a propósito: el extra entra como el
-- último elemento del mismo arreglo. Agregar un parámetro habría creado una
-- función NUEVA por sobrecarga, dejando viva la vieja de dos argumentos —y con
-- ella la validación incompleta— para cualquier APK que siguiera llamándola.

alter table deck_card_combos add column if not exists is_spare boolean not null default false;

comment on column deck_card_combos.is_spare is
  'El "+1" del deck 3+1: se puede jugar completo o desarmar para dar piezas a los principales.';

create or replace function save_deck_card(p_tournament_id uuid, p_combo_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_tournament tournaments%rowtype;
  v_main int;
  v_total int;
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

  -- La deck card es de la modalidad de ranking. En casual se juega con lo que
  -- traigas, que es justo lo que hace casual a la modalidad.
  if v_tournament.mode <> 'ranking' then
    raise exception 'La deck card solo se usa en torneos de ranking';
  end if;

  v_main := case v_tournament.combat_mode
              when 'deck3' then 3
              when 'deck5' then 5
              else 1
            end;

  if v_main = 1 then
    raise exception 'Este torneo se juega con una sola combinación: no lleva deck';
  end if;

  if not exists (
    select 1 from tournament_registrations
    where tournament_id = p_tournament_id and player_id = v_player
  ) then
    raise exception 'Primero inscríbete en el torneo';
  end if;

  select locked_at into v_locked from deck_cards
  where tournament_id = p_tournament_id and player_id = v_player;

  if v_locked is not null then
    raise exception 'Tu deck ya está bloqueado para este torneo';
  end if;

  if v_tournament.status <> 'pending' then
    raise exception 'El torneo ya empezó: el deck se registra antes';
  end if;

  v_total := coalesce(array_length(p_combo_ids, 1), 0);

  -- Los principales son obligatorios; el extra es opcional. Se acepta el deck
  -- sin extra porque no todos lo llevan, pero nunca de más.
  if v_total <> v_main and v_total <> v_main + 1 then
    raise exception 'Este torneo pide % principales y hasta 1 extra (llegaron %)', v_main, v_total;
  end if;

  if exists (
    select 1 from unnest(p_combo_ids) c(id)
    where not exists (select 1 from combos where id = c.id and player_id = v_player)
  ) then
    raise exception 'Solo puedes armar el deck con tus propios combos';
  end if;

  -- Ninguna pieza se repite, **incluido el extra**.
  --
  -- CONFIRMADO por el cliente (2026-08-15): el extra cuenta para la regla. El
  -- reglamento prohíbe repetir piezas dentro del deck sin distinguirlo, y tiene
  -- sentido: el extra puede entrar a jugar completo, y en 3 vs 3 los tres
  -- principales están en la mesa a la vez, así que una pieza duplicada podría
  -- terminar dos veces en juego.
  select count(*) into v_dupes from (
    select lower(btrim(p.pieza)) as piece
    from combos c,
         lateral (values (c.parts->>'blade'), (c.parts->>'ratchet'), (c.parts->>'bit')) as p(pieza)
    where c.id = any(p_combo_ids)
      and nullif(btrim(coalesce(p.pieza, '')), '') is not null
    group by lower(btrim(p.pieza))
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
  while v_i <= v_total loop
    insert into deck_card_combos (deck_card_id, combo_id, slot, is_spare)
    values (v_deck, p_combo_ids[v_i], v_i, v_i > v_main);
    v_i := v_i + 1;
  end loop;

  return v_deck;
end;
$$;

revoke execute on function save_deck_card(uuid, uuid[]) from public, anon;
grant execute on function save_deck_card(uuid, uuid[]) to authenticated;
