-- El trigger de avisos rompía TODO reporte de resultado.
--
-- La 0046 comparaba así:
--
--     if new.status = 'reported' and coalesce(old.status, '') <> 'reported'
--
-- `matches.status` es el enum `match_status`, y `coalesce(old.status, '')`
-- obliga a Postgres a convertir esa cadena vacía al enum. No existe ese valor,
-- así que revienta con:
--
--     invalid input value for enum match_status: ""
--
-- Y como el trigger corre DESPUÉS del update dentro de la misma transacción,
-- se llevaba consigo el reporte entero: desde la 0046, **ningún resultado se
-- podía registrar**. El aviso, que es un adorno del proceso, tumbaba el proceso.
--
-- La comparación correcta con nulos es `is distinct from`, que además dice lo
-- que uno quiere decir: "cambió a este estado". El coalesce sobraba — en un
-- AFTER UPDATE `old` nunca es nulo.
--
-- Lección para lo que venga: un trigger de notificación **no debe poder tumbar
-- la operación que lo dispara**. Aquí se arregla la causa; blindarlos para que
-- ningún fallo de aviso propague queda anotado como pendiente.

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
  if new.status = 'reported' and old.status is distinct from 'reported' then
    v_rival := case when new.reported_by = new.player_a_id then new.player_b_id else new.player_a_id end;
    select display_name into v_nombre from players where id = new.reported_by;
    perform queue_push(
      v_rival,
      'Te toca marcar el resultado',
      coalesce(v_nombre, 'Tu rival') || ' ya reportó. Marca tú también para que se cierre.',
      jsonb_build_object('screen', 'MatchDetail', 'matchId', new.id)
    );

  -- b) Un juez lo aprobó: los dos quieren saber cómo quedó su ELO.
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

  return null;
end;
$$;
