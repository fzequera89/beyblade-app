// Tipos de evento. Coinciden con el enum `event_type` de la migración 0001;
// agregar uno nuevo aquí obliga a un ALTER TYPE, que debe correr solo
// (mismo cuidado que la migración 0005).
export const EVENT_TYPES = [
  { code: 'tournament', label: 'Torneo' },
  { code: 'league_night', label: 'Noche de liga' },
  { code: 'free_play', label: 'Juego libre' },
  { code: 'practice_night', label: 'Práctica' },
  { code: 'meetup', label: 'Quedada' },
  { code: 'club_battle', label: 'Batalla de clubes' },
  { code: 'beginner_day', label: 'Día de novatos' },
] as const;

export type EventCode = (typeof EVENT_TYPES)[number]['code'];

export function eventLabel(code: string | null): string {
  return EVENT_TYPES.find((e) => e.code === code)?.label ?? 'Evento';
}

// Fecha y hora se capturan como texto (YYYY-MM-DD y HH:MM) a propósito:
// un date picker nativo exigiría @react-native-community/datetimepicker, que
// es un módulo nativo y obligaría a un dev client. Todo el proyecto viene
// evitando dependencias nativas nuevas (ver decisión 2 de PROGRESS.md).
export function buildStartsAt(date: string, time: string): string | null {
  const trimmedDate = date.trim();
  const trimmedTime = time.trim() || '00:00';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) return null;
  if (!/^\d{1,2}:\d{2}$/.test(trimmedTime)) return null;
  const parsed = new Date(`${trimmedDate}T${trimmedTime.padStart(5, '0')}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function formatWhen(iso: string | null): string {
  if (!iso) return 'Sin fecha';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
