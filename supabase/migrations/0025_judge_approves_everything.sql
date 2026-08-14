-- Todo resultado lo aprueba un juez, y los jueces se asignan por liga y torneo.
--
-- ── Cambio de regla del cliente (2026-08-14) ─────────────────────────────────
--
-- Revierte la decisión anterior de "arbitraje por excepción". Antes: si los dos
-- jugadores marcaban lo mismo, el combate se cerraba solo. Ahora NINGÚN
-- resultado queda firme sin que un juez lo apruebe, coincidan o no.
--
-- La doble marca a ciegas de 0024 NO se tira: pasa de ser el mecanismo que
-- cerraba el combate a ser la EVIDENCIA con la que el juez decide. Si los dos
-- marcaron igual, aprobar es un toque. Si difieren, falla.
--
-- Costo que esto tiene y que conviene tener presente: en una noche con 30
-- combates hay 30 aprobaciones en cola. Si no hay jueces suficientes, el ELO de
-- todos se queda quieto. Por eso `approve_match_result` es deliberadamente
-- barata de llamar: no pide motivo ni reescribir el marcador.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Jueces asignados a una liga o a un torneo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Hasta ahora ser juez era global (`players.judge_role`) o venía de ser
-- moderador de la liga. El cliente pide poder nombrar jueces PARA un torneo o
-- PARA una liga concretos, que es como funciona un cuerpo arbitral real: se
-- convoca para el evento.

create table if not exists judge_assignments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  league_id uuid references leagues(id) on delete cascade,
  tournament_id uuid references tournaments(id) on delete cascade,
  role text not null default 'support' check (role in ('support', 'principal')),
  assigned_by uuid references players(id),
  created_at timestamptz not null default now(),
  -- Exactamente uno de los dos: o arbitras una liga, o arbitras un torneo.
  constraint judge_assignments_scope check (num_nonnulls(league_id, tournament_id) = 1)
);

create unique index if not exists judge_assignments_league_uniq
  on judge_assignments (player_id, league_id) where league_id is not null;
create unique index if not exists judge_assignments_tournament_uniq
  on judge_assignments (player_id, tournament_id) where tournament_id is not null;

alter table judge_assignments enable row level security;

-- Quién arbitra es público dentro de la liga: los jugadores tienen derecho a
-- saber quién puede fallar sus combates.
drop policy if exists "judge_assignments_read" on judge_assignments;
create policy "judge_assignments_read" on judge_assignments for select to authenticated using (true);

