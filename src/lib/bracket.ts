import { supabase } from './supabase';

type SeedPlayer = { id: string; display_name: string; elo_rating: number };

export function buildRound1Pairs(players: SeedPlayer[]) {
  const sorted = [...players].sort((a, b) => b.elo_rating - a.elo_rating);
  let bye: SeedPlayer | null = null;
  if (sorted.length % 2 === 1) {
    // El seed más alto (mejor ELO) recibe el bye, como en seeding estándar de torneos.
    bye = sorted.shift() ?? null;
  }
  const pairs: [SeedPlayer, SeedPlayer][] = [];
  const half = sorted.length / 2;
  for (let i = 0; i < half; i++) {
    pairs.push([sorted[i], sorted[sorted.length - 1 - i]]);
  }
  return { pairs, bye };
}

export async function generateRound1Bracket(tournamentId: string, leagueId: string) {
  const { data: registrations, error: regError } = await supabase
    .from('tournament_registrations')
    .select('player_id, players(id, display_name, elo_rating)')
    .eq('tournament_id', tournamentId)
    .not('checked_in_at', 'is', null);

  if (regError) throw regError;

  const players = (registrations ?? [])
    .map((r: any) => r.players)
    .filter(Boolean) as SeedPlayer[];

  if (players.length < 2) {
    throw new Error('Se necesitan al menos 2 jugadores con check-in para generar el bracket.');
  }

  const { pairs, bye } = buildRound1Pairs(players);

  const rows = pairs.map(([a, b]) => ({
    tournament_id: tournamentId,
    league_id: leagueId,
    player_a_id: a.id,
    player_b_id: b.id,
    bracket_round: 1,
  }));

  const { error: insertError } = await supabase.from('matches').insert(rows);
  if (insertError) throw insertError;

  return { pairsCreated: pairs.length, bye };
}
