import { View, Image, StyleSheet, Pressable, Text } from 'react-native';
import { colors, radius, space, type } from '../theme';

// Avatares de personaje. Son ilustraciones que produjo el cliente, recortadas
// de una rejilla y escaladas a 256px (~100 KB cada una, 1.2 MB en total).
//
// React Native exige que la ruta de `require` sea estática, así que el mapa es
// explícito: no se puede armar la ruta con una variable.
const IMAGES: Record<string, any> = {
  c1: require('../../assets/avatars/c1.png'),
  c2: require('../../assets/avatars/c2.png'),
  c3: require('../../assets/avatars/c3.png'),
  c4: require('../../assets/avatars/c4.png'),
  c5: require('../../assets/avatars/c5.png'),
  c6: require('../../assets/avatars/c6.png'),
  c7: require('../../assets/avatars/c7.png'),
  c8: require('../../assets/avatars/c8.png'),
  c9: require('../../assets/avatars/c9.png'),
  c10: require('../../assets/avatars/c10.png'),
  c11: require('../../assets/avatars/c11.png'),
  c12: require('../../assets/avatars/c12.png'),
};

// El color es el del aro que ya trae dibujado cada retrato. Se repite aquí para
// poder teñir el borde de selección y los anillos de rango sin leer la imagen.
export const AVATARS = [
  { key: 'c1', color: '#2E7DFF' },
  { key: 'c2', color: '#E23B3B' },
  { key: 'c3', color: '#F5C518' },
  { key: 'c4', color: '#9B6BFF' },
  { key: 'c5', color: '#35C46A' },
  { key: 'c6', color: '#2E7DFF' },
  { key: 'c7', color: '#FF8A3D' },
  { key: 'c8', color: '#FF6FB5' },
  { key: 'c9', color: '#C0303A' },
  { key: 'c10', color: '#4FD6C4' },
  { key: 'c11', color: '#C3CDDD' },
  { key: 'c12', color: '#8CE05A' },
] as const;

export type AvatarKey = (typeof AVATARS)[number]['key'];

// Los primeros jugadores guardaron llaves a1..a12 (los avatares geométricos que
// hubo antes). Se traducen para que no se queden sin retrato.
function normalizeKey(key?: string | null): string {
  if (!key) return 'c1';
  if (IMAGES[key]) return key;
  const legacy = key.match(/^a(\d{1,2})$/);
  if (legacy && IMAGES[`c${legacy[1]}`]) return `c${legacy[1]}`;
  return 'c1';
}

export function avatarColor(key?: string | null): string {
  const k = normalizeKey(key);
  return AVATARS.find((a) => a.key === k)?.color ?? colors.blue;
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
  const source = uri ? { uri } : IMAGES[normalizeKey(avatarKey)];

  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 2 },
        ring ? { borderWidth: 2, borderColor: ring } : null,
      ]}
    >
      <Image source={source} style={{ width: size, height: size }} resizeMode="cover" />
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
  const selected = normalizeKey(value);

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.previewRow}>
        <Avatar uri={photoUri} avatarKey={selected} size={92} ring={avatarColor(selected)} />
        <View style={{ flex: 1, gap: space.sm }}>
          <Text style={type.label}>Tu avatar</Text>
          <Text style={styles.help}>
            Elige un personaje o sube tu foto. Lo puedes cambiar cuando quieras.
          </Text>
          <Pressable onPress={onUpload} style={styles.upload} disabled={uploading}>
            <Text style={styles.uploadText}>{uploading ? 'Subiendo…' : '📷  Subir foto'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.grid}>
        {AVATARS.map((a) => {
          const on = !photoUri && selected === a.key;
          return (
            <Pressable
              key={a.key}
              onPress={() => onSelect(a.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[styles.cell, on && { borderColor: a.color }]}
            >
              <Avatar avatarKey={a.key} size={52} />
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
