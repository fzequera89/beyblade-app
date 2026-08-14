import { ReactNode } from 'react';
import { Text, Pressable, StyleSheet, ActivityIndicator, View } from 'react-native';
import { colors, radius, space, glow } from '../theme';

type Variant = 'primary' | 'ghost' | 'social' | 'danger';

export default function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  full = true,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  full?: boolean;
}) {
  const off = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.base,
        full && styles.full,
        variant === 'primary' && styles.primary,
        // El glow solo va en el botón primario y solo cuando está activo:
        // es la señal de "esto es lo que sigue".
        variant === 'primary' && !off && glow(colors.blue, 14),
        variant === 'ghost' && styles.ghost,
        variant === 'social' && styles.social,
        variant === 'danger' && styles.danger,
        off && styles.off,
        pressed && !off && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.inkSoft} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            style={[
              styles.label,
              variant === 'ghost' && { color: colors.inkSoft },
              variant === 'social' && { color: colors.ink },
              off && { color: colors.inkDim },
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  full: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  primary: { backgroundColor: colors.blue },
  ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  social: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, paddingVertical: 13 },
  danger: { backgroundColor: colors.lossSoft, borderWidth: 1, borderColor: colors.loss },
  off: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  pressed: { opacity: 0.82 },
  label: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
