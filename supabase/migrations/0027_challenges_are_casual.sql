-- Los retos "Find a Battle" son casual: no mueven el ELO.
--
-- Decisión del cliente (2026-08-14): un reto amistoso 1-a-1 no debe subir ni
-- bajar el ranking. El mecanismo ya existe desde 0026 — un combate `mode='casual'`
-- se registra entero (marcador, rounds, estadísticas, `matches_played`, rivalidad,
-- logros) pero deja el rating de ELO quieto. Antes `accept_challenge` no ponía
-- modo, así que el match nacía 'ranking' por defecto y sí movía el ELO.
--
-- Efecto secundario buscado: al ser casual, el reto también admite Aerial Finish,
-- que es lo esperable en una batalla informal.
--
-- Es la misma función de 0013 con un solo cambio: el insert del match fija
-- `mode = 'casual'`.

create or replace function accept_challenge(p_challenge_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge challenges%rowtype;
  v_caller_player_id uuid;
  v_match_id uuid;
begin
  select * into v_challenge from challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Reto no encontrado';
  end if;
  if v_challenge.status <> 'pending' then
    raise exception 'Este reto ya no está pendiente';
  end if;

  select id into v_caller_player_id from players where auth_user_id = auth.uid();
  if v_caller_player_id is null or v_caller_player_id <> v_challenge.challenged_id then
    raise exception 'No autorizado para aceptar este reto';
  end if;

  -- Casual: no mueve el ELO (ver 0026) y admite Aerial.
  insert into matches (player_a_id, player_b_id, bracket_round, mode)
  values (v_challenge.challenger_id, v_challenge.challenged_id, null, 'casual')
  returning id into v_match_id;

  update challenges set status = 'accepted', match_id = v_match_id, responded_at = now()
  where id = p_challenge_id;

  return v_match_id;
end;
$$;

grant execute on function accept_challenge(uuid) to authenticated;
