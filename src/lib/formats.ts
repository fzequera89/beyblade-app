// Motor de emparejamiento.
//
// Funciones PURAS a propósito: no tocan la base ni la red. Emparejar es la
// parte donde un error se ve como "el torneo quedó mal armado" y ya no se puede
// deshacer sin borrar partidas jugadas, así que tiene que poder probarse sola,
// con casos de escritorio, sin sesión y sin datos.
//
// Quien las conecta con la base es formatsRepo.ts.

export type CombatMode = 'solo' | 'deck3' | 'deck5' | 'stock';
export type PhaseKind = 'round_robin' | 'blocks' | 'swiss' | 'single_elim' | 'double_elim';
export type SwissTiebreak = 'dml' | 'opponents';

export type PlayerRef = { id: string; display_name: string; elo_rating: number };

/** Un combate ya jugado, que es de donde sale todo lo demás. */
export type PlayedMatch = {
  player_a_id: string;
  player_b_id: string;
  winner_id: string | null;
  score_a: number;
  score_b: number;
  bracket_round: number;
  bracket_side?: 'winners' | 'losers' | 'final' | null;
  block_number?: number | null;
};

export type Pair = { a: string; b: string; block?: number; side?: 'winners' | 'losers' | 'final' };
export type Pairing = { pairs: Pair[]; bye: string | null; round: number };

export const COMBAT_MODES: { key: CombatMode; label: string; desc: string; deckSize: number }[] = [
  { key: 'solo', label: '1 vs 1', desc: 'Cada quien con una sola combinación.', deckSize: 1 },
  { key: 'deck3', label: '3 vs 3 (deck de 3)', desc: 'Tres beyblades sin repetir ninguna pieza entre ellos.', deckSize: 3 },
  { key: 'deck5', label: '5G (deck de 5)', desc: 'Cinco combinaciones distintas, sin repetir piezas.', deckSize: 5 },
  { key: 'stock', label: 'Stock combo (de caja)', desc: 'Solo beyblades tal como vienen de fábrica.', deckSize: 1 },
];

export const PHASE_KINDS: { key: PhaseKind; label: string; desc: string }[] = [
  { key: 'round_robin', label: 'Todos contra todos', desc: 'Cada quien enfrenta a todos los demás. Es lo que pide el reglamento para el ranking.' },
  { key: 'blocks', label: 'Grupos', desc: 'Se parte en grupos y dentro de cada uno juegan todos contra todos.' },
  { key: 'swiss', label: 'Suizo', desc: 'Rondas fijas emparejando a quienes llevan el mismo puntaje. Nadie queda fuera.' },
  { key: 'single_elim', label: 'Eliminación directa', desc: 'Quien pierde queda fuera.' },
  { key: 'double_elim', label: 'Eliminación doble', desc: 'Hay segunda oportunidad: quien pierde cae a la llave de perdedores.' },
];

// ─────────────────────────── Baraja determinista ───────────────────────────
// Con semilla para que armar el mismo torneo dos veces dé el mismo resultado y
// se pueda revisar un reclamo. Math.random no se puede reproducir.

function rng(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
}

