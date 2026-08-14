import { useState, ReactNode } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, TextInputProps } from 'react-native';
import { colors, radius, space, type } from '../theme';

// Campo de texto de la app.
//
// El `color` explícito del TextInput no es negociable: sin él, en Android con el
// sistema en tema oscuro el texto hereda un color claro y desaparece. Ya nos pasó
// una vez en los 12 campos de la versión anterior.

export function Field({
  label,
  icon,
  hint,
  error,
  counter,
  ...input
}: TextInputProps & {
  label?: string;
  icon?: ReactNode;
  hint?: string;
  error?: string;
  counter?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.block}>
      {(label || counter) && (
        <View style={styles.labelRow}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          {counter ? <Text style={styles.counter}>{counter}</Text> : null}
        </View>
      )}

      <View style={[styles.wrap, focused && styles.wrapFocus, !!error && styles.wrapError]}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <TextInput
          {...input}
          style={styles.input}
          placeholderTextColor={colors.inkDim}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
        />
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function PasswordField(props: TextInputProps & { label?: string; hint?: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const { label, hint, error, ...input } = props;

  return (
    <View style={styles.block}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.wrap, focused && styles.wrapFocus, !!error && styles.wrapError]}>
        <View style={styles.icon}>
          <Text style={styles.iconGlyph}>🔒</Text>
        </View>
        <TextInput
          {...input}
          style={styles.input}
          placeholderTextColor={colors.inkDim}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={10}
          style={styles.toggle}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        >
          <Text style={styles.toggleText}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
        </Pressable>
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 7 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...type.label },
  counter: { fontSize: 11, color: colors.inkDim, fontWeight: '600' },
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  wrapFocus: { borderColor: colors.blue, backgroundColor: colors.surface },
  wrapError: { borderColor: colors.loss },
  icon: { marginRight: space.sm },
  iconGlyph: { fontSize: 14, opacity: 0.7 },
  input: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    paddingVertical: 14,
  },
  toggle: { paddingLeft: space.sm, paddingVertical: 6 },
  toggleText: { color: colors.blue, fontWeight: '700', fontSize: 12 },
  hint: { fontSize: 12, color: colors.inkDim, lineHeight: 16 },
  error: { fontSize: 12, color: colors.loss, fontWeight: '600' },
});
