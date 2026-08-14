-- Doble marca del resultado y bandeja del juez filtrada.
--
-- ── El problema con el flujo anterior ────────────────────────────────────────
--
-- Hasta hoy: A reporta round a round, y a B se le muestra "ganó A por 4–2" con
-- un botón grande de CONFIRMAR. Eso no es verificar, es ratificar: B ve la
-- respuesta antes de opinar. Si A se equivoca —o miente— el camino de menor
-- esfuerzo para B es aceptar.
--
-- El reglamento pide que los DOS marquen y que el juez entre solo si difieren.
-- Esta migración lo implementa con una marca A CIEGAS: B registra quién ganó y
-- cómo quedó SIN ver lo que puso A. Si coinciden, el match se cierra solo y
-- nadie molesta a un juez. Si no, recién ahí se le muestra a B la diferencia.
--
-- Por qué B marca el RESULTADO y no los rounds: el cliente cerró la decisión
-- como "si ambos marcan el mismo resultado no hace falta juez". Pedirle a B que
-- reingrese los 5 rounds duplicaría el trabajo en el 95% de los casos en que
-- están de acuerdo. Ganador + marcador es lo que hay que verificar, y es lo
-- que un jugador sí recuerda al terminar.
--
-- Por qué una diferencia NO abre disputa automática: el marcador sale de sumar
-- puntos por tipo de finish, y es fácil que alguien recuerde bien quién ganó
-- pero se equivoque en el total. Mandar eso a un juez sería fabricar disputas
-- de aritmética. B ve la diferencia y decide: aceptar o disputar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La marca del segundo jugador
-- ─────────────────────────────────────────────────────────────────────────────

alter table matches add column if not exists countermark_by uuid references players(id);
alter table matches add column if not exists countermark_winner_id uuid references players(id);
alter table matches add column if not exists countermark_score_a int;
alter table matches add column if not exists countermark_score_b int;
alter table matches add column if not exists countermark_at timestamptz;

-- Contexto de la disputa, para que el juez no llegue a ciegas.
alter table matches add column if not exists disputed_by uuid references players(id);
alter table matches add column if not exists disputed_at timestamptz;
alter table matches add column if not exists dispute_reason text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. B marca su versión, a ciegas
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function submit_countermark(
  p_match_id uuid,
  p_winner_id uuid,
  p_score_a int,
  p_score_b int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_caller uuid;
  v_agree boolean;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'reported' then
    raise exception 'Este combate no está esperando tu marca';
  end if;

  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    raise exception 'No autorizado';
  end if;
  if v_caller not in (v_match.player_a_id, v_match.player_b_id) then
    raise exception 'Solo un participante puede marcar este combate';
  end if;
  if v_caller = v_match.reported_by then
    raise exception 'Ya registraste tu versión; le toca a tu rival';
  end if;
  if v_match.countermark_by is not null then
    raise exception 'Ya marcaste este combate';
  end if;

  if p_winner_id not in (v_match.player_a_id, v_match.player_b_id) then
    raise exception 'El ganador tiene que ser uno de los dos participantes';
  end if;
  if p_score_a < 0 or p_score_b < 0 then
    raise exception 'El marcador no puede ser negativo';
  end if;
  if (p_winner_id = v_match.player_a_id and p_score_a < p_score_b)
     or (p_winner_id = v_match.player_b_id and p_score_b < p_score_a) then
    raise exception 'El marcador contradice al ganador que marcaste';
  end if;

  update matches set
    countermark_by = v_caller,
    countermark_winner_id = p_winner_id,
    countermark_score_a = p_score_a,
    countermark_score_b = p_score_b,
    countermark_at = now()
  where id = p_match_id;

  v_agree := (p_winner_id = v_match.winner_id
              and p_score_a = v_match.score_a
              and p_score_b = v_match.score_b);

  -- Coinciden: se cierra solo. Nadie molesta a un juez por un acuerdo.
  if v_agree then
    perform apply_match_confirmation(p_match_id, v_caller);
  end if;

  -- Si NO coinciden, recién aquí se le revela a B lo que puso A, para que
  -- decida entre aceptar o disputar. Antes de marcar no lo vio.
  return jsonb_build_object(
    'agreed', v_agree,
    'reported_winner_id', v_match.winner_id,
    'reported_score_a', v_match.score_a,
    'reported_score_b', v_match.score_b
  );
end;
$$;

grant execute on function submit_countermark(uuid, uuid, int, int) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Disputar, por función y no por UPDATE directo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Antes la app hacía `update matches set status='disputed'` desde el cliente,
-- apoyado en una política de RLS. Pasarlo a función deja registrado QUIÉN
-- disputó, CUÁNDO y POR QUÉ — que es justo lo que el juez necesita para no
-- llegar a ciegas — y de paso cierra la escritura directa.

create or replace function dispute_match(p_match_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_caller uuid;
  v_is_organizer boolean;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'reported' then
    raise exception 'Solo se puede disputar un resultado ya reportado';
  end if;

  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    raise exception 'No autorizado';
  end if;

  v_is_organizer := exists (
    select 1 from league_members lm
    where lm.player_id = v_caller
      and lm.role = 'organizer'
      and (
        lm.league_id = v_match.league_id
        or lm.league_id in (select league_id from tournaments where id = v_match.tournament_id)
      )
  );

  -- Quien reportó no disputa su propio reporte: si se equivocó, lo dice el otro.
  if not (
    (v_caller in (v_match.player_a_id, v_match.player_b_id) and v_caller <> v_match.reported_by)
    or v_is_organizer
  ) then
    raise exception 'No te corresponde disputar este combate';
  end if;

  update matches set
    status = 'disputed',
    disputed_by = v_caller,
    disputed_at = now(),
    dispute_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_match_id;
end;
$$;

grant execute on function dispute_match(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La bandeja del juez, filtrada a lo que ESE juez puede arbitrar
-- ─────────────────────────────────────────────────────────────────────────────
--
-- El aviso "TE TOCA ARBITRAR" contaba `matches where status='disputed'` sin
-- ningún filtro: cada juez veía las disputas de toda la plataforma, incluidas
-- las de combates que él mismo está jugando —donde can_arbitrate le devuelve
-- false y no puede hacer nada—. Un contador inflado hoy; el día que eso
-- dispare una notificación, es spam.

create or replace function arbitrable_match_ids()
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_id uuid;
begin
  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    return;
  end if;

  for v_id in select id from matches where status = 'disputed'
  loop
    if can_arbitrate(v_caller, v_id) then
      return next v_id;
    end if;
  end loop;
end;
$$;

grant execute on function arbitrable_match_ids() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Cerrar las escrituras directas que ya no hacen falta
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `matches_update_report_by_participant` (0007) dejaba a un participante hacer
-- UPDATE de cualquier columna de un match 'pending' con tal de dejarlo en
-- 'reported'. O sea: podía escribir score_a=9, winner_id=él mismo y saltarse
-- report_match_result entera — sin rounds, sin validar points_to_win y sin la
-- regla de que el Aerial no vale en ranking. Nadie la usa: la app reporta por
-- la función desde 0014. Se elimina.
--
-- `matches_update_dispute` (0007) queda reemplazada por dispute_match().
--
-- Las funciones son SECURITY DEFINER y no pasan por RLS, así que quitar estas
-- políticas no le quita nada a la app.

drop policy if exists "matches_update_report_by_participant" on matches;
drop policy if exists "matches_update_dispute" on matches;
