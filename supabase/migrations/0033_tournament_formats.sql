-- Formatos de torneo armables.
--
-- Hasta hoy un torneo era siempre lo mismo: eliminación directa, todos a 4
-- puntos, cada quien con una peonza. El cliente pidió poder armar los formatos
-- que se usan de verdad, y al analizarlos resultó que NO son una lista: son
-- tres cosas independientes que se combinan.
--
--   1. MODALIDAD DE COMBATE — cuántas peonzas trae cada quien:
--      solo (1v1), deck3 (3G), deck5 (5G), stock (de caja).
--   2. ESTRUCTURA — cómo se emparejan: todos contra todos, por bloques,
--      suizo, eliminación simple, eliminación doble.
--   3. META DE PUNTOS POR ETAPA — 4 en clasificatoria, 5 en semis, 7 en final.
--
-- Modelarlo como lista de formatos serían decenas de casos especiales que se
-- multiplican cada vez que inventen uno. Modelarlo como fases con estructura
-- propia cubre los populares de hoy y los que salgan después.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. El torneo: modalidad, desempate y portada
-- ─────────────────────────────────────────────────────────────────────────────

alter table tournaments add column if not exists combat_mode text not null default 'solo';
alter table tournaments drop constraint if exists tournaments_combat_mode_check;
alter table tournaments add constraint tournaments_combat_mode_check
  check (combat_mode in ('solo', 'deck3', 'deck5', 'stock'));

-- Cómo se elige la peonza de cada round cuando hay deck. Son dos reglas
-- distintas y conviven en la escena: en 3-on-3 el orden se decide antes y se
-- respeta; en Deck Format cada quien elige en secreto y se revelan a la vez.
alter table tournaments add column if not exists deck_order text not null default 'fixed';
alter table tournaments drop constraint if exists tournaments_deck_order_check;
alter table tournaments add constraint tournaments_deck_order_check
  check (deck_order in ('fixed', 'blind'));

-- Desempate del suizo. El cliente pidió las dos:
--   'dml'       — diferencia de puntos → enfrentamiento directo → antigüedad,
--                 igual que el reglamento interno.
--   'opponents' — fuerza de rivales (Buchholz / OMW%): pesa contra quién te
--                 tocó jugar. Es lo que espera quien viene de torneos grandes.
alter table tournaments add column if not exists swiss_tiebreak text not null default 'dml';
alter table tournaments drop constraint if exists tournaments_swiss_tiebreak_check;
alter table tournaments add constraint tournaments_swiss_tiebreak_check
  check (swiss_tiebreak in ('dml', 'opponents'));

-- Portada: la app existe para llevar lo físico a lo digital, y un torneo sin
-- imagen se siente un formulario. Si nadie sube foto, la app dibuja una.
alter table tournaments add column if not exists photo_url text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fases
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists tournament_phases (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references tournaments(id) on delete cascade,
  phase_number int not null,
  kind text not null check (kind in ('round_robin', 'blocks', 'swiss', 'single_elim', 'double_elim')),

  -- Cuántas rondas se juegan. En todos contra todos y en eliminación sale del
  -- número de jugadores, así que puede ir nulo; en suizo lo fija el organizador.
  rounds int,

  -- Cuántos pasan A esta fase desde la anterior (top cut). Nulo en la primera.
  cut_size int,

  -- En cuántos grupos se parte (solo 'blocks').
  block_count int,

  -- La meta de puntos de esta etapa: 4 clasificatoria, 5 semis, 7 final.
  points_to_win int not null default 4,

  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),

  unique (tournament_id, phase_number)
);

create index if not exists tournament_phases_tournament_idx
  on tournament_phases (tournament_id, phase_number);

alter table tournament_phases enable row level security;

drop policy if exists "tournament_phases_read" on tournament_phases;
create policy "tournament_phases_read"
  on tournament_phases for select to authenticated using (true);

-- Las arma quien organiza la liga del torneo, igual que el bracket.
drop policy if exists "tournament_phases_write_organizer" on tournament_phases;
create policy "tournament_phases_write_organizer"
  on tournament_phases for all
  to authenticated
  using (
    tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      where lm.player_id in (select id from players where auth_user_id = auth.uid())
        and lm.role = 'organizer'
    )
    or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  )
  with check (
    tournament_id in (
      select t.id from tournaments t
      join league_members lm on lm.league_id = t.league_id
      where lm.player_id in (select id from players where auth_user_id = auth.uid())
        and lm.role = 'organizer'
    )
    or exists (select 1 from players where auth_user_id = auth.uid() and is_admin = true)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Cada combate sabe de qué fase es
-- ─────────────────────────────────────────────────────────────────────────────

alter table matches add column if not exists phase_id uuid references tournament_phases(id) on delete set null;

-- Grupo, cuando la fase es por bloques.
alter table matches add column if not exists block_number int;

-- Lado de la llave, para eliminación doble: quien pierde en 'winners' cae a
-- 'losers' y sigue vivo. 'final' es el cruce entre los dos campeones.
alter table matches add column if not exists bracket_side text;
alter table matches drop constraint if exists matches_bracket_side_check;
alter table matches add constraint matches_bracket_side_check
  check (bracket_side is null or bracket_side in ('winners', 'losers', 'final'));

create index if not exists matches_phase_idx on matches (phase_id, bracket_round);

-- Los byes también pertenecen a una fase.
alter table bracket_byes add column if not exists phase_id uuid references tournament_phases(id) on delete cascade;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Torneos viejos
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Los que ya existen no tienen fases. Se les crea una sola de eliminación
-- simple para que sigan viéndose y avanzando igual que antes: sin esto, un
-- torneo a medio jugar se quedaría sin estructura al desplegar.

insert into tournament_phases (tournament_id, phase_number, kind, points_to_win, status)
select t.id, 1, 'single_elim', 4,
       case t.status when 'completed' then 'completed'
                     when 'in_progress' then 'in_progress'
                     else 'pending' end
from tournaments t
where not exists (select 1 from tournament_phases p where p.tournament_id = t.id);

update matches m
set phase_id = p.id, bracket_side = 'winners'
from tournament_phases p
where p.tournament_id = m.tournament_id
  and p.phase_number = 1
  and m.phase_id is null
  and m.tournament_id is not null;
