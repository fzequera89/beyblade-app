-- Estadísticas de combate (3.1) — captura de datos.
--
-- Contexto: desde 0002 estas tablas tenían RLS activado pero NINGUNA política,
-- así que estaban completamente cerradas. Además nadie escribía en `match_rounds`
-- ni en `combos`, por lo que "desglose por finish" y "rendimiento por combo" (M9)
-- no tenían de dónde salir. Esta migración abre las tablas y agrega la captura.

-- combos: cada jugador administra los suyos; el resto solo los lee
-- (hacen falta para mostrar con qué combo se ganó un match).
create policy "combos_select_authenticated"
  on combos for select
  to authenticated
  using (true);

create policy "combos_insert_own"
  on combos for insert
  to authenticated
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "combos_update_own"
  on combos for update
  to authenticated
  using (player_id in (select id from players where auth_user_id = auth.uid()))
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

create policy "combos_delete_own"
  on combos for delete
  to authenticated
  using (player_id in (select id from players where auth_user_id = auth.uid()));

-- match_rounds: lectura pública. La escritura NO se abre por política:
-- pasa solo por report_match_result (abajo), para que el marcador del match
-- y sus rounds no puedan quedar en desacuerdo.
create policy "match_rounds_select_authenticated"
  on match_rounds for select
  to authenticated
  using (true);

-- rivalries y ranking_snapshots: las llena confirm_match_result (SECURITY DEFINER).
-- Aquí solo se abre la lectura, que es lo que consumen las pantallas de Fase 3.
create policy "rivalries_select_authenticated"
  on rivalries for select
  to authenticated
  using (true);

create policy "ranking_snapshots_select_authenticated"
  on ranking_snapshots for select
  to authenticated
  using (true);

-- Tipos de finish válidos (Beyblade X). Se valida en la función, no con un enum,
-- para no repetir el problema de 0005 (ALTER TYPE ... ADD VALUE necesita correr solo).
-- Agregar un tipo nuevo aquí es un simple CREATE OR REPLACE de la función.

-- Reportar resultado round a round, de forma atómica.
-- Reemplaza al UPDATE directo que hacía la app: además del marcador registra
-- cada round (ganador + finish) y el combo que usó quien reporta.
-- SECURITY DEFINER: valida internamente que quien llama sea participante,
-- igual que confirm_match_result.
create function report_match_result(
  p_match_id uuid,
  p_rounds jsonb,
  p_combo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_caller_player_id uuid;
  v_round jsonb;
  v_round_winner uuid;
  v_finish text;
  v_score_a int := 0;
  v_score_b int := 0;
  v_winner_id uuid;
  v_n int;
  v_i int := 0;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'pending' then
    raise exception 'Este match ya fue reportado';
  end if;

  select id into v_caller_player_id from players where auth_user_id = auth.uid();
  if v_caller_player_id is null then
    raise exception 'No autorizado';
  end if;
  if v_caller_player_id not in (v_match.player_a_id, v_match.player_b_id) then
    raise exception 'Solo un participante puede reportar este match';
  end if;

  if jsonb_typeof(p_rounds) <> 'array' then
    raise exception 'Los rounds deben venir como arreglo';
  end if;

  v_n := jsonb_array_length(p_rounds);
  if v_n = 0 then
    raise exception 'Hay que registrar al menos un round';
  end if;

  -- El combo tiene que ser de quien reporta; si no, se ignoraría silenciosamente
  -- y las estadísticas por combo quedarían mal atribuidas.
  if p_combo_id is not null then
    if not exists (select 1 from combos where id = p_combo_id and player_id = v_caller_player_id) then
      raise exception 'Ese combo no es tuyo';
    end if;
  end if;

  -- Re-reportar tras una disputa reabierta: los rounds viejos se van.
  delete from match_rounds where match_id = p_match_id;

  for v_round in select * from jsonb_array_elements(p_rounds)
  loop
    v_i := v_i + 1;
    v_round_winner := (v_round ->> 'winner_id')::uuid;
    v_finish := v_round ->> 'finish_type';

    if v_round_winner not in (v_match.player_a_id, v_match.player_b_id) then
      raise exception 'El ganador del round % no es participante del match', v_i;
    end if;
    if v_finish is null or v_finish not in ('spin', 'over', 'burst', 'xtreme') then
      raise exception 'Tipo de finish inválido en el round %', v_i;
    end if;

    if v_round_winner = v_match.player_a_id then
      v_score_a := v_score_a + 1;
    else
      v_score_b := v_score_b + 1;
    end if;

    insert into match_rounds (match_id, round_number, winner_id, finish_type)
    values (p_match_id, v_i, v_round_winner, v_finish);
  end loop;

  if v_score_a = v_score_b then
    raise exception 'El match no puede quedar empatado';
  end if;

  v_winner_id := case when v_score_a > v_score_b then v_match.player_a_id else v_match.player_b_id end;

  update matches set
    score_a = v_score_a,
    score_b = v_score_b,
    winner_id = v_winner_id,
    status = 'reported',
    reported_by = v_caller_player_id,
    reported_at = now(),
    combo_a_id = case when v_caller_player_id = v_match.player_a_id then p_combo_id else combo_a_id end,
    combo_b_id = case when v_caller_player_id = v_match.player_b_id then p_combo_id else combo_b_id end
  where id = p_match_id;
end;
$$;

grant execute on function report_match_result(uuid, jsonb, uuid) to authenticated;

-- Al reabrir una disputa (0007) el match vuelve a 'pending' pero sus rounds
-- quedaban colgando. report_match_result ya los borra al re-reportar; este
-- trigger cubre el hueco por si alguien reabre y nunca vuelve a reportar.
create function clear_rounds_on_reopen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' and old.status <> 'pending' then
    delete from match_rounds where match_id = new.id;
  end if;
  return new;
end;
$$;

create trigger trg_clear_rounds_on_reopen
  after update on matches
  for each row
  execute function clear_rounds_on_reopen();
