import { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, space, radius, type } from '../theme';
import { Meter } from './primitives';
import { countdown, fmtDateFull, parseWhen } from '../lib/when';

// Piezas compartidas entre el lobby de torneos y el detalle.
//
// Las dos pantallas enseñan la misma cabecera —portada, cuenta regresiva,
// cuándo, dónde y con qué formato— porque son el mismo torneo visto de lejos y
// de cerca. Tenerlas copiadas en dos archivos garantiza que la próxima vez se
// cambie una sola y se separen.

/**
 * El nombre en dos renglones: lo que va después del guión largo se pinta con el
 * color del torneo. "Copa Central — Septiembre" se lee como el evento y su
 * edición, que es como lo nombra la gente. Sin guión, se pinta de una pieza.
 */
export function TournamentName({
  name,
  color,
  size = 26,
}: {
  name: string;
  color: string;
  size?: number;
}) {
  const [head, tail] = splitName(name);
  return (
    <View>
      <Text style={[styles.name, { fontSize: size }]} numberOfLines={2}>
        {head}
      </Text>
      {tail ? (
        <Text style={[styles.name, { fontSize: size, color }]} numberOfLines={1}>
          {tail}
        </Text>
      ) : null}
    </View>
  );
}

export function splitName(name: string): [string, string | null] {
  const cut = name.split(/\s+[—–-]\s+/);
  if (cut.length >= 2) return [cut[0].toUpperCase(), cut.slice(1).join(' — ').toUpperCase()];
  return [name.toUpperCase(), null];
}

/** La cuenta regresiva en bloque: el número es el dato, no la frase. */
export function CountdownBox({
  startsAt,
  accent,
  compact = false,
}: {
  startsAt?: string | null;
  accent: string;
  compact?: boolean;
}) {
  const cd = countdown(startsAt);
  if (!cd) return null;

  const days = cd.label.startsWith('FALTAN') ? cd.label.replace(/\D/g, '') : null;
  const tint = cd.urgent ? colors.streak : accent;

  return (
    <View style={[styles.cdBox, compact && styles.cdBoxSmall, { borderColor: tint }]}>
      {days ? (
        <>
          <Text style={styles.cdTop}>FALTAN</Text>
          <Text style={[styles.cdNum, compact && { fontSize: 22 }, { color: tint }]}>{days}</Text>
          <Text style={styles.cdTop}>DÍAS</Text>
        </>
      ) : (
        <Text style={[styles.cdNow, { color: tint }]}>{cd.label}</Text>
      )}
    </View>
  );
}

/** Renglón de ficha: ícono, etiqueta arriba y dato abajo. */
export function InfoRow({
  glyph,
  label,
  value,
  accent,
}: {
  glyph: string;
  label?: string;
  value: string;
  accent: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoGlyph, { color: accent }]}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        {label ? <Text style={styles.infoLabel}>{label}</Text> : null}
        <Text style={styles.infoValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/** Tira de datos con divisores: inscritos, nivel, premio. */
export function StatStrip({ items }: { items: { glyph: string; label: string; value: string; tint?: string; node?: ReactNode }[] }) {
  return (
    <View style={styles.strip}>
      {items.map((it, i) => (
        <View key={it.label} style={styles.stripItem}>
          {i > 0 && <View style={styles.stripDiv} />}
          <Text style={styles.stripGlyph}>{it.glyph}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.stripLabel}>{it.label}</Text>
            <Text style={[styles.stripValue, it.tint ? { color: it.tint } : null]} numberOfLines={1}>
              {it.value}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Barra de cierre de inscripciones.
 *
 * Mide TIEMPO, no cupo: lo que se está acabando es la ventana para apuntarse.
 * El cupo ya se lee en "12 / 32" — repetirlo aquí como barra diría dos veces lo
 * mismo y dejaría sin señal a los torneos sin límite de lugares.
 */
export function ClosingBar({
  createdAt,
  closesAt,
  accent,
}: {
  createdAt?: string | null;
  closesAt?: string | null;
  accent: string;
}) {
  const close = parseWhen(closesAt);
  if (!close) return null;

  const open = parseWhen(createdAt) ?? new Date(close.getTime() - 30 * 86400000);
  const total = close.getTime() - open.getTime();
  const done = Date.now() - open.getTime();
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 100;

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.closeLabel}>
        CIERRE DE INSCRIPCIONES: {fmtDateFull(closesAt)}
      </Text>
      <View style={styles.closeRow}>
        <View style={{ flex: 1 }}>
          <Meter value={pct} max={100} color={accent} warnAt={0.9} />
        </View>
        <Text style={styles.closePct}>{pct}%</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { ...type.display, letterSpacing: -0.6, lineHeight: undefined },

  cdBox: {
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: 'rgba(4,6,12,0.72)',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    alignItems: 'center',
    minWidth: 74,
  },
  cdBoxSmall: { minWidth: 62, paddingHorizontal: space.sm },
  cdTop: { fontSize: 8, fontWeight: '800', letterSpacing: 1, color: colors.inkSoft },
  cdNum: { fontSize: 30, fontWeight: '800', letterSpacing: -1, lineHeight: 34 },
  cdNow: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  infoGlyph: { fontSize: 14, width: 20, textAlign: 'center' },
  infoLabel: { fontSize: 11, fontWeight: '700', color: colors.ink },
  infoValue: { fontSize: 12, color: colors.inkSoft, lineHeight: 17 },

  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: space.md,
  },
  stripItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.sm },
  stripDiv: { position: 'absolute', left: 0, width: 1, height: 26, backgroundColor: colors.line },
  stripGlyph: { fontSize: 14 },
  stripLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.7, color: colors.inkDim },
  stripValue: { fontSize: 12.5, fontWeight: '800', color: colors.ink },

  closeLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7, color: colors.inkDim },
  closeRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  closePct: { fontSize: 11, fontWeight: '800', color: colors.inkSoft, width: 34, textAlign: 'right' },
});
