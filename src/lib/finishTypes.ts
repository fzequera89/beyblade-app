// Tipos de finish y su valor en puntos, según el reglamento de la
// Dark Masters League (Beyblade X).
//
// Los puntos también viven en la base (función `finish_points`, migración 0020)
// y ahí es donde manda: el marcador se calcula del lado del servidor para que
// nadie lo pueda alterar. Esta tabla es solo para mostrar y previsualizar.

export const FINISH_TYPES = [
  {
    code: 'spin',
    label: 'Spin',
    points: 1,
    description: 'El rival deja de girar primero',
  },
  {
    code: 'over',
    label: 'Over',
    points: 2,
    description: 'El rival sale a un bolsillo lateral',
  },
  {
    code: 'burst',
    label: 'Burst',
    points: 2,
    description: 'El rival se desarma por completo',
  },
  {
    code: 'xtreme',
    label: 'Xtreme',
    points: 3,
    description: 'El rival sale por la abertura central',
  },
  {
    // Solo válido en modalidad casual. En ranking el servidor lo rechaza.
    code: 'aerial',
    label: 'Aerial',
    points: 3,
    description: 'El rival sale por encima del estadio',
    casualOnly: true,
  },
] as const;

export type FinishCode = (typeof FINISH_TYPES)[number]['code'];
export type MatchMode = 'ranking' | 'casual';

// Resultados de ronda SIN contacto válido (reglamento, "Puntuación SIN contacto
// válido"). No son finishes: no hubo combate. Valen en las dos modalidades.
export const NO_CONTACT_OUTCOMES = [
  {
    code: 'launch_fail',
    label: 'Falla de lanzamiento',
    points: 1,
    // El rival salió o se detuvo sin tocarte por 2ª vez seguida (o su Bey se
    // auto-expulsó sin contacto siendo reincidente): +1 para ti.
    description: 'El rival falló el lanzamiento otra vez: +1 para ti',
    awardsWinner: true,
  },
  {
    code: 'void',
    label: 'Empate / lanzamiento nulo',
    points: 0,
    // Ambos se detienen o salen a la vez, o el 1er lanzamiento sin contacto.
    description: 'Nadie puntúa: la ronda se repite',
    awardsWinner: false,
  },
] as const;

export type OutcomeCode = FinishCode | (typeof NO_CONTACT_OUTCOMES)[number]['code'];

const ALL_OUTCOMES = [...FINISH_TYPES, ...NO_CONTACT_OUTCOMES];

// Un color por resultado, compartido entre el ranking y las estadísticas. Si cada
// pantalla eligiera el suyo, el mismo dato se leería distinto en cada lugar.
export const FINISH_COLORS: Record<string, string> = {
  spin: '#5BA8FF',
  over: '#35C46A',
  burst: '#F5A524',
  xtreme: '#9B6BFF',
  aerial: '#FF7AC8',
  launch_fail: '#8A97AC',
  void: '#556076',
};

export function finishesFor(mode: MatchMode) {
  return FINISH_TYPES.filter((f) => mode === 'casual' || !('casualOnly' in f && f.casualOnly));
}

export function finishLabel(code: string | null): string {
  return ALL_OUTCOMES.find((f) => f.code === code)?.label ?? '—';
}

export function finishPoints(code: string | null): number {
  return ALL_OUTCOMES.find((f) => f.code === code)?.points ?? 0;
}