export function shuffle<T>(arr: T[], seed = 'dml'): T[] {
  const rand = rng(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─────────────────────────── Recomendación ───────────────────────────
// Los tramos son los de la WBO, que es el estándar que cita el reglamento.
// Es una SUGERENCIA: el organizador la cambia si quiere.

export function recommendStructure(playerCount: number): {
  phases: { kind: PhaseKind; rounds?: number; cut_size?: number; block_count?: number; points_to_win: number }[];
  why: string;
} {
  if (playerCount < 4) {
    return {
      phases: [{ kind: 'round_robin', points_to_win: 4 }],
      why: 'Con tan pocos jugadores, todos contra todos deja más combates que una llave.',
    };
  }
  if (playerCount <= 11) {
    return {
      phases: [
        { kind: 'round_robin', points_to_win: 4 },
        { kind: 'single_elim', cut_size: 4, points_to_win: 5 },
      ],
      why: 'De 8 a 11 jugadores la WBO recomienda todos contra todos y final entre los 4 mejores.',
    };
  }
  if (playerCount <= 16) {
    return {
      phases: [
        { kind: 'blocks', block_count: 2, points_to_win: 4 },
        { kind: 'single_elim', cut_size: 4, points_to_win: 5 },
      ],
      why: 'De 12 a 16 conviene partir en grupos: todos contra todos completo serían demasiados combates.',
    };
  }
  return {
    phases: [
      { kind: 'swiss', rounds: playerCount <= 32 ? 5 : 7, points_to_win: 4 },
      { kind: 'single_elim', cut_size: 8, points_to_win: 5 },
    ],
    why: 'De 17 en adelante la WBO recomienda suizo y top 8, porque nadie queda eliminado en la primera ronda.',
  };
}

/** Rondas de un suizo: las suficientes para que un solo invicto quede arriba. */
export function suggestedSwissRounds(playerCount: number): number {
  return Math.max(3, Math.ceil(Math.log2(Math.max(2, playerCount))));
}

// ─────────────────────────── Tabla de posiciones ───────────────────────────

export type Standing = {
  player_id: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  opponents: string[];
  /** Suma de victorias de los rivales que te tocaron: la "fuerza de rivales". */
  opponentWins: number;
};

export function buildStandings(playerIds: string[], matches: PlayedMatch[]): Standing[] {
  const base = new Map<string, Standing>();
  for (const id of playerIds) {
    base.set(id, {
      player_id: id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0,
      diff: 0, opponents: [], opponentWins: 0,
    });
  }

  for (const m of matches) {
    if (!m.winner_id) continue;
    const a = base.get(m.player_a_id);
    const b = base.get(m.player_b_id);
    if (!a || !b) continue;

    a.pointsFor += m.score_a; a.pointsAgainst += m.score_b;
    b.pointsFor += m.score_b; b.pointsAgainst += m.score_a;
    a.opponents.push(b.player_id);
    b.opponents.push(a.player_id);

    if (m.winner_id === a.player_id) { a.wins++; b.losses++; }
    else { b.wins++; a.losses++; }
  }

  for (const s of base.values()) {
    s.diff = s.pointsFor - s.pointsAgainst;
    // Se calcula al final porque necesita las victorias de TODOS ya contadas.
    s.opponentWins = s.opponents.reduce((sum, o) => sum + (base.get(o)?.wins ?? 0), 0);
  }

  return [...base.values()];
}

/**
 * Ordena la tabla. Victorias primero SIEMPRE — es lo que decidió el cliente
 * para el ranking local. Lo que cambia es el desempate:
 *   'dml'       → diferencia de puntos, luego enfrentamiento directo.
 *   'opponents' → fuerza de rivales; si perdiste contra el campeón vales más
 *                 que quien perdió contra el último.
 */
export function sortStandings(
  standings: Standing[],
  matches: PlayedMatch[],
  tiebreak: SwissTiebreak = 'dml'
): Standing[] {
  const headToHead = (x: string, y: string): number => {
    // El más reciente entre ambos manda, como dice el reglamento.
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const involved =
        (m.player_a_id === x && m.player_b_id === y) || (m.player_a_id === y && m.player_b_id === x);
      if (involved && m.winner_id) return m.winner_id === x ? -1 : 1;
    }
    return 0;
  };

  return [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;

    if (tiebreak === 'opponents') {
      if (b.opponentWins !== a.opponentWins) return b.opponentWins - a.opponentWins;
      if (b.diff !== a.diff) return b.diff - a.diff;
    } else {
      if (b.diff !== a.diff) return b.diff - a.diff;
      const h = headToHead(a.player_id, b.player_id);
      if (h !== 0) return h;
    }

    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.player_id.localeCompare(b.player_id);
  });
}

// ─────────────────────────── Todos contra todos ───────────────────────────
// Método del círculo: uno se queda fijo y los demás rotan. Genera TODAS las
// rondas de una vez, y cada quien enfrenta a cada quien exactamente una vez.

export function roundRobinRounds(playerIds: string[]): Pair[][] {
  const ids = [...playerIds];
  const odd = ids.length % 2 === 1;
  if (odd) ids.push('__BYE__');

  const n = ids.length;
  const rounds: Pair[][] = [];

  for (let r = 0; r < n - 1; r++) {
    const pairs: Pair[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i];
      const b = ids[n - 1 - i];
      if (a !== '__BYE__' && b !== '__BYE__') pairs.push({ a, b });
    }
    rounds.push(pairs);
    // Rota todos menos el primero.
    ids.splice(1, 0, ids.pop() as string);
  }

  return rounds;
}

/** Quién descansa en cada ronda, cuando el número es impar. */
export function roundRobinByes(playerIds: string[]): (string | null)[] {
  if (playerIds.length % 2 === 0) return roundRobinRounds(playerIds).map(() => null);
  const rounds = roundRobinRounds(playerIds);
  return rounds.map((pairs) => {
    const playing = new Set(pairs.flatMap((p) => [p.a, p.b]));
    return playerIds.find((id) => !playing.has(id)) ?? null;
  });
}

