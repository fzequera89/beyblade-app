// Ícono de cada logro. Va del lado del cliente a propósito: el catálogo en la
// base (migración 0015) guarda code/nombre/descripción, que es lo que el cliente
// puede querer editar, sin obligar a subir imágenes ni tocar Storage.
const BADGE_ICONS: Record<string, string> = {
  first_win: '🥇',
  matches_10: '🎯',
  matches_50: '🏛️',
  streak_3: '🔥',
  streak_5: '⚡',
  streak_10: '👑',
  elo_1100: '📈',
  elo_1200: '💎',
  elo_1300: '🌟',
  giant_slayer: '🗡️',
  flawless: '✨',
  xtreme: '💥',
  burst_master: '🧨',
  nemesis: '⚔️',
};

export function badgeIcon(code: string): string {
  return BADGE_ICONS[code] ?? '🏅';
}
