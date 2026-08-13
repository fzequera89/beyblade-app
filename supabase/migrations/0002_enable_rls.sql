-- Habilita RLS en todas las tablas (sin políticas aún).
-- Efecto: bloquea todo acceso público por defecto; solo service_role puede saltarlo.
-- Las políticas reales se definen en Fase 1 junto con el flujo de auth.

alter table players enable row level security;
alter table leagues enable row level security;
alter table league_members enable row level security;
alter table seasons enable row level security;
alter table clubs enable row level security;
alter table club_members enable row level security;
alter table venues enable row level security;
alter table events enable row level security;
alter table event_rsvps enable row level security;
alter table tournaments enable row level security;
alter table combos enable row level security;
alter table matches enable row level security;
alter table match_rounds enable row level security;
alter table rivalries enable row level security;
alter table badges enable row level security;
alter table player_badges enable row level security;
alter table check_ins enable row level security;
alter table presence enable row level security;
alter table ranking_snapshots enable row level security;
alter table follows enable row level security;
