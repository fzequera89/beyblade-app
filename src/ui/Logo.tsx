import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, RadialGradient, LinearGradient, Stop, G } from 'react-native-svg';
import { colors, type } from '../theme';

// El espiral es la marca del sistema: un beyblade visto desde arriba, girando.
// Se dibuja en SVG en vez de usar un PNG para que escale sin peso y para poder
// teñirlo según el contexto (activo, apagado, rango del jugador).

export function BeyMark({ size = 40, color = colors.blue }: { size?: number; color?: string }) {
  // Cuatro aspas que nacen del centro y se abren en espiral. El giro está en que
  // cada aspa arranca girada 90° respecto de la anterior.
  const blades = [0, 90, 180, 270];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="core" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <Stop offset="55%" stopColor={color} stopOpacity="0.9" />
          <Stop offset="100%" stopColor={color} stopOpacity="0.15" />
        </RadialGradient>
        <LinearGradient id="blade" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
          <Stop offset="100%" stopColor={color} stopOpacity="0.55" />
        </LinearGradient>
      </Defs>

      <Circle cx="50" cy="50" r="46" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="2.5" />

      {/* `transform="rotate(...)"` en vez de las props rotation/origin: esas dos
          no se comportan igual en react-native-svg web y la pantalla truena. */}
      {blades.map((deg) => (
        <G key={deg} transform={`rotate(${deg} 50 50)`}>
          <Path
            d="M50 12 C 72 20, 84 38, 80 56 C 72 44, 62 34, 50 30 Z"
            fill="url(#blade)"
          />
        </G>
      ))}

      <Circle cx="50" cy="50" r="16" fill="url(#core)" />
      <Circle cx="50" cy="50" r="6" fill="#FFFFFF" fillOpacity="0.9" />
    </Svg>
  );
}

export default function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const mark = size === 'lg' ? 62 : size === 'sm' ? 28 : 42;
  const word = size === 'lg' ? 30 : size === 'sm' ? 15 : 21;

  return (
    <View style={styles.row}>
      <BeyMark size={mark} />
      <View>
        <Text style={[styles.word, { fontSize: word }]}>BEYBLADE</Text>
        <Text style={[styles.sub, { fontSize: word * 0.46 }]}>L E A G U E</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  word: {
    ...type.display,
    color: colors.ink,
    lineHeight: undefined,
  },
  sub: {
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.blue,
    marginTop: -2,
  },
});
