-- Beyblade League App — modelo de datos base (Fase 0)
-- Entidades: sección 6 de la propuesta de producto + campos de ELO (docs/elo-rules.md)
-- RLS se habilita en Fase 1 junto con el flujo de auth; aquí solo se cierra el esquema.

create extension if not exists "pgcrypto";

create type match_status as enum ('reported', 'confirmed', 'disputed');
create type presence_status as enum ('looking_to_play');
create type event_type as enum ('tournament', 'free_play', 'practice_night', 'league_night', 'meetup', 'club_battle', 'beginner_day');
create type ranking_scope as enum ('global', 'league', 'season', 'club');
create type member_role as enum ('member', 'organizer');

create table players (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  avatar_url text,
  city text,
  country text,
  birth_date date,
  main_beyblade text,
  play_style text,
  elo_rating numeric(8,2) not null default 1000,
  matches_played int not null default 0,
  created_at timestamptz not null default now()
);

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_player_id uuid references players(id),
  created_at timestamptz not null default now()
);

create table league_members (
  league_id uuid references leagues(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  role member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (league_id, player_id)
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table clubs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references leagues(id) on delete set null,
  name text not null,
  created_at timestamptz not null default now()
);

create table club_members (
  club_id uuid references clubs(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (club_id, player_id)
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  city text,
  country text,
  lat double precision,
  lng double precision,
  qr_code text unique,
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid references venues(id),
  league_id uuid references leagues(id),
  season_id uuid references seasons(id),
  type event_type not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_by uuid references players(id),
  created_at timestamptz not null default now()
);

create table event_rsvps (
  event_id uuid references events(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

create table tournaments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id),
  league_id uuid references leagues(id),
  season_id uuid references seasons(id),
  name text not null,
  format text,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table combos (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  name text not null,
  parts jsonb,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references tournaments(id),
  league_id uuid references leagues(id),
  player_a_id uuid references players(id) not null,
  player_b_id uuid references players(id) not null,
  combo_a_id uuid references combos(id),
  combo_b_id uuid references combos(id),
  score_a int not null default 0,
  score_b int not null default 0,
  winner_id uuid references players(id),
  status match_status not null default 'reported',
  elo_a_before numeric(8,2),
  elo_b_before numeric(8,2),
  elo_a_change numeric(8,2),
  elo_b_change numeric(8,2),
  reported_by uuid references players(id),
  confirmed_by uuid references players(id),
  reported_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table match_rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references matches(id) on delete cascade,
  round_number int not null,
  winner_id uuid references players(id),
  finish_type text,
  created_at timestamptz not null default now()
);

create table rivalries (
  id uuid primary key default gen_random_uuid(),
  player_a_id uuid references players(id) on delete cascade,
  player_b_id uuid references players(id) on delete cascade,
  wins_a int not null default 0,
  wins_b int not null default 0,
  last_match_id uuid references matches(id),
  updated_at timestamptz not null default now(),
  unique (player_a_id, player_b_id)
);

create table badges (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  icon_url text
);

create table player_badges (
  player_id uuid references players(id) on delete cascade,
  badge_id uuid references badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (player_id, badge_id)
);

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  venue_id uuid references venues(id),
  event_id uuid references events(id),
  checked_in_at timestamptz not null default now()
);

create table presence (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references players(id) on delete cascade,
  status presence_status not null default 'looking_to_play',
  venue_id uuid references venues(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  scope ranking_scope not null,
  scope_id uuid,
  player_id uuid references players(id) on delete cascade,
  rating numeric(8,2) not null,
  rank_position int,
  snapshot_at timestamptz not null default now()
);

create table follows (
  follower_id uuid references players(id) on delete cascade,
  followee_id uuid references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index on matches (player_a_id);
create index on matches (player_b_id);
create index on matches (tournament_id);
create index on check_ins (venue_id);
create index on presence (expires_at);
create index on ranking_snapshots (scope, scope_id, snapshot_at desc);
