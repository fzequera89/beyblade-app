import { supabase } from './supabase';
import {
  PhaseKind,
  SwissTiebreak,
  PlayedMatch,
  Pair,
  buildStandings,
  sortStandings,
  roundRobinRounds,
  roundRobinByes,
  assignBlocks,
  swissPairing,
  singleElimFirstRound,
  singleElimByes,
  nextElimRound,
  nextDoubleElimRound,
  shuffle,
} from './formats';

// Conecta el motor de emparejamiento (formats.ts, funciones puras) con la base.
// Aquí vive todo lo que toca red; allá, nada. Esa separación es la que permite
// probar el emparejamiento sin sesión y sin datos.

export type Phase = {
  id: string;
  tournament_id: string;
  phase_number: number;
  kind: PhaseKind;
  rounds: number | null;
  cut_size: number | null;
  block_count: number | null;
  points_to_win: number;
  status: 'pending' | 'in_progress' | 'completed';
};

export type PhaseSpec = {
  kind: PhaseKind;
  rounds?: number | null;
  cut_size?: number | null;
  block_count?: number | null;
  points_to_win: number;
};

export type TournamentSpec = {
  leagueId: string;
  /** Temporada a la que pertenece: solo así sus combates alimentan el escalafón
   *  y el VP (apply_vp_for_match exige tournaments.season_id). Null = suelto. */
  seasonId?: string | null;
  name: string;
  mode: 'ranking' | 'casual';
  combat_mode: 'solo' | 'deck3' | 'deck5' | 'stock';
  deck_order: 'fixed' | 'blind';
  swiss_tiebreak: SwissTiebreak;
  photo_url?: string | null;
  starts_at?: string | null;
  venue_id?: string | null;
  /** null = sin límite: entra quien llegue. */
  capacity?: number | null;
  registration_closes_at?: string | null;
  level?: string | null;
  prize?: string | null;
  phases: PhaseSpec[];
};

