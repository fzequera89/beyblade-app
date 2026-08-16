-- Notificaciones push.
--
-- Tres piezas, y solo una es "la notificación":
--
--   1. `push_tokens` — dónde avisar. Un jugador puede tener varios aparatos.
--   2. `push_outbox` — qué avisar. Se escribe DENTRO de la transacción del hecho
--      que lo provoca: si el combate no se guarda, el aviso no existe.
--   3. La entrega — `pg_net` llamando a la API de Expo. Es **asíncrona**: encolar
--      el envío no retrasa el combate ni lo hace fallar si Expo está caído.
--
-- **Por qué no una Edge Function.** Habría que desplegarla y mantenerla aparte,
-- con su propio juego de secretos, para hacer un POST. Todo el proyecto ya vive
-- en funciones SQL; esto encaja ahí y se prueba con las mismas herramientas.
--
-- **Por qué triggers y no editar las funciones de negocio.** `apply_match_
-- confirmation` tiene 150 líneas y ya se reescribió cuatro veces. Avisar es un
-- efecto de que algo pasó, no parte de que pase: cuelga de la tabla, y así el
-- día que cambie la lógica del combate los avisos siguen saliendo igual.

create extension if not exists pg_net with schema extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Dónde avisar
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists push_tokens (
  token text primary key,
  player_id uuid not null references players(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_player_idx on push_tokens (player_id);

alter table push_tokens enable row level security;

-- Cada quien administra los suyos y **solo ve los suyos**: la lista de tokens de
-- los demás no le sirve a nadie dentro de la app y es justo lo que haría falta
-- para mandarle notificaciones a otro por fuera.
drop policy if exists "push_tokens_own" on push_tokens;
create policy "push_tokens_own" on push_tokens for all to authenticated
  using (player_id in (select id from players where auth_user_id = auth.uid()))
  with check (player_id in (select id from players where auth_user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Qué avisar
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists push_outbox (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  title text not null,
  body text not null,
  -- Adónde lleva el toque: {"screen":"MatchDetail","matchId":"..."}
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  request_id bigint,
  error text
);

create index if not exists push_outbox_pending_idx on push_outbox (created_at) where sent_at is null;

alter table push_outbox enable row level security;
-- Sin políticas: es cosa del servidor. Nadie lee ni escribe avisos desde la app.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Encolar y entregar
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function queue_push(
  p_player_id uuid,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sin aparato registrado no hay a quién avisar: no se guarda basura en la
  -- bandeja para todos los jugadores de demo que nunca abrieron la app.
  if not exists (select 1 from push_tokens where player_id = p_player_id) then
    return;
  end if;

  insert into push_outbox (player_id, title, body, data)
  values (p_player_id, p_title, p_body, coalesce(p_data, '{}'::jsonb));
end;
$$;

revoke execute on function queue_push(uuid, text, text, jsonb) from public, anon, authenticated;

/**
 * Entrega lo pendiente. Manda un solo POST con todos los mensajes: la API de
 * Expo acepta lotes, y hacer una llamada por aviso convertiría una ronda de 16
 * combates en 32 peticiones.
 */
create or replace function deliver_push()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_mensajes jsonb;
  v_ids uuid[];
  v_request bigint;
begin
  select jsonb_agg(
           jsonb_build_object(
             'to', t.token,
             'title', o.title,
             'body', o.body,
             'data', o.data,
             'sound', 'default'
           )
         ),
         array_agg(distinct o.id)
  into v_mensajes, v_ids
  from push_outbox o
  join push_tokens t on t.player_id = o.player_id
  where o.sent_at is null;

  if v_mensajes is null then
    return 0;
  end if;

  select net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := v_mensajes,
    headers := jsonb_build_object('Content-Type', 'application/json')
  ) into v_request;

  update push_outbox
  set sent_at = now(), request_id = v_request
  where id = any(v_ids);

  return array_length(v_ids, 1);
end;
$$;

revoke execute on function deliver_push() from public, anon, authenticated;

-- Se entrega en cuanto hay algo que entregar. `pg_net` no espera respuesta, así
-- que esto no alarga la transacción que provocó el aviso.
create or replace function push_outbox_deliver()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform deliver_push();
  return null;
end;
$$;

drop trigger if exists push_outbox_after_insert on push_outbox;
create trigger push_outbox_after_insert
  after insert on push_outbox
  for each statement execute function push_outbox_deliver();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Qué merece una notificación
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Cuatro avisos, elegidos porque **destraban algo que está detenido**, no porque
-- sean interesantes. Una app que avisa de todo se silencia entera.

create or replace function notify_match_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rival uuid;
  v_nombre text;
begin
  -- a) Alguien reportó: al rival le toca marcar, y sin su marca no avanza nada.
  if new.status = 'reported' and coalesce(old.status, '') <> 'reported' then
    v_rival := case when new.reported_by = new.player_a_id then new.player_b_id else new.player_a_id end;
    select display_name into v_nombre from players where id = new.reported_by;
    perform queue_push(
      v_rival,
      'Te toca marcar el resultado',
      coalesce(v_nombre, 'Tu rival') || ' ya reportó. Marca tú también para que se cierre.',
      jsonb_build_object('screen', 'MatchDetail', 'matchId', new.id)
    );

  -- b) Un juez lo aprobó: los dos quieren saber cómo quedó su ELO.
  elsif new.status = 'confirmed' and coalesce(old.status, '') <> 'confirmed' then
    perform queue_push(
      new.player_a_id,
      case when new.winner_id = new.player_a_id then '¡Ganaste!' else 'Resultado aprobado' end,
      'El combate quedó ' || new.score_a || '–' || new.score_b || '.',
      jsonb_build_object('screen', 'MatchDetail', 'matchId', new.id)
    );
    perform queue_push(
      new.player_b_id,
      case when new.winner_id = new.player_b_id then '¡Ganaste!' else 'Resultado aprobado' end,
      'El combate quedó ' || new.score_b || '–' || new.score_a || '.',
      jsonb_build_object('screen', 'MatchDetail', 'matchId', new.id)
    );
  end if;

  return null;
end;
$$;

drop trigger if exists matches_notify on matches;
create trigger matches_notify
  after update of status on matches
  for each row execute function notify_match_events();

-- c) Ronda nueva: tienes combate y hay que ir a la mesa.
create or replace function notify_new_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_torneo text;
begin
  if new.tournament_id is null then
    return null;
  end if;

  select name into v_torneo from tournaments where id = new.tournament_id;

  perform queue_push(new.player_a_id, 'Tienes combate',
    coalesce(v_torneo, 'Torneo') || ' · ronda ' || coalesce(new.bracket_round, 1),
    jsonb_build_object('screen', 'MatchDetail', 'matchId', new.id));
  perform queue_push(new.player_b_id, 'Tienes combate',
    coalesce(v_torneo, 'Torneo') || ' · ronda ' || coalesce(new.bracket_round, 1),
    jsonb_build_object('screen', 'MatchDetail', 'matchId', new.id));

  return null;
end;
$$;

drop trigger if exists matches_notify_new on matches;
create trigger matches_notify_new
  after insert on matches
  for each row execute function notify_new_match();

-- d) Te retaron. Es el único aviso que empieza algo en vez de destrabarlo, y va
--    porque un reto que nadie ve es un reto que no pasa.
create or replace function notify_challenge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
  if new.status <> 'pending' then
    return null;
  end if;

  select display_name into v_nombre from players where id = new.challenger_id;

  perform queue_push(
    new.challenged_id,
    'Te retaron',
    coalesce(v_nombre, 'Alguien') || ' quiere jugar contigo.',
    jsonb_build_object('screen', 'Challenges')
  );

  return null;
end;
$$;

drop trigger if exists challenges_notify on challenges;
create trigger challenges_notify
  after insert on challenges
  for each row execute function notify_challenge();
