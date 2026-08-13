import { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

export default function SignUpScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signUp() {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    if (!data.session) {
      Alert.alert('Revisa tu correo', 'Confirma tu cuenta para poder iniciar sesión.');
      navigation.navigate('SignIn');
    }
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>Crear cuenta</Text>
      <TextInput
        style={styles.input}
        placeholder="Correo"
        placeholderTextColor="#8a8a8a"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        placeholderTextColor="#8a8a8a"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={signUp} disabled={loading}>
        <Text style={styles.buttonText}>Registrarme</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate('SignIn')}>
        <Text style={styles.link}>Ya tengo cuenta</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { textAlign: 'center', color: '#2f5ad6', marginTop: 8 },
});