export async function createTournament(spec: TournamentSpec): Promise<string> {
  const { data, error } = await supabase
    .from('tournaments')
    .insert({
      league_id: spec.leagueId,
      season_id: spec.seasonId ?? null,
      name: spec.name.trim(),
      mode: spec.mode,
      combat_mode: spec.combat_mode,
      deck_order: spec.deck_order,
      swiss_tiebreak: spec.swiss_tiebreak,
      photo_url: spec.photo_url ?? null,
      starts_at: spec.starts_at ?? null,
      venue_id: spec.venue_id ?? null,
      capacity: spec.capacity ?? null,
      registration_closes_at: spec.registration_closes_at ?? null,
      level: spec.level ?? null,
      prize: spec.prize ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;

  const tournamentId = (data as any).id as string;

  const rows = spec.phases.map((p, i) => ({
    tournament_id: tournamentId,
    phase_number: i + 1,
    kind: p.kind,
    rounds: p.rounds ?? null,
    cut_size: p.cut_size ?? null,
    block_count: p.block_count ?? null,
    points_to_win: p.points_to_win,
  }));

  const { error: phaseError } = await supabase.from('tournament_phases').insert(rows);
  if (phaseError) {
    // Un torneo sin fases no se puede jugar y no hay pantalla para arreglarlo:
    // mejor no dejarlo existir a medias.
    await supabase.from('tournaments').delete().eq('id', tournamentId);
    throw phaseError;
  }

  return tournamentId;
}

export async function loadPhases(tournamentId: string): Promise<Phase[]> {
  const { data, error } = await supabase
    .from('tournament_phases')
    .select('id, tournament_id, phase_number, kind, rounds, cut_size, block_count, points_to_win, status')
    .eq('tournament_id', tournamentId)
    .order('phase_number');
  if (error) throw error;
  return (data as any) ?? [];
}

async function phaseMatches(phaseId: string): Promise<PlayedMatch[]> {
  const { data, error } = await supabase
    .from('matches')
    .select('player_a_id, player_b_id, winner_id, score_a, score_b, bracket_round, bracket_side, block_number, status')
    .eq('phase_id', phaseId)
    .order('bracket_round');
  if (error) throw error;
  return ((data as any[]) ?? []).map((m) => ({
    player_a_id: m.player_a_id,
    player_b_id: m.player_b_id,
    // Solo cuenta lo confirmado: un resultado sin aprobar todavía puede cambiar.
    winner_id: m.status === 'confirmed' ? m.winner_id : null,
    score_a: m.score_a,
    score_b: m.score_b,
    bracket_round: m.bracket_round,
    bracket_side: m.bracket_side,
    block_number: m.block_number,
  }));
}

/**
 * Quiénes juegan esta fase.
 * La primera: los que hicieron check-in. Las siguientes: el corte de la anterior.
 */
export async function phaseParticipants(phase: Phase, phases: Phase[]): Promise<string[]> {
  if (phase.phase_number === 1) {
    const { data, error } = await supabase
      .from('tournament_registrations')
      .select('player_id, players(elo_rating)')
      .eq('tournament_id', phase.tournament_id)
      .not('checked_in_at', 'is', null);
    if (error) throw error;
    return ((data as any[]) ?? [])
      .sort((a, b) => (b.players?.elo_rating ?? 0) - (a.players?.elo_rating ?? 0))
      .map((r) => r.player_id);
  }

  const previous = phases.find((p) => p.phase_number === phase.phase_number - 1);
  if (!previous) return [];

  const prevPlayers = await phaseParticipants(previous, phases);
  const prevMatches = await phaseMatches(previous.id);

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('swiss_tiebreak')
    .eq('id', phase.tournament_id)
    .single();
  const tiebreak = ((tournament as any)?.swiss_tiebreak ?? 'dml') as SwissTiebreak;

  const ranked = sortStandings(buildStandings(prevPlayers, prevMatches), prevMatches, tiebreak);
  const cut = phase.cut_size ?? ranked.length;
  return ranked.slice(0, cut).map((s) => s.player_id);
}

export type GeneratedRound = {
  round: number;
  created: number;
  byes: string[];
  finished: boolean;
  championId: string | null;
  note?: string;
};

/** Arma la siguiente ronda de la fase y la guarda. */
export async function generatePhaseRound(
  phase: Phase,
  phases: Phase[],
  leagueId: string
): Promise<GeneratedRound> {
  const { data: tournament, error: tError } = await supabase
    .from('tournaments')
    .select('mode, swiss_tiebreak')
    .eq('id', phase.tournament_id)
    .single();
  if (tError) throw tError;
  const mode = ((tournament as any)?.mode ?? 'ranking') as 'ranking' | 'casual';
  const tiebreak = ((tournament as any)?.swiss_tiebreak ?? 'dml') as SwissTiebreak;

  const participants = await phaseParticipants(phase, phases);
  if (participants.length < 2) {
    throw new Error('Hacen falta al menos 2 jugadores en esta fase.');
  }

  // En casual el reglamento pide emparejar al azar entre los presentes, sin
  // mirar el ranking. La semilla es el id de la fase: reproducible.
  const seeded = mode === 'casual' ? shuffle(participants, phase.id) : participants;

  const played = await phaseMatches(phase.id);
  const roundsPlayed = played.length > 0 ? Math.max(...played.map((m) => m.bracket_round)) : 0;

  // No se arma la siguiente si la actual sigue abierta.
  const pendingNow = played.filter((m) => m.bracket_round === roundsPlayed && !m.winner_id);
  if (roundsPlayed > 0 && pendingNow.length > 0) {
    throw new Error(
      pendingNow.length === 1
        ? `Falta 1 resultado por aprobar en la ronda ${roundsPlayed}.`
        : `Faltan ${pendingNow.length} resultados por aprobar en la ronda ${roundsPlayed}.`
    );
  }

  const nextRound = roundsPlayed + 1;
  let pairs: Pair[] = [];
  let byes: string[] = [];
  let finished = false;
  let championId: string | null = null;
  let note: string | undefined;

  if (phase.kind === 'round_robin') {
    const all = roundRobinRounds(seeded);
    const allByes = roundRobinByes(seeded);
    if (nextRound > all.length) {
      finished = true;
    } else {
      pairs = all[nextRound - 1];
      const b = allByes[nextRound - 1];
      if (b) byes = [b];
      note = `Ronda ${nextRound} de ${all.length}`;
    }
  } else if (phase.kind === 'blocks') {
    const blockCount = phase.block_count ?? 2;
    const blocks = assignBlocks(seeded, blockCount);
    let maxRounds = 0;
    blocks.forEach((block, bi) => {
      const rounds = roundRobinRounds(block);
      const blockByes = roundRobinByes(block);
      maxRounds = Math.max(maxRounds, rounds.length);
      if (nextRound <= rounds.length) {
        pairs.push(...rounds[nextRound - 1].map((p) => ({ ...p, block: bi + 1 })));
        const b = blockByes[nextRound - 1];
        if (b) byes.push(b);
      }
    });
    if (pairs.length === 0) finished = true;
    else note = `Ronda ${nextRound} de ${maxRounds} · ${blockCount} grupos`;
  } else if (phase.kind === 'swiss') {
    const total = phase.rounds ?? 5;
    if (nextRound > total) {
      finished = true;
    } else {
      const standings = buildStandings(participants, played);
      const result = swissPairing(standings, played, nextRound, tiebreak);
      pairs = result.pairs;
      if (result.bye) byes = [result.bye];
      note = `Ronda ${nextRound} de ${total}`;
    }
  } else if (phase.kind === 'single_elim') {
    if (nextRound === 1) {
      const first = singleElimFirstRound(seeded);
      pairs = first.pairs;
      byes = singleElimByes(seeded);
    } else {
      const lastRound = played.filter((m) => m.bracket_round === roundsPlayed);
      const winners = lastRound.map((m) => m.winner_id as string).filter(Boolean);
      const previousByes = await loadByes(phase.id, roundsPlayed);
      const alive = [...winners, ...previousByes];
      if (alive.length <= 1) {
        finished = true;
        championId = alive[0] ?? null;
      } else {
        const next = nextElimRound(alive, nextRound);
        pairs = next.pairs;
        if (next.bye) byes = [next.bye];
      }
    }
  } else if (phase.kind === 'double_elim') {
    const state = reconstructDoubleElim(participants, played, nextRound);
    const result = nextDoubleElimRound(state);
    if (result.finished) {
      finished = true;
      championId = result.championId;
    } else {
      pairs = result.pairs;
      byes = result.byes.map((b) => b.player);
      if (result.isGrandFinal) note = 'Gran final';
    }
  }

  if (finished) {
    await supabase.from('tournament_phases').update({ status: 'completed' }).eq('id', phase.id);
    const isLast = phase.phase_number === Math.max(...phases.map((p) => p.phase_number));
    if (isLast) {
      await supabase.from('tournaments').update({ status: 'completed' }).eq('id', phase.tournament_id);
    }
    return { round: nextRound, created: 0, byes: [], finished: true, championId, note };
  }

  const rows = pairs.map((p) => ({
    tournament_id: phase.tournament_id,
    league_id: leagueId,
    phase_id: phase.id,
    player_a_id: p.a,
    player_b_id: p.b,
    bracket_round: nextRound,
    bracket_side: p.side ?? null,
    block_number: p.block ?? null,
    mode,
    points_to_win: phase.points_to_win,
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from('matches').insert(rows);
    if (error) throw error;
  }

  if (byes.length > 0) {
    const { error } = await supabase.from('bracket_byes').insert(
      byes.map((playerId) => ({
        tournament_id: phase.tournament_id,
        phase_id: phase.id,
        bracket_round: nextRound,
        player_id: playerId,
      }))
    );
    if (error) throw error;
  }

  await supabase.from('tournament_phases').update({ status: 'in_progress' }).eq('id', phase.id);
  await supabase.from('tournaments').update({ status: 'in_progress' }).eq('id', phase.tournament_id);

  return { round: nextRound, created: rows.length, byes, finished: false, championId: null, note };
}

async function loadByes(phaseId: string, round: number): Promise<string[]> {
  const { data } = await supabase
    .from('bracket_byes')
    .select('player_id')
    .eq('phase_id', phaseId)
    .eq('bracket_round', round);
  return ((data as any[]) ?? []).map((b) => b.player_id);
}

/**
 * El estado de una eliminación doble se deduce de las derrotas, no se guarda.
 * Un estado guardado se desincroniza en cuanto un juez corrige un resultado;
 * las derrotas siempre dicen la verdad.
 */
function reconstructDoubleElim(participants: string[], played: PlayedMatch[], nextRound: number) {
  const losses = new Map<string, number>(participants.map((p) => [p, 0]));
  for (const m of played) {
    if (!m.winner_id) continue;
    const loser = m.winner_id === m.player_a_id ? m.player_b_id : m.player_a_id;
    losses.set(loser, (losses.get(loser) ?? 0) + 1);
  }

  const lastRound = nextRound - 1;
  const justDropped = played
    .filter((m) => m.bracket_round === lastRound && m.bracket_side === 'winners' && m.winner_id)
    .map((m) => (m.winner_id === m.player_a_id ? m.player_b_id : m.player_a_id))
    .filter((p) => (losses.get(p) ?? 0) === 1);

  const dropped = new Set(justDropped);
  const wbAlive = participants.filter((p) => (losses.get(p) ?? 0) === 0);
  const lbAlive = participants.filter((p) => (losses.get(p) ?? 0) === 1 && !dropped.has(p));

  return { wbAlive, lbAlive, justDropped, round: nextRound };
}

/** Tabla de la fase, para mostrarla y para decidir el corte. */
export async function phaseStandings(phase: Phase, phases: Phase[]) {
  const participants = await phaseParticipants(phase, phases);
  const played = await phaseMatches(phase.id);
  const { data: tournament } = await supabase
    .from('tournaments')
    .select('swiss_tiebreak')
    .eq('id', phase.tournament_id)
    .single();
  const tiebreak = ((tournament as any)?.swiss_tiebreak ?? 'dml') as SwissTiebreak;
  return sortStandings(buildStandings(participants, played), played, tiebreak);
}
