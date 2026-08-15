import { View, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
  Rect,
  Ellipse,
  Line,
  Path,
  G,
} from 'react-native-svg';
import { colors } from '../theme';

// Portada de una locación.
//
// Si el lugar tiene foto, se usa la foto. Si no, NO se deja un hueco gris: se
// dibuja una arena con la estética de la app, distinta para cada locación pero
// SIEMPRE la misma para la misma locación — el dibujo se deriva del id, así que
// el lugar se reconoce de vista aunque nadie haya subido nunca una foto.
//
// Todo es SVG por la misma razón que los iconos: no pesa, no se pixelea y no
// mete una dependencia nativa nueva.

const PALETTES = [
  { sky: '#0B1E3F', deep: '#04060C', neon: '#2E7DFF', warm: '#5B9AFF' },
  { sky: '#2A1140', deep: '#07040E', neon: '#9B6BFF', warm: '#C79BFF' },
  { sky: '#0A2E2A', deep: '#030B0A', neon: '#35C46A', warm: '#7BE8A6' },
  { sky: '#3A1A12', deep: '#0C0503', neon: '#F5A524', warm: '#FFD07A' },
  { sky: '#3A0F1C', deep: '#0C0306', neon: '#F4525F', warm: '#FF98A1' },
];

// Hash estable: el mismo id da siempre el mismo dibujo, en el teléfono de
// cualquiera y después de cerrar la app.
//
// La mezcla final (finalizador de murmur3) no es adorno: con la suma simple,
// los ids que empiezan igual caían en la misma paleta y tres locaciones
// seguidas se veían del mismo color.
function seedOf(key: string) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * El color de identidad de una entidad: el mismo de su portada dibujada.
 * Así el acento de la pantalla y su portada hablan del mismo lugar, aunque
 * después suban una foto real — el color no cambia porque sale del id.
 */
export function coverAccent(id: string) {
  return PALETTES[seedOf(id || 'x') % PALETTES.length];
}

export default function Cover({
  id,
  photoUrl,
  height = 128,
  live = false,
  style,
}: {
  id: string;
  photoUrl?: string | null;
  height?: number;
  live?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const seed = seedOf(id || 'venue');
  const p = PALETTES[seed % PALETTES.length];
  const uid = `vc${seed % 100000}`;

  // Silueta del fondo: estantes, vitrinas, torres. Alturas derivadas del seed
  // para que dos locaciones no se vean iguales.
  const skyline: { x: number; w: number; h: number }[] = [];
  let x = -4;
  for (let i = 0; x < 324; i++) {
    const w = 18 + ((seed >> (i % 12)) % 22);
    const h = 14 + ((seed >> (i % 7)) % 34);
    skyline.push({ x, w, h });
    x += w + 4;
  }

  return (
    <View style={[styles.wrap, { height }, style]}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.photo} resizeMode="cover" />
      ) : (
        <Svg width="100%" height="100%" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id={`${uid}sky`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.sky} />
              <Stop offset="1" stopColor={p.deep} />
            </LinearGradient>
            <RadialGradient id={`${uid}glow`} cx="50%" cy="78%" r="60%">
              <Stop offset="0" stopColor={p.neon} stopOpacity="0.55" />
              <Stop offset="1" stopColor={p.neon} stopOpacity="0" />
            </RadialGradient>
            <LinearGradient id={`${uid}fade`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.bg} stopOpacity="0" />
              <Stop offset="0.55" stopColor={colors.bg} stopOpacity="0.35" />
              <Stop offset="1" stopColor={colors.bg} stopOpacity="0.92" />
            </LinearGradient>
          </Defs>

          <Rect x="0" y="0" width="320" height="180" fill={`url(#${uid}sky)`} />

          {/* Siluetas del local al fondo */}
          <G opacity="0.5">
            {skyline.map((s, i) => (
              <Rect
                key={i}
                x={s.x}
                y={118 - s.h}
                width={s.w}
                height={s.h}
                fill={p.deep}
                opacity={0.85}
              />
            ))}
          </G>

          {/* Luz sobre la arena */}
          <Rect x="0" y="0" width="320" height="180" fill={`url(#${uid}glow)`} />

          {/* Piso en perspectiva */}
          <G stroke={p.neon} strokeOpacity="0.22" strokeWidth="1">
            <Line x1="0" y1="118" x2="320" y2="118" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Line key={i} x1={-40 + i * 66} y1="180" x2={110 + i * 16} y2="118" />
            ))}
            <Line x1="0" y1="140" x2="320" y2="140" strokeOpacity="0.14" />
            <Line x1="0" y1="162" x2="320" y2="162" strokeOpacity="0.1" />
          </G>

          {/* Beystadium */}
          <Ellipse cx="160" cy="136" rx="86" ry="30" fill={p.deep} opacity="0.85" />
          <Ellipse
            cx="160"
            cy="134"
            rx="86"
            ry="30"
            fill="none"
            stroke={p.neon}
            strokeWidth="2"
            strokeOpacity="0.9"
          />
          <Ellipse
            cx="160"
            cy="134"
            rx="60"
            ry="20"
            fill="none"
            stroke={p.warm}
            strokeWidth="1.2"
            strokeOpacity="0.5"
          />
          <Ellipse cx="160" cy="134" rx="26" ry="9" fill="none" stroke={p.warm} strokeWidth="1" strokeOpacity="0.35" />

          {/* Dos beys girando: los trazos son la estela, no la pieza */}
          <G stroke={live ? colors.win : p.warm} strokeWidth="2.2" strokeLinecap="round" fill="none">
            <Path d="M126 130 a 16 6 0 1 0 22 -4" opacity="0.9" />
            <Path d="M196 138 a 14 5 0 1 0 -20 3" opacity="0.75" />
          </G>
          <Ellipse cx="137" cy="131" rx="5.5" ry="2.6" fill={live ? colors.win : p.neon} />
          <Ellipse cx="186" cy="139" rx="5" ry="2.4" fill={p.warm} opacity="0.9" />

          {/* Oscurecido inferior: el nombre va encima y tiene que leerse */}
          <Rect x="0" y="0" width="320" height="180" fill={`url(#${uid}fade)`} />
        </Svg>
      )}

      {/* Sobre una foto real hace falta el mismo oscurecido, que en ese caso no
          lo dibuja el SVG. */}
      {photoUrl ? <View style={styles.scrim} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'hidden', backgroundColor: colors.surface },
  photo: { width: '100%', height: '100%' },
  // Sin StyleSheet.absoluteFillObject: no existe en los tipos de RN 0.86 y
  // rompe el typecheck.
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,6,12,0.45)',
  },
});
