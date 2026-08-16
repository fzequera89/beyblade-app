-- Inscribirse a un torneo te mete a su liga.
--
-- Se podía uno inscribir a un torneo **sin pertenecer a la liga** que lo
-- organiza, y eso no era un detalle administrativo: la pantalla de jueces saca
-- sus candidatos de los miembros de la liga, así que un inscrito que no era
-- miembro **no se podía nombrar juez** — apareció jugando el QA.
--
-- Y hay más consecuencias del mismo hueco: el escalafón, el ranking de la liga
-- y el interclubes se leen sobre `league_members`. Alguien inscrito pero no
-- miembro compite en un torneo cuyos resultados no lo cuentan en ningún lado.
--
-- **Se resuelve uniendo, no bloqueando.** Cualquiera puede unirse solo a una
-- liga desde la app (política de 0004, siempre como `member`), así que exigir
-- la membresía antes de inscribirse sería un paso extra que no protege nada:
-- el mismo jugador la conseguiría en dos toques. Si te inscribes a un torneo de
-- una liga, es que compites en esa liga.
--
-- Entra como `member`, nunca como `organizer`: ascender sigue siendo un acto
-- deliberado de quien ya organiza.

create or replace function register_for_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament tournaments%rowtype;
  v_player uuid;
  v_taken int;
begin
  -- for update: serializa a los que llegan al mismo tiempo.
  select * into v_tournament from tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'Torneo no encontrado';
  end if;

  select id into v_player from players where auth_user_id = auth.uid();
  if v_player is null then
    raise exception 'No autorizado';
  end if;

  if v_tournament.status <> 'pending' then
    raise exception 'Este torneo ya empezó';
  end if;

  if v_tournament.registration_closes_at is not null
     and now() > v_tournament.registration_closes_at then
    raise exception 'Las inscripciones ya cerraron';
  end if;

  if exists (
    select 1 from tournament_registrations
    where tournament_id = p_tournament_id and player_id = v_player
  ) then
    raise exception 'Ya estás inscrito en este torneo';
  end if;

  if v_tournament.capacity is not null then
    select count(*) into v_taken
    from tournament_registrations
    where tournament_id = p_tournament_id;

    if v_taken >= v_tournament.capacity then
      raise exception 'El torneo está lleno (% de %)', v_taken, v_tournament.capacity;
    end if;
  end if;

  -- Inscribirse a un torneo de una liga es competir en esa liga.
  insert into league_members (league_id, player_id, role)
  values (v_tournament.league_id, v_player, 'member')
  on conflict (league_id, player_id) do nothing;

  insert into tournament_registrations (tournament_id, player_id)
  values (p_tournament_id, v_player);
end;
$$;

revoke execute on function register_for_tournament(uuid) from public, anon;
grant execute on function register_for_tournament(uuid) to authenticated;

-- Los que ya se habían inscrito sin ser miembros: se regularizan de una vez, o
-- el hueco sigue vivo para todos los torneos que ya existen.
insert into league_members (league_id, player_id, role)
select distinct t.league_id, r.player_id, 'member'::member_role
from tournament_registrations r
join tournaments t on t.id = r.tournament_id
where not exists (
  select 1 from league_members lm
  where lm.league_id = t.league_id and lm.player_id = r.player_id
)
on conflict (league_id, player_id) do nothing;