-- Sin políticas de escritura: se nombra por función, que valida quién nombra.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Nombrar y quitar jueces de una liga o torneo
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Puede esta persona administrar el cuerpo de jueces de este ámbito?
-- Admin de plataforma, o moderador de la liga (propia, o la del torneo).
create or replace function can_manage_judges(p_caller uuid, p_league_id uuid, p_tournament_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_league uuid;
begin
  if exists (select 1 from players where id = p_caller and is_admin = true) then
    return true;
  end if;

  v_league := coalesce(
    p_league_id,
    (select league_id from tournaments where id = p_tournament_id)
  );
  if v_league is null then
    return false;
  end if;

  return exists (
    select 1 from league_members lm
    where lm.player_id = p_caller
      and lm.league_id = v_league
      and lm.role = 'organizer'
  );
end;
$$;

grant execute on function can_manage_judges(uuid, uuid, uuid) to authenticated;

create or replace function assign_judge(
  p_player_id uuid,
  p_league_id uuid,
  p_tournament_id uuid,
  p_role text default 'support'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_id uuid;
begin
  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    raise exception 'No autorizado';
  end if;
  if num_nonnulls(p_league_id, p_tournament_id) <> 1 then
    raise exception 'Hay que nombrarlo para una liga O para un torneo, no ambos';
  end if;
  if p_role not in ('support', 'principal') then
    raise exception 'Rol de juez inválido: %', p_role;
  end if;
  if not can_manage_judges(v_caller, p_league_id, p_tournament_id) then
    raise exception 'Solo la administración o un moderador de la liga nombra jueces';
  end if;
  if not exists (select 1 from players where id = p_player_id) then
    raise exception 'Ese jugador no existe';
  end if;

  insert into judge_assignments (player_id, league_id, tournament_id, role, assigned_by)
  values (p_player_id, p_league_id, p_tournament_id, p_role, v_caller)
  on conflict do nothing
  returning id into v_id;

  -- Si ya estaba nombrado, solo se actualiza el rol.
  if v_id is null then
    update judge_assignments set role = p_role, assigned_by = v_caller
    where player_id = p_player_id
      and league_id is not distinct from p_league_id
      and tournament_id is not distinct from p_tournament_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

grant execute on function assign_judge(uuid, uuid, uuid, text) to authenticated;

create or replace function unassign_judge(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid;
  v_row judge_assignments%rowtype;
begin
  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    raise exception 'No autorizado';
  end if;

  select * into v_row from judge_assignments where id = p_assignment_id;
  if not found then
    return;
  end if;
  if not can_manage_judges(v_caller, v_row.league_id, v_row.tournament_id) then
    raise exception 'No te corresponde quitar jueces aquí';
  end if;

  delete from judge_assignments where id = p_assignment_id;
end;
$$;

grant execute on function unassign_judge(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. can_arbitrate ahora reconoce a los jueces asignados
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function can_arbitrate(p_player_id uuid, p_match_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_player players%rowtype;
  v_league uuid;
begin
  select * into v_match from matches where id = p_match_id;
  if not found then return false; end if;

  select * into v_player from players where id = p_player_id;
  if not found then return false; end if;

  -- Nadie arbitra un combate que está jugando. Vale también para el juez
  -- asignado: el conflicto de interés no se arregla con un nombramiento.
  if p_player_id in (v_match.player_a_id, v_match.player_b_id) then
    return false;
  end if;

  -- Un jugador suspendido no arbitra.
  if v_player.suspended_until is not null and v_player.suspended_until > now() then
    return false;
  end if;

  if v_player.is_admin or v_player.judge_role in ('principal', 'support') then
    return true;
  end if;

  v_league := coalesce(
    v_match.league_id,
    (select league_id from tournaments where id = v_match.tournament_id)
  );

  -- Juez nombrado para ESE torneo, o para la liga del combate.
  if exists (
    select 1 from judge_assignments ja
    where ja.player_id = p_player_id
      and (
        (ja.tournament_id is not null and ja.tournament_id = v_match.tournament_id)
        or (ja.league_id is not null and ja.league_id = v_league)
      )
  ) then
    return true;
  end if;

  -- Un moderador de la liga sigue pudiendo: es quien organiza cuando no hay
  -- cuerpo de jueces presente.
  return exists (
    select 1 from league_members lm
    where lm.player_id = p_player_id
      and lm.role = 'organizer'
      and lm.league_id = v_league
  );
end;
$$;

grant execute on function can_arbitrate(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La doble marca ya NO cierra el combate
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

  -- Coincidan o no, el combate NO se cierra aquí: espera al juez.
  return jsonb_build_object(
    'agreed', v_agree,
    'reported_winner_id', v_match.winner_id,
    'reported_score_a', v_match.score_a,
    'reported_score_b', v_match.score_b
  );
end;
$$;

grant execute on function submit_countermark(uuid, uuid, int, int) to authenticated;

-- Tras ver la diferencia, B se da por convencido: su marca pasa a ser la de A.
-- No cierra nada — solo deja constancia de que ya no hay desacuerdo, para que
-- el juez lo apruebe de un toque.
create or replace function accept_reported_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_caller uuid;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status <> 'reported' then
    raise exception 'Este combate ya no está esperando tu marca';
  end if;

  select id into v_caller from players where auth_user_id = auth.uid();
  if v_caller is null then
    raise exception 'No autorizado';
  end if;
  if v_caller not in (v_match.player_a_id, v_match.player_b_id) or v_caller = v_match.reported_by then
    raise exception 'No te corresponde aceptar este resultado';
  end if;

  update matches set
    countermark_by = v_caller,
    countermark_winner_id = v_match.winner_id,
    countermark_score_a = v_match.score_a,
    countermark_score_b = v_match.score_b,
    countermark_at = now()
  where id = p_match_id;
end;
$$;

grant execute on function accept_reported_result(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. El juez aprueba
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Camino rápido: el resultado reportado se toma tal cual. Sin pedir motivo ni
-- reescribir el marcador — si el juez tuviera que justificar cada aprobación
-- rutinaria, la cola no se vaciaría nunca. Para CAMBIAR el resultado ya existe
-- resolve_dispute, que sí exige dejar escrito el porqué.

create or replace function approve_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match matches%rowtype;
  v_judge uuid;
begin
  select * into v_match from matches where id = p_match_id for update;
  if not found then
    raise exception 'Match no encontrado';
  end if;
  if v_match.status not in ('reported', 'disputed') then
    raise exception 'Solo se aprueba un combate ya reportado';
  end if;
  if v_match.winner_id is null then
    raise exception 'El combate no tiene ganador definido';
  end if;

  select id into v_judge from players where auth_user_id = auth.uid();
  if v_judge is null then
    raise exception 'No autorizado';
  end if;
  if not can_arbitrate(v_judge, p_match_id) then
    raise exception 'Solo un juez puede aprobar este resultado';
  end if;

  update matches set
    arbitrated_by = v_judge,
    arbitrated_at = now()
  where id = p_match_id;

  perform apply_match_confirmation(p_match_id, v_judge);
end;
$$;

grant execute on function approve_match_result(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Los jugadores ya no confirman
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Se deja la función viva pero rechazando, en vez de revocarle el permiso: si
-- queda un APK viejo instalado por ahí, su botón de confirmar va a dar un
-- mensaje que se entiende en lugar de un "permission denied".

create or replace function confirm_match_result(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Los resultados ahora los aprueba un juez. Marca tu versión y espera el fallo.';
end;
$$;

grant execute on function confirm_match_result(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. La bandeja del juez incluye lo que espera aprobación
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Antes solo listaba disputas. Ahora TODO resultado reportado necesita al juez,
-- así que la cola son los 'reported' y los 'disputed' que ese juez puede tocar.

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

  for v_id in select id from matches where status in ('reported', 'disputed')
  loop
    if can_arbitrate(v_caller, v_id) then
      return next v_id;
    end if;
  end loop;
end;
$$;

grant execute on function arbitrable_match_ids() to authenticated;
