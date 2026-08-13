import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Line, Circle } from 'react-native-svg';

// Gráfica de evolución del ELO (3.4). Usa react-native-svg, que ya era
// dependencia por los QR de check-in (2.2), así que no agrega nada nativo nuevo.

const HEIGHT = 160;
const PADDING = 8;

export default function EloChart({ points }: { points: number[] }) {
  const [width, setWidth] = useState(0);

  if (points.length < 2) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Con al menos dos matches confirmados aparece aquí la evolución de tu ELO.
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

  const last = coords[coords.length - 1];
  const first = points[0];
  const current = points[points.length - 1];
  const delta = current - first;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.header}>
        <Text style={styles.current}>{Math.round(current)}</Text>
        <Text style={delta >= 0 ? styles.up : styles.down}>
          {delta >= 0 ? '+' : ''}
          {Math.round(delta)} desde tu primer match
        </Text>
      </View>

      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          <Line x1={PADDING} y1={PADDING} x2={width - PADDING} y2={PADDING} stroke="#eee" strokeWidth={1} />
          <Line
            x1={PADDING}
            y1={HEIGHT - PADDING}
            x2={width - PADDING}
            y2={HEIGHT - PADDING}
            stroke="#eee"
            strokeWidth={1}
          />
          <Polyline
            points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
            fill="none"
            stroke="#2f5ad6"
            strokeWidth={2}
          />
          <Circle cx={last.x} cy={last.y} r={4} fill="#2f5ad6" />
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
  header: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  current: { fontSize: 24, fontWeight: '700', color: '#2f5ad6' },
  up: { fontSize: 12, color: '#1f7a4d', fontWeight: '600' },
  down: { fontSize: 12, color: '#b00020', fontWeight: '600' },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  scaleText: { fontSize: 10, color: '#6b6b64' },
  empty: { backgroundColor: '#f6f7fb', borderRadius: 8, padding: 16 },
  emptyText: { fontSize: 12, color: '#6b6b64', textAlign: 'center' },
});
