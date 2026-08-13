import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

// Campo de contraseña con opción de mostrarla.
//
// El `color` explícito NO es opcional: sin él, en Android con el sistema en tema
// oscuro el TextInput hereda letra clara y queda invisible sobre el fondo blanco
// de la app. Es el mismo caso que el placeholder que ya se había arreglado antes.
//
// El botón dice "Mostrar" / "Ocultar" con palabras en vez de un ícono de ojo
// porque el proyecto no tiene librería de íconos y no vale la pena agregar una
// dependencia nativa por esto (ver decisión 2 de PROGRESS.md).
export default function PasswordInput({
  value,
  onChangeText,
  placeholder = 'Contraseña',
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#8a8a8a"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        value={value}
        onChangeText={onChangeText}
      />
      <Pressable
        style={styles.toggle}
        onPress={() => setVisible((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        hitSlop={8}
      >
        <Text style={styles.toggleText}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingRight: 4,
  },
  input: {
    flex: 1,
    color: '#1a1a20',
    padding: 12,
  },
  toggle: { paddingHorizontal: 10, paddingVertical: 10 },
  toggleText: { color: '#2f5ad6', fontWeight: '600', fontSize: 13 },
});
