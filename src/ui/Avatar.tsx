import { View, Image, StyleSheet, Pressable, Text } from 'react-native';
import Svg, { Circle, Path, G, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors, radius, space, type } from '../theme';

// Avatares de la app.
//
// Se generan en SVG en vez de traer ilustraciones: pesan cero, escalan a
// cualquier tamaño y no hay que subir nada a Storage. Cada uno combina un color
// y un número de aspas distinto, así que se distinguen de un vistazo incluso
// pequeños en una lista de ranking.
//
// No son los personajes ilustrados de las propuestas: eso es trabajo de un
// ilustrador. Si más adelante hay set propio, se sustituye este catálogo sin
// tocar nada más — el resto de la app solo guarda la llave.

export const AVATARS = [
  { key: 'a1', color: '#2E7DFF', blades: 3 },
  { key: 'a2', color: '#9B6BFF', blades: 4 },
  { key: 'a3', color: '#35C46A', blades: 5 },
  { key: 'a4', color: '#F5A524', blades: 3 },
  { key: 'a5', color: '#F4525F', blades: 4 },
  { key: 'a6', color: '#4FD6C4', blades: 5 },
  { key: 'a7', color: '#FF7AC8', blades: 3 },
  { key: 'a8', color: '#C3CDDD', blades: 4 },
  { key: 'a9', color: '#E7B23C', blades: 6 },
  { key: 'a10', color: '#5BA8FF', blades: 6 },
  { key: 'a11', color: '#8CE05A', blades: 4 },
  { key: 'a12', color: '#FF9455', blades: 5 },
] as const;

export type AvatarKey = (typeof AVATARS)[number]['key'];

function spec(key?: string | null) {
  return AVATARS.find((a) => a.key === key) ?? AVATARS[0];
}

function Generated({ avatarKey, size }: { avatarKey?: string | null; size: number }) {
  const { color, blades } = spec(avatarKey);
  const step = 360 / blades;
  const id = `g-${avatarKey ?? 'a1'}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="35%" r="75%">
          <Stop offset="0%" stopColor={color} stopOpacity="0.55" />
          <Stop offset="100%" stopColor="#05070C" stopOpacity="1" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="50" fill={`url(#${id})`} />
      {Array.from({ length: blades }).map((_, i) => (
        <G key={i} transform={`rotate(${i * step} 50 50)`}>
          <Path d="M50 16 C 66 24, 74 38, 70 52 C 63 41, 58 33, 50 30 Z" fill={color} fillOpacity="0.85" />
        </G>
      ))}
      <Circle cx="50" cy="50" r="13" fill="#05070C" fillOpacity="0.7" />
      <Circle cx="50" cy="50" r="13" fill="none" stroke={color} strokeWidth="2" />
    </Svg>
  );
}

export default function Avatar({
  uri,
  avatarKey,
  size = 56,
  ring,
}: {
  uri?: string | null;
  avatarKey?: string | null;
  size?: number;
  ring?: string;
}) {
  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 2 },
        ring ? { borderWidth: 2, borderColor: ring } : null,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Generated avatarKey={avatarKey} size={size} />
      )}
    </View>
  );
}

export function AvatarPicker({
  value,
  photoUri,
  onSelect,
  onUpload,
  uploading = false,
}: {
  value: string | null;
  photoUri: string | null;
  onSelect: (key: string) => void;
  onUpload: () => void;
  uploading?: boolean;
}) {
  return (
    <View style={{ gap: space.md }}>
      <View style={styles.previewRow}>
        <Avatar uri={photoUri} avatarKey={value} size={92} ring={colors.blue} />
        <View style={{ flex: 1, gap: space.sm }}>
          <Text style={type.label}>Tu avatar</Text>
          <Text style={styles.help}>
            Elige uno de la app o sube tu foto. Lo puedes cambiar cuando quieras.
          </Text>
          <Pressable onPress={onUpload} style={styles.upload} disabled={uploading}>
            <Text style={styles.uploadText}>{uploading ? 'Subiendo…' : '📷  Subir foto'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.grid}>
        {AVATARS.map((a) => {
          const on = !photoUri && value === a.key;
          return (
            <Pressable
              key={a.key}
              onPress={() => onSelect(a.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.cell, on && { borderColor: a.color }]}
            >
              <Avatar avatarKey={a.key} size={44} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  help: { fontSize: 12, color: colors.inkSoft, lineHeight: 16 },
  upload: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 9,
  },
  uploadText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  cell: {
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
});
