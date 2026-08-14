import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Polygon, Line, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { colors, space, type } from '../theme';

// Evolución del ELO. Usa react-native-svg, que ya era dependencia por los QR.

const HEIGHT = 150;
const PADDING = 10;

export default function EloChart({ points }: { points: number[] }) {
  const [width, setWidth] = useState(0);

  if (points.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Con dos batallas confirmadas aparece aquí la evolución de tu ELO.
        </Text>
      </View>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  // Un jugador con ELO plano daría rango 0 y una división entre cero.
  const range = max - min || 1;

  const innerWidth = Math.max(width - PADDING * 2, 1);
  const innerHeight = HEIGHT - PADDING * 2;

  const coords = points.map((value, i) => {
    const x = PADDING + (i / (points.length - 1)) * innerWidth;
    const y = PADDING + (1 - (value - min) / range) * innerHeight;
    return { x, y };
  });

  const line = coords.map((c) => `${c.x},${c.y}`).join(' ');
  // El área bajo la curva cierra contra la base para dar volumen a la línea.
  const area = `${PADDING},${HEIGHT - PADDING} ${line} ${width - PADDING},${HEIGHT - PADDING}`;

  const last = coords[coords.length - 1];
  const first = points[0];
  const current = points[points.length - 1];
  const delta = current - first;
  const up = delta >= 0;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 6 }}>
      <View style={styles.header}>
        <Text style={styles.current}>{Math.round(current).toLocaleString()}</Text>
        <Text style={[styles.delta, { color: up ? colors.win : colors.loss }]}>
          {up ? '▲' : '▼'} {Math.abs(Math.round(delta))} desde tu primera batalla
        </Text>
      </View>

      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          <Defs>
            <LinearGradient id="eloFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.blue} stopOpacity="0.32" />
              <Stop offset="100%" stopColor={colors.blue} stopOpacity="0" />
            </LinearGradient>
          </Defs>

          <Line
            x1={PADDING}
            y1={PADDING}
            x2={width - PADDING}
            y2={PADDING}
            stroke={colors.line}
            strokeWidth={1}
          />
          <Line
            x1={PADDING}
            y1={HEIGHT - PADDING}
            x2={width - PADDING}
            y2={HEIGHT - PADDING}
            stroke={colors.line}
            strokeWidth={1}
          />

          <Polygon points={area} fill="url(#eloFill)" />
          <Polyline points={line} fill="none" stroke={colors.blue} strokeWidth={2.5} />
          <Circle cx={last.x} cy={last.y} r={5} fill={colors.blue} />
          <Circle cx={last.x} cy={last.y} r={9} fill={colors.blue} fillOpacity={0.25} />
        </Svg>
      )}

      <View style={styles.scale}>
        <Text style={styles.scaleText}>mín {Math.round(min)}</Text>
        <Text style={styles.scaleText}>máx {Math.round(max)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  current: { fontSize: 26, fontWeight: '800', fontStyle: 'italic', color: colors.blue },
  delta: { fontSize: 11.5, fontWeight: '700' },
  scale: { flexDirection: 'row', justifyContent: 'space-between' },
  scaleText: { fontSize: 10, color: colors.inkDim },
  empty: { backgroundColor: colors.surface, borderRadius: 10, padding: space.lg },
  emptyText: { ...type.soft, fontSize: 12.5, textAlign: 'center' },
});
