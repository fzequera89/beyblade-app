-- La bandeja de notificaciones dentro de la app.
--
-- Hoy la campana de Inicio solo cuenta retos pendientes. El cliente pidió que
-- avise de todo, y resulta que la tabla que hace falta **ya existe**:
-- `push_outbox` guarda cada aviso generado por jugador desde la 0046. Solo se
-- usaba para mandar.
--
-- Convertirla en bandeja tiene una ventaja que no es de ahorro: **un aviso que
-- no se pudo entregar igual aparece dentro de la app**. Justo lo que faltó en la
-- prueba de hoy, donde un token muerto hizo invisible una notificación que sí se
-- había generado, y pareció un fallo del sistema.
--
-- Dos cambios de comportamiento:
--   1. El aviso se guarda **aunque el jugador no tenga ningún aparato**. Antes se
--      descartaba: sin token no había a quién mandar, así que no se escribía. Con
--      bandeja, ese jugador tiene que poder leerlo cuando entre.
--   2. El jugador **lee lo suyo**. Hasta ahora la tabla no tenía ninguna política
--      de lectura: era cosa del servidor.

alter table push_outbox add column if not exists read_at timestamptz;

create index if not exists push_outbox_player_idx
  on push_outbox (player_id, created_at desc);

-- Cada quien ve SOLO sus avisos. Los de los demás dirían quién retó a quién y
-- quién va perdiendo, que es justo lo que no le corresponde a nadie más.
drop policy if exists "push_outbox_read_own" on push_outbox;
create policy "push_outbox_read_own" on push_outbox
  for select to authenticated
  using (player_id in (select id from players where auth_user_id = auth.uid()));

-- Marcar como leído es lo único que el jugador escribe, y solo sobre lo suyo.
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_tocadas int;
begin
  select id into v_player from players where auth_user_id = auth.uid();
  if v_player is null then
    raise exception 'No autorizado';
  end if;

  update push_outbox
  set read_at = now()
  where player_id = v_player
    and read_at is null
    and (p_ids is null or id = any(p_ids));

  get diagnostics v_tocadas = row_count;
  return v_tocadas;
end;
$$;

revoke execute on function mark_notifications_read(uuid[]) from public, anon;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- El aviso se guarda siempre; el envío es otra cosa
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
  -- Ya NO se descarta a quien no tiene aparato: el aviso es suyo y lo va a leer
  -- en la app. Quién recibe push lo decide `deliver_push` al cruzar con los
  -- tokens; quién recibe la notificación, esta tabla.
  insert into push_outbox (player_id, title, body, data)
  values (p_player_id, p_title, p_body, coalesce(p_data, '{}'::jsonb));
end;
$$;

revoke execute on function queue_push(uuid, text, text, jsonb) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Tokens muertos
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Cuando alguien desinstala la app, su token deja de existir para Firebase pero
-- sigue vivo en esta base, y todo aviso suyo se manda a una dirección que ya no
-- es de nadie. Pasó hoy: el sistema decía "entregado" y el teléfono nunca sonó.
--
-- Expo avisa de dos formas y esta función atiende la inmediata: cuando la
-- respuesta del envío trae `DeviceNotRegistered`, nombra el token culpable.
--
-- La otra forma —el acuse diferido, que fue el caso de hoy— **no queda cubierta
-- aquí**: para eso habría que guardar el ticket de cada mensaje y volver a
-- preguntarle a Expo minutos después. Se deja anotado y sin hacer porque, con la
-- bandeja de la app, un push perdido ya no vuelve invisible al aviso.

create or replace function prune_dead_push_tokens()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_borrados int;
begin
  with muertos as (
    select distinct d.value->'details'->>'expoPushToken' as token
    from net._http_response r,
         lateral jsonb_array_elements((r.content::jsonb)->'data') as d(value)
    where r.created > now() - interval '7 days'
      and r.content is not null
      and r.content like '%DeviceNotRegistered%'
      and d.value->'details'->>'expoPushToken' is not null
  )
  delete from push_tokens t using muertos m where t.token = m.token;

  get diagnostics v_borrados = row_count;
  return v_borrados;
end;
$$;

revoke execute on function prune_dead_push_tokens() from public, anon, authenticated;

-- Se limpia justo antes de cada envío: es el único momento en que importa, y
-- así no hace falta un proceso agendado que este proyecto no tiene.
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
  perform prune_dead_push_tokens();

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

  -- Un aviso para alguien sin aparato se queda con `sent_at` nulo para siempre,
  -- y está bien: no se mandó a ningún lado. En la app se lee igual.
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
