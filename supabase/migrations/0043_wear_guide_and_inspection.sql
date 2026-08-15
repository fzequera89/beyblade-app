-- Guía de verificación de desgaste e inspección del juez.
--
-- El reglamento trae una tabla de verificación con tres renglones —Bit, Ratchet
-- y Blade— y para cada uno: qué se revisa, qué estado es ilegal y qué prueba de
-- seguridad aplicar. Va junto a la regla de que el juez puede desarmar el Bey
-- antes del combate y que, una vez revisado y autorizado, ya no se cambian
-- piezas ni lanzadores.
--
-- Dos piezas:
--   1. `wear_checks` — la guía, EN TABLA y no en código, por la misma razón que
--      los badges, las penalizaciones y las categorías: el cliente corrige un
--      criterio de desgaste sin que nadie toque el repo ni genere un build. Y
--      estos criterios se corrigen: dependen de qué piezas saca Takara Tomy.
--   2. La inspección registrada sobre la deck card. "Revisado y autorizado" deja
--      de ser un acuerdo verbal y queda con nombre de juez y hora — que es
--      exactamente lo que hace falta cuando alguien reclama a media llave.

create table if not exists wear_checks (
  id uuid primary key default gen_random_uuid(),
  piece text not null,
  control_point text not null,
  illegal_state text not null,
  safety_test text,
  sort_order int not null default 0
);

alter table wear_checks enable row level security;

drop policy if exists "wear_checks_read" on wear_checks;
create policy "wear_checks_read" on wear_checks for select to authenticated using (true);

-- Sin política de escritura: la edita el cliente desde el panel de Supabase,
-- igual que el catálogo de penalizaciones.

insert into wear_checks (piece, control_point, illegal_state, safety_test, sort_order)
select * from (values
  ('Bit',
   'Engranaje que hace contacto con la Xtreme Line',
   'Dientes redondeados al punto de que el Beyblade patina en el riel sin ganar aceleración',
   'Si el eje del Bit tiene una fisura vertical, queda prohibido por riesgo de rotura y proyección de fragmentos',
   1),
  ('Ratchet',
   'Pestañas de cierre',
   'Pestañas blanqueadas por el estrés del plástico, o limadas intencionalmente para evitar el Burst',
   'Si al ensamblar el "click" es imperceptible o el giro queda excesivamente libre, el Ratchet está fatigado y debe reemplazarse',
   2),
  ('Blade',
   'Puntos de impacto y peso',
   'Pulidores que alteren el peso original del metal, grietas que atraviesen el grosor, o abolladuras con filos expuestos',
   'Si se sospecha modificación de peso, verificar con balanza gramera',
   3)
) as v(piece, control_point, illegal_state, safety_test, sort_order)
where not exists (select 1 from wear_checks);

-- ─────────────────────────────────────────────────────────────────────────────
-- La inspección, sobre la tarjeta de deck
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Vive en `deck_cards` y no en una tabla aparte porque es un hecho sobre ESA
-- tarjeta: quién la revisó y cuándo. Una tabla propia obligaría a un join para
-- responder la única pregunta que se hace en la mesa —"¿este deck ya pasó?"—.

alter table deck_cards add column if not exists inspected_by uuid references players(id);
alter table deck_cards add column if not exists inspected_at timestamptz;
alter table deck_cards add column if not exists inspection_passed boolean;
alter table deck_cards add column if not exists inspection_notes text;

-- Registrar la inspección. La hace quien puede arbitrar en ese torneo, que es
-- la misma función que decide quién aprueba resultados (0025): un cuerpo
-- arbitral se convoca para el evento, y revisar decks es parte de arbitrar.
--
-- Aprobar BLOQUEA la tarjeta, porque el reglamento dice que después de revisar y
-- autorizar ya no se cambian piezas. Rechazar NO la bloquea: el jugador tiene
-- que poder corregir el deck y volver a presentarlo.

create or replace function record_deck_inspection(
  p_tournament_id uuid,
  p_player_id uuid,
  p_passed boolean,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_judge uuid;
  v_deck uuid;
begin
  select id into v_judge from players where auth_user_id = auth.uid();
  if v_judge is null then
    raise exception 'No autorizado';
  end if;

  if v_judge = p_player_id then
    raise exception 'Nadie inspecciona su propio deck';
  end if;

  if not exists (
    select 1 from players where id = v_judge and is_admin = true
  ) and not exists (
    select 1 from judge_assignments ja
    join tournaments t on t.id = p_tournament_id
    where ja.player_id = v_judge
      and (ja.tournament_id = p_tournament_id or ja.league_id = t.league_id)
  ) and not exists (
    select 1 from league_members lm
    join tournaments t on t.id = p_tournament_id
    where lm.player_id = v_judge and lm.league_id = t.league_id and lm.role = 'organizer'
  ) and not exists (
    select 1 from players where id = v_judge and judge_role is not null
  ) then
    raise exception 'Solo un juez o la organización del torneo inspecciona decks';
  end if;

  select id into v_deck from deck_cards
  where tournament_id = p_tournament_id and player_id = p_player_id;

  if v_deck is null then
    raise exception 'Ese jugador todavía no registró su deck';
  end if;

  update deck_cards
  set inspected_by = v_judge,
      inspected_at = now(),
      inspection_passed = p_passed,
      inspection_notes = nullif(btrim(coalesce(p_notes, '')), ''),
      -- Aprobado = congelado. Rechazado se queda editable a propósito.
      locked_at = case when p_passed then coalesce(locked_at, now()) else locked_at end
  where id = v_deck;
end;
$$;

revoke execute on function record_deck_inspection(uuid, uuid, boolean, text) from public, anon;
grant execute on function record_deck_inspection(uuid, uuid, boolean, text) to authenticated;
