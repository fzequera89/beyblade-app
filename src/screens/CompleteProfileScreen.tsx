import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function CompleteProfileScreen() {
  const { session, refreshPlayer } = useAuth();
  const [displayName, setDisplayName] = useState(
    (session?.user.user_metadata?.full_name as string | undefined) ?? ''
  );
  const [city, setCity] = useState('');
  const [mainBeyblade, setMainBeyblade] = useState('');
  const [loading, setLoading] = useState(false);

  async function save() {
    if (!displayName.trim()) {
      Alert.alert('Falta tu nombre de jugador');
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('players').insert({
      auth_user_id: session!.user.id,
      display_name: displayName.trim(),
      city: city.trim() || null,
      main_beyblade: mainBeyblade.trim() || null,
    });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    await refreshPlayer();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Completa tu perfil</Text>
      <TextInput
        style={styles.input}
        placeholder="Nombre de jugador"
        placeholderTextColor="#8a8a8a"
        value={displayName}
        onChangeText={setDisplayName}
      />
      <TextInput
        style={styles.input}
        placeholder="Ciudad (opcional)"
        placeholderTextColor="#8a8a8a"
        value={city}
        onChangeText={setCity}
      />
      <TextInput
        style={styles.input}
        placeholder="Main Beyblade (opcional)"
        placeholderTextColor="#8a8a8a"
        value={mainBeyblade}
        onChangeText={setMainBeyblade}
      />
      <Pressable style={styles.button} onPress={save} disabled={loading}>
        <Text style={styles.buttonText}>Guardar y continuar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
});
