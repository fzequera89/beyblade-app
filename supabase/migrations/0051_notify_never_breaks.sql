-- Un aviso no puede tumbar la operación que lo dispara.
--
-- La 0050 arregló la causa concreta —un `coalesce` sobre un enum— pero dejó en
-- pie el problema de fondo: los triggers de notificación corren DENTRO de la
-- transacción del hecho que anuncian, así que cualquier error suyo se lleva el
-- hecho consigo. Un error tipográfico en el texto de un aviso alcanzaba para
-- que ningún resultado se pudiera registrar en toda la app, y eso fue
-- exactamente lo que pasó durante el QA.
--
-- Aquí se blindan: si algo falla al preparar el aviso, se traga el error y la
-- operación sigue. Notificar es un efecto secundario; jugar no.
--
-- Se registra el fallo con `raise warning` para que quede en los registros de
-- Postgres en vez de desaparecer: un aviso perdido en silencio es justo lo que
-- nos costó tres sesiones en las push.

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
  begin
    if new.status = 'reported' and old.status is distinct from 'reported' then
      v_rival := case when new.reported_by = new.player_a_id then new.player_b_id else new.player_a_id end;
      select display_name into v_nombre from players where id = new.reported_by;
      perform queue_push(
        v_rival,
        'Te toca marcar el resultado',
        coalesce(v_nombre, 'Tu rival') || ' ya reportó. Marca tú también para que se cierre.',
        jsonb_build_object('screen', 'MatchDetail', 'matchId', new.id)
      );

    elsif new.status = 'confirmed' and old.status is distinct from 'confirmed' then
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
  exception when others then
    raise warning 'aviso de combate no enviado (%): %', new.id, sqlerrm;
  end;

  return null;
end;
$$;

create or replace function notify_new_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_torneo text;
begin
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
  exception when others then
    raise warning 'aviso de combate nuevo no enviado (%): %', new.id, sqlerrm;
  end;

  return null;
end;
$$;

create or replace function notify_challenge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
begin
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
  exception when others then
    raise warning 'aviso de reto no enviado (%): %', new.id, sqlerrm;
  end;

  return null;
end;
$$;