// ─────────────────────────── Grupos ───────────────────────────
// Reparto en serpiente por siembra: el 1 y el 2 caen en grupos distintos, para
// que los mejores no se eliminen entre sí antes de la final.

export function assignBlocks(seeded: string[], blockCount: number): string[][] {
  const blocks: string[][] = Array.from({ length: blockCount }, () => []);
  seeded.forEach((id, i) => {
    const row = Math.floor(i / blockCount);
    const col = i % blockCount;
    const target = row % 2 === 0 ? col : blockCount - 1 - col;
    blocks[target].push(id);
  });
  return blocks;
}

// ─────────────────────────── Suizo ───────────────────────────
// Se empareja dentro del mismo puntaje y NO se repiten rivales. Cuando no
// alcanza, se baja al siguiente del grupo hasta encontrar a alguien con quien
// no se haya jugado — es lo que hace un juez a mano, sin dejar a nadie fuera.

export function swissPairing(
  standings: Standing[],
  matches: PlayedMatch[],
  round: number,
  tiebreak: SwissTiebreak = 'dml'
): Pairing {
  const ordered = sortStandings(standings, matches, tiebreak);

  const played = new Set<string>();
  for (const m of matches) {
    played.add(`${m.player_a_id}|${m.player_b_id}`);
    played.add(`${m.player_b_id}|${m.player_a_id}`);
  }

  const pool = ordered.map((s) => s.player_id);
  let bye: string | null = null;

  // El bye se lo lleva el último que todavía no haya descansado: repetirlo
  // sería regalarle dos victorias gratis a la misma persona.
  if (pool.length % 2 === 1) {
    const byesSoFar = new Map<string, number>();
    for (const s of standings) byesSoFar.set(s.player_id, 0);
    const played_count = new Map<string, number>();
    for (const s of standings) played_count.set(s.player_id, s.opponents.length);
    const expected = round - 1;
    for (let i = pool.length - 1; i >= 0; i--) {
      if ((played_count.get(pool[i]) ?? 0) === expected) {
        bye = pool[i];
        pool.splice(i, 1);
        break;
      }
    }
    if (!bye) bye = pool.pop() ?? null;
  }

  const pairs: Pair[] = [];
  const remaining = [...pool];

  while (remaining.length > 1) {
    const a = remaining.shift() as string;
    let idx = remaining.findIndex((b) => !played.has(`${a}|${b}`));
    // Si ya jugó contra todos los que quedan, se acepta la revancha: es
    // preferible a dejarlo sin combate.
    if (idx === -1) idx = 0;
    const b = remaining.splice(idx, 1)[0];
    pairs.push({ a, b });
  }

  // Si quedó uno suelto por número impar imprevisto, descansa.
  if (remaining.length === 1 && !bye) bye = remaining[0];

  return { pairs, bye, round };
}

// ─────────────────────────── Eliminación simple ───────────────────────────
// Siembra estándar: 1 vs último, 2 vs penúltimo. Los byes se los llevan los
// mejores sembrados, que es como funciona una llave de verdad.

export function singleElimFirstRound(seeded: string[]): Pairing {
  const n = seeded.length;
  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(2, n))));
  const byeCount = size - n;

  const advancing = seeded.slice(0, byeCount);
  const playing = seeded.slice(byeCount);

  const pairs: Pair[] = [];
  for (let i = 0; i < playing.length / 2; i++) {
    pairs.push({ a: playing[i], b: playing[playing.length - 1 - i], side: 'winners' });
  }

  return {
    pairs,
    // Con más de un bye no cabe un solo "descansa": se devuelven todos abajo.
    bye: advancing.length === 1 ? advancing[0] : null,
    round: 1,
  };
}

export function singleElimByes(seeded: string[]): string[] {
  const n = seeded.length;
  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(2, n))));
  return seeded.slice(0, size - n);
}

// ─────────────────────────── Eliminación doble ───────────────────────────
//
// Dos llaves en paralelo. Quien pierde en la de ganadores NO queda fuera: cae a
// la de perdedores y sigue vivo hasta perder otra vez.
//
// El ritmo de la llave de perdedores alterna a propósito:
//   ronda de caída  → los que sobreviven abajo enfrentan a los que acaban de
//                     caer de arriba,
//   ronda de ajuste → los de abajo se enfrentan entre ellos para reducirse a la
//                     mitad antes de que caiga la siguiente tanda.
// Sin esa alternancia, la llave de perdedores crece más rápido de lo que se
// vacía y el torneo no termina nunca.

