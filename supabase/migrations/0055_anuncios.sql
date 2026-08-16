-- Anuncios de la administración.
--
-- El admin manda un mensaje a un jugador, a un club, a una liga o a todos. No
-- hace falta un sistema nuevo: **la bandeja de notificaciones ya es eso**. Un
-- anuncio es un aviso más, con la diferencia de que lo escribe una persona en
-- vez de dispararlo un hecho del juego.
--
-- Se guarda además el anuncio en sí, y no solo las copias repartidas, por dos
-- razones: para poder ver qué se dijo y a quién (las copias se borran cuando un
-- jugador limpia su bandeja), y porque el texto es uno aunque los destinatarios
-- sean treinta.
--
-- **Reparto en el momento del envío, no al leer.** Un anuncio "a la Liga Norte"
-- se copia a los que son miembros HOY: quien entre mañana no recibe el aviso de
-- ayer, igual que en cualquier chat. Resolverlo al leer haría que un anuncio
-- viejo apareciera de pronto en la bandeja de alguien que ni estaba.

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  sent_by uuid not null references players(id),
  title text not null,
  body text not null,
  -- A quién: 'global' | 'league' | 'club' | 'player'
  scope text not null check (scope in ('global', 'league', 'club', 'player')),
  -- Nulo solo cuando el alcance es global.
  target_id uuid,
  recipients int not null default 0,
  created_at timestamptz not null default now(),
  check ((scope = 'global') = (target_id is null))
);

create index if not exists announcements_recientes_idx on announcements (created_at desc);

alter table announcements enable row level security;

-- Los lee cualquiera que haya entrado: el historial de lo anunciado no es
-- secreto, y el detalle de quién lo recibió vive en su propia bandeja.
drop policy if exists "announcements_read" on announcements;
create policy "announcements_read" on announcements for select to authenticated using (true);

-- Sin políticas de escritura: entra por función, que es donde se comprueba
-- quién manda y a quién le llega.

create or replace function send_announcement(
  p_title text,
  p_body text,
  p_scope text,
  p_target_id uuid default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_id uuid;
  v_destinatarios int;
begin
  select id into v_admin from players where auth_user_id = auth.uid() and is_admin = true;
  if v_admin is null then
    raise exception 'Solo la administración manda anuncios';
  end if;

  if length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'El anuncio necesita un título';
  end if;
  if length(btrim(coalesce(p_body, ''))) < 3 then
    raise exception 'El anuncio necesita un mensaje';
  end if;
  if p_scope not in ('global', 'league', 'club', 'player') then
    raise exception 'Alcance inválido: %', p_scope;
  end if;
  if (p_scope = 'global') <> (p_target_id is null) then
    raise exception 'Un anuncio global no lleva destinatario, y los demás sí';
  end if;

  insert into announcements (sent_by, title, body, scope, target_id)
  values (v_admin, btrim(p_title), btrim(p_body), p_scope, p_target_id)
  returning id into v_id;

  -- Una copia por destinatario, en la misma bandeja donde ya viven los avisos
  -- del juego. `distinct` porque alguien puede estar dos veces en el origen —
  -- un jugador en dos ligas no debe recibir el mismo anuncio dos veces.
  with destinatarios as (
    select distinct p.id
    from players p
    where p_scope = 'global'
       or (p_scope = 'player' and p.id = p_target_id)
       or (p_scope = 'club' and exists (
             select 1 from club_members cm where cm.club_id = p_target_id and cm.player_id = p.id))
       or (p_scope = 'league' and exists (
             select 1 from league_members lm where lm.league_id = p_target_id and lm.player_id = p.id))
  )
  insert into push_outbox (player_id, title, body, data)
  select d.id, btrim(p_title), btrim(p_body),
         jsonb_build_object('screen', 'Notifications', 'announcementId', v_id)
  from destinatarios d;

  get diagnostics v_destinatarios = row_count;
  update announcements set recipients = v_destinatarios where id = v_id;

  return v_destinatarios;
end;
$$;

revoke execute on function send_announcement(text, text, text, uuid) from public, anon;
grant execute on function send_announcement(text, text, text, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- La entrega, por lotes
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `deliver_push` mandaba TODO lo pendiente en una sola petición. Con los avisos
-- del juego —dos o tres a la vez— daba igual, pero **un anuncio global son
-- tantos mensajes como jugadores**, y la API de Expo acepta 100 por petición.
-- Sin trocear, el primer anuncio a toda la liga se habría rechazado entero.

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
  v_total int := 0;
begin
  perform prune_dead_push_tokens();

  -- Hasta 100 por vuelta, que es el máximo que acepta Expo de una sentada.
  loop
    select jsonb_agg(m.mensaje), array_agg(m.id)
    into v_mensajes, v_ids
    from (
      select o.id,
             jsonb_build_object(
               'to', t.token,
               'title', o.title,
               'body', o.body,
               'data', o.data,
               'sound', 'default'
             ) as mensaje
      from push_outbox o
      join push_tokens t on t.player_id = o.player_id
      where o.sent_at is null
      limit 100
    ) m;

    exit when v_mensajes is null;

    select net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_mensajes,
      headers := jsonb_build_object('Content-Type', 'application/json')
    ) into v_request;

    update push_outbox
    set sent_at = now(), request_id = v_request
    where id = any(v_ids);

    v_total := v_total + array_length(v_ids, 1);
  end loop;

  return v_total;
end;
$$;

revoke execute on function deliver_push() from public, anon, authenticated;
