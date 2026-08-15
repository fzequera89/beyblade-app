// Fechas y cuentas regresivas.
//
// Dos trampas que este proyecto ya pagó una vez:
//
//   1. Las fechas SIN hora ("2026-05-14") las lee `new Date()` como medianoche
//      UTC, y en México eso cae el día anterior. Se arman a mano en hora local.
//   2. "Faltan N días" NO es una resta de milisegundos dividida entre 86400000:
//      si hoy son las 23:00 y el torneo es mañana a las 10:00 faltan 11 horas,
//      pero para quien lo lee es MAÑANA. Se comparan días de calendario.
//
// Los nombres de mes van escritos y no salen de `toLocaleDateString`: Intl con
// locales completos no está garantizado en todos los motores donde corre la app,
// y una fecha que se lee "Sep 27" en un teléfono y "27 sept." en otro se nota.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function parseWhen(value?: string | null): Date | null {
  if (!value) return null;
  // Solo fecha, sin hora: se arma en local para que no retroceda un día.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "27 sep" · con año solo cuando no es este. */
export function fmtDate(value?: string | null): string | null {
  const d = parseWhen(value);
  if (!d) return null;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MESES[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
}

/** "27 SEP 2026" — la forma en que se anuncia un evento. */
export function fmtDateFull(value?: string | null): string | null {
  const d = parseWhen(value);
  if (!d) return null;
  return `${d.getDate()} ${MESES[d.getMonth()].toUpperCase()} ${d.getFullYear()}`;
}

export function fmtTime(value?: string | null): string | null {
  const d = parseWhen(value);
  if (!d) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "27 sep · 18:00". La hora se omite si la fecha venía sin hora. */
export function fmtDateTime(value?: string | null): string | null {
  const date = fmtDate(value);
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return date;
  return `${date} · ${fmtTime(value)}`;
}

/** Días de CALENDARIO que faltan. Negativo si ya pasó, 0 si es hoy. */
export function daysUntil(value?: string | null): number | null {
  const d = parseWhen(value);
  if (!d) return null;
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * La cuenta regresiva como se lee en la tarjeta: "FALTAN 12 DÍAS".
 * Devuelve null si no hay fecha o si ya pasó — un contador en negativo no
 * informa nada que la etiqueta de estado no diga mejor.
 */
export function countdown(value?: string | null): { label: string; urgent: boolean } | null {
  const days = daysUntil(value);
  if (days === null || days < 0) return null;
  if (days === 0) return { label: 'ES HOY', urgent: true };
  if (days === 1) return { label: 'ES MAÑANA', urgent: true };
  return { label: `FALTAN ${days} DÍAS`, urgent: days <= 3 };
}