export type DoubleElimState = {
  /** Siguen sin perder ninguna. */
  wbAlive: string[];
  /** Perdieron una y siguen vivos. */
  lbAlive: string[];
  /** Acaban de caer de la llave de ganadores y aún no juegan abajo. */
  justDropped: string[];
  round: number;
};

export type DoubleElimRound = {
  pairs: Pair[];
  byes: { player: string; side: 'winners' | 'losers' }[];
  round: number;
  /** Si es el cruce final entre el campeón de arriba y el de abajo. */
  isGrandFinal: boolean;
  /** Cuando ya no hay nada que emparejar. */
  finished: boolean;
  championId: string | null;
};

function pairUp(list: string[], side: 'winners' | 'losers'): { pairs: Pair[]; bye: string | null } {
  const l = [...list];
  let bye: string | null = null;
  // El bye se lo lleva el primero de la lista, que viene sembrado por
  // desempeño: descansar es una ventaja y le toca a quien va mejor.
  if (l.length % 2 === 1) bye = l.shift() ?? null;
  const pairs: Pair[] = [];
  for (let i = 0; i < l.length; i += 2) pairs.push({ a: l[i], b: l[i + 1], side });
  return { pairs, bye };
}

export function nextDoubleElimRound(state: DoubleElimState): DoubleElimRound {
  const { wbAlive, lbAlive, justDropped, round } = state;
  const pairs: Pair[] = [];
  const byes: { player: string; side: 'winners' | 'losers' }[] = [];

  const lbPool = [...lbAlive, ...justDropped];

  // Terminó: queda uno arriba y nadie abajo.
  if (wbAlive.length === 1 && lbPool.length === 0) {
    return { pairs: [], byes: [], round, isGrandFinal: false, finished: true, championId: wbAlive[0] };
  }

  // Gran final: un campeón de cada llave.
  if (wbAlive.length === 1 && lbPool.length === 1) {
    return {
      pairs: [{ a: wbAlive[0], b: lbPool[0], side: 'final' }],
      byes: [], round, isGrandFinal: true, finished: false, championId: null,
    };
  }

  // Arriba
  if (wbAlive.length > 1) {
    const w = pairUp(wbAlive, 'winners');
    pairs.push(...w.pairs);
    if (w.bye) byes.push({ player: w.bye, side: 'winners' });
  } else if (wbAlive.length === 1) {
    // Ya hay finalista arriba y abajo todavía están decidiendo a su campeón.
    // Tiene que salir como descanso explícito: si esta ronda no lo menciona,
    // quien reconstruya el estado a partir de ella lo pierde y el finalista
    // desaparece del torneo.
    byes.push({ player: wbAlive[0], side: 'winners' });
  }

  // Abajo
  if (justDropped.length > 0 && lbAlive.length > 0) {
    // Ronda de caída: los de abajo contra los que acaban de bajar.
    const survivors = [...lbAlive];
    const dropped = [...justDropped];
    const n = Math.min(survivors.length, dropped.length);
    for (let i = 0; i < n; i++) pairs.push({ a: survivors[i], b: dropped[i], side: 'losers' });

    // Al que sobra le toca descansar abajo.
    const leftovers = [...survivors.slice(n), ...dropped.slice(n)];
    if (leftovers.length > 0) {
      const rest = pairUp(leftovers, 'losers');
      pairs.push(...rest.pairs);
      if (rest.bye) byes.push({ player: rest.bye, side: 'losers' });
    }
  } else if (lbPool.length > 1) {
    // Ronda de ajuste, o la primera de la llave de perdedores.
    const l = pairUp(lbPool, 'losers');
    pairs.push(...l.pairs);
    if (l.bye) byes.push({ player: l.bye, side: 'losers' });
  } else if (lbPool.length === 1 && wbAlive.length > 1) {
    byes.push({ player: lbPool[0], side: 'losers' });
  }

  return { pairs, byes, round, isGrandFinal: false, finished: false, championId: null };
}

/** Empareja a los que sobrevivieron, en el orden en que ganaron. */
export function nextElimRound(winners: string[], round: number): Pairing {
  const pairs: Pair[] = [];
  const list = [...winners];
  let bye: string | null = null;
  if (list.length % 2 === 1) bye = list.pop() ?? null;
  for (let i = 0; i < list.length; i += 2) {
    pairs.push({ a: list[i], b: list[i + 1], side: 'winners' });
  }
  return { pairs, bye, round };
}
