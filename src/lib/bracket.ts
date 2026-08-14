import { supabase } from './supabase';

type SeedPlayer = { id: string; display_name: string; elo_rating: number };
type Mode = 'ranking' | 'casual';

// Baraja Fisher-Yates: emparejamiento al azar de la modalidad casual.
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ranking: cada ronda se re-empareja por ELO actual (1 vs último, 2 vs penúltimo...).
//   Simplificación de MVP: es determinista y justo, pero no es seeding profesional.
// Casual (Arcade): el reglamento pide emparejar AL AZAR entre los presentes, sin
//   mirar el ranking — así que se baraja y se empareja consecutivo. El bye también
//   sale al azar, no se lo lleva siempre el de más ELO.
export function buildPairs(players: SeedPlayer[], mode: Mode = 'ranking') {
  const ordered =
    mode === 'casual'
      ? shuffle(players)
      : [...players].sort((a, b) => b.elo_rating - a.elo_rating);

  let bye: SeedPlayer | null = null;
  if (ordered.length % 2 === 1) {
    bye = ordered.shift() ?? null;
  }

  const pairs: [SeedPlayer, SeedPlayer][] = [];
  if (mode === 'casual') {
    // Ya barajado: emparejar consecutivos es aleatorio.
    for (let i = 0; i < ordered.length; i += 2) {
      pairs.push([ordered[i], ordered[i + 1]]);
    }
  } else {
    const half = ordered.length / 2;
    for (let i = 0; i < half; i++) {
      pairs.push([ordered[i], ordered[ordered.length - 1 - i]]);
    }
  }
  return { pairs, bye };
}

// La modalidad del torneo baja a cada combate: decide qué finishes valen (Aerial
// solo en casual) y si el combate mueve el ELO (casual no).
async function tournamentMode(tournamentId: string): Promise<Mode> {
  const { data, error } = await supabase
    .from('tournaments')
    .select('mode')
    .eq('id', tournamentId)
    .single();
  if (error) throw error;
  return (data as any)?.mode === 'casual' ? 'casual' : 'ranking';
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

  const mode = await tournamentMode(tournamentId);
  const { pairs, bye } = buildPairs(players, mode);

  const rows = pairs.map(([a, b]) => ({
    tournament_id: tournamentId,
    league_id: leagueId,
    player_a_id: a.id,
    player_b_id: b.id,
    bracket_round: 1,
    mode,
  }));

  const { error: insertError } = await supabase.from('matches').insert(rows);
  if (insertError) throw insertError;

  if (bye) {
    const { error: byeError } = await supabase
      .from('bracket_byes')
      .insert({ tournament_id: tournamentId, bracket_round: 1, player_id: bye.id });
    if (byeError) throw byeError;
  }

  await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', tournamentId);

  return { pairsCreated: pairs.length, bye };
}

export async function generateNextRound(tournamentId: string, leagueId: string, currentRound: number) {
  const { data: currentMatches, error: matchesError } = await supabase
    .from('matches')
    .select('winner_id, status')
    .eq('tournament_id', tournamentId)
    .eq('bracket_round', currentRound);
  if (matchesError) throw matchesError;

  if (!currentMatches || currentMatches.some((m) => m.status !== 'confirmed' || !m.winner_id)) {
    throw new Error('Todavía hay resultados sin confirmar en esta ronda.');
  }

  const { data: byes, error: byesError } = await supabase
    .from('bracket_byes')
    .select('player_id')
    .eq('tournament_id', tournamentId)
    .eq('bracket_round', currentRound);
  if (byesError) throw byesError;

  const advancingIds = [
    ...currentMatches.map((m) => m.winner_id as string),
    ...(byes ?? []).map((b) => b.player_id),
  ];

  if (advancingIds.length === 1) {
    await supabase.from('tournaments').update({ status: 'completed' }).eq('id', tournamentId);
    return { completed: true, championId: advancingIds[0], pairsCreated: 0, bye: null };
  }

  const { data: playerRows, error: playersError } = await supabase
    .from('players')
    .select('id, display_name, elo_rating')
    .in('id', advancingIds);
  if (playersError) throw playersError;

  const mode = await tournamentMode(tournamentId);
  const { pairs, bye } = buildPairs((playerRows ?? []) as SeedPlayer[], mode);
  const nextRound = currentRound + 1;

  const rows = pairs.map(([a, b]) => ({
    tournament_id: tournamentId,
    league_id: leagueId,
    player_a_id: a.id,
    player_b_id: b.id,
    bracket_round: nextRound,
    mode,
  }));

  const { error: insertError } = await supabase.from('matches').insert(rows);
  if (insertError) throw insertError;

  if (bye) {
    const { error: byeError } = await supabase
      .from('bracket_byes')
      .insert({ tournament_id: tournamentId, bracket_round: nextRound, player_id: bye.id });
    if (byeError) throw byeError;
  }

  return { completed: false, championId: null, pairsCreated: pairs.length, bye };
}
