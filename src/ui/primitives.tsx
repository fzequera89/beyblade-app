import { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, { Polygon, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, radius, space, type, glow } from '../theme';

/* ─────────────── Superficies ─────────────── */

export function Card({
  children,
  style,
  active = false,
  onPress,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
  onPress?: () => void;
}) {
  const body = <View style={[styles.card, active && styles.cardActive, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <View style={styles.rule} />;
  return (
    <View style={styles.dividerRow}>
      <View style={styles.ruleFlex} />
      <Text style={styles.dividerLabel}>{label}</Text>
      <View style={styles.ruleFlex} />
    </View>
  );
}

/* ─────────────── Hexágono ───────────────
   La forma firmante de la identidad. Se usa para hitos: cuenta creada,
   torneo, rango. Nunca como contenedor genérico — pierde significado. */

export function Hex({
  size = 96,
  color = colors.blue,
  children,
  solid = false,
}: {
  size?: number;
  color?: string;
  children?: ReactNode;
  // Relleno opaco. Solo se usa cuando el hexágono tiene que TAPAR algo que
  // pasa por detrás (la línea de la barra de pestañas). En una tarjeta se ve
  // como un hexágono oscuro fuera de lugar, así que va apagado por defecto.
  solid?: boolean;
}) {
  const w = size;
  const h = size * 1.08;
  // Hexágono metido hacia adentro del viewBox para que quepa el halo sin cortarse.
  const pts = '50,8 88,29 88,71 50,92 12,71 12,29';
  const id = `hex-${color.replace('#', '')}`;

  // OJO: nada de glow() aquí. Esa sombra es un box-shadow y pinta la CAJA
  // rectangular del elemento, así que se ve un cuadro detrás del hexágono.
  // El halo tiene que ir dentro del SVG para seguir la forma.
  return (
    <View style={{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={w} height={h} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity="0.24" />
            <Stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </LinearGradient>
        </Defs>
        {/* Halo: trazo ancho y tenue por fuera del contorno. */}
        <Polygon points={pts} fill="none" stroke={color} strokeOpacity="0.16" strokeWidth="10" />
        <Polygon points={pts} fill="none" stroke={color} strokeOpacity="0.3" strokeWidth="5" />
        {solid && <Polygon points={pts} fill={colors.bg} />}
        <Polygon points={pts} fill={`url(#${id})`} stroke={color} strokeWidth="2.5" />
      </Svg>
      {children}
    </View>
  );
}

/* ─────────────── Etiquetas ─────────────── */

// `align` existe porque la píldora tiene que abrazar su texto, y para eso
// necesita un alignSelf propio. Si se deja fijo en flex-start, pisa el centrado
// del contenedor y la píldora se va al borde de la pantalla.
export function Pill({
  label,
  color = colors.blue,
  bg,
  align = 'flex-start',
}: {
  label: string;
  color?: string;
  bg?: string;
  align?: 'flex-start' | 'center' | 'flex-end';
}) {
  return (
    <View
      style={[
        styles.pill,
        { borderColor: color, backgroundColor: bg ?? 'transparent', alignSelf: align },
      ]}
    >
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={type.section}>{children}</Text>
      {right}
    </View>
  );
}

/* ─────────────── Pasos ───────────────
   El onboarding necesita que se vea cuánto falta; sin esto un formulario
   de cuatro pantallas se siente interminable. */

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={styles.stepper}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={s} style={styles.step}>
            <View style={styles.stepTop}>
              {i > 0 && <View style={[styles.stepLine, (done || active) && styles.stepLineOn]} />}
              <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
                {done ? <Text style={styles.dotCheck}>✓</Text> : <Text style={styles.dotNum}>{i + 1}</Text>}
              </View>
              {i < steps.length - 1 && <View style={[styles.stepLine, done && styles.stepLineOn]} />}
            </View>
            <Text style={[styles.stepLabel, active && styles.stepLabelOn]} numberOfLines={1}>
              {s}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ─────────────── Selección ─────────────── */

export function Checkbox({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      hitSlop={6}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked && <Text style={styles.boxCheck}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

// Tarjeta de opción con icono, título y explicación. La usa el onboarding para
// nivel de experiencia y nivel de competencia.
export function OptionCard({
  glyph,
  title,
  desc,
  selected,
  onPress,
  color = colors.blue,
}: {
  glyph: string;
  title: string;
  desc?: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.option, selected && { borderColor: color, backgroundColor: colors.surface }]}
    >
      <Text style={styles.optionGlyph}>{glyph}</Text>
      <Text style={[styles.optionTitle, selected && { color }]} numberOfLines={1}>
        {title}
      </Text>
      {desc ? (
        <Text style={styles.optionDesc} numberOfLines={3}>
          {desc}
        </Text>
      ) : null}
    </Pressable>
  );
}

/* ─────────────── Pestañas ───────────────
   Una pantalla con cuatro caras (resumen, jugadores, bracket, información) no
   cabe en una lista larga: obliga a recorrerla entera para llegar a lo de
   abajo. Las pestañas van pegadas debajo del encabezado, no flotando, para que
   se lea que pertenecen a ESTE torneo y no a la app entera. */

export function Tabs<T extends string>({
  tabs,
  current,
  onChange,
  color = colors.blue,
  variant = 'plain',
}: {
  tabs: { key: T; label: string; glyph?: string; badge?: number }[];
  current: T;
  onChange: (key: T) => void;
  color?: string;
  // 'boxed' es el filtro de una lista (vive dentro de un recuadro propio);
  // 'plain' son las caras de UNA cosa, pegadas a su contenido.
  variant?: 'plain' | 'boxed';
}) {
  const boxed = variant === 'boxed';
  return (
    <View style={boxed ? styles.tabsBoxed : styles.tabs}>
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[
              styles.tab,
              boxed && styles.tabBoxed,
              on && { borderBottomColor: color },
              boxed && on && { backgroundColor: colors.card },
            ]}
          >
            {t.glyph ? (
              <Text style={[styles.tabGlyph, on && { opacity: 1 }]}>{t.glyph}</Text>
            ) : null}
            <Text style={[styles.tabText, on && { color: colors.ink }]} numberOfLines={1}>
              {t.label}
            </Text>
            {t.badge ? (
              <View style={[styles.tabBadge, { backgroundColor: color }]}>
                <Text style={styles.tabBadgeText}>{t.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Barra de avance. Se usa para el cupo: un número solo no dice si urge. */
export function Meter({
  value,
  max,
  color = colors.blue,
  warnAt = 0.85,
}: {
  value: number;
  max: number;
  color?: string;
  warnAt?: number;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  const tint = ratio >= 1 ? colors.loss : ratio >= warnAt ? colors.streak : color;
  return (
    <View style={styles.meter}>
      <View style={[styles.meterFill, { width: `${Math.max(2, ratio * 100)}%`, backgroundColor: tint }]} />
    </View>
  );
}

// Chip corto para días, filtros y categorías.
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  cardActive: { borderColor: colors.blue, backgroundColor: colors.surface },

  rule: { height: 1, backgroundColor: colors.line },
  ruleFlex: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  dividerLabel: { ...type.soft, fontSize: 12, color: colors.inkDim },

  pill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  stepper: { flexDirection: 'row', alignItems: 'flex-start' },
  step: { flex: 1, alignItems: 'center' },
  stepTop: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', justifyContent: 'center' },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.line },
  stepLineOn: { backgroundColor: colors.blue },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { borderColor: colors.blue, backgroundColor: colors.blue },
  dotActive: { borderColor: colors.blue },
  dotNum: { color: colors.inkSoft, fontSize: 12, fontWeight: '800' },
  dotCheck: { color: '#fff', fontSize: 13, fontWeight: '800' },
  stepLabel: { fontSize: 10, color: colors.inkDim, marginTop: 6, fontWeight: '600' },
  stepLabelOn: { color: colors.blue },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.lineHi,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  boxCheck: { color: '#fff', fontSize: 13, fontWeight: '800' },

  option: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
  },
  optionGlyph: { fontSize: 20, marginBottom: 2 },
  optionTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  optionDesc: { fontSize: 11, color: colors.inkSoft, lineHeight: 15 },

  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.line },
  tabsBoxed: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  tabBoxed: { borderBottomWidth: 2, marginBottom: 0, paddingVertical: space.md },
  tabGlyph: { fontSize: 13, opacity: 0.75 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: space.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, color: colors.inkDim },
  tabBadge: { minWidth: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center' },
  tabBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },

  meter: { height: 5, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  meterFill: { height: 5, borderRadius: 3 },

  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  chipTextOn: { color: colors.ink },
});
