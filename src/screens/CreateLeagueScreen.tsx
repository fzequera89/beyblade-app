import { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

export default function CreateLeagueScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name.trim()) {
      Alert.alert('Falta el nombre de la liga');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('leagues')
      .insert({ name: name.trim(), description: description.trim() || null, owner_player_id: playerId })
      .select('id')
      .single();
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    navigation.replace('LeagueDetail', { leagueId: data.id });
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>Nueva liga</Text>
      <TextInput
        style={styles.input}
        placeholder="Nombre de la liga"
        placeholderTextColor="#8a8a8a"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Descripción (opcional)"
        placeholderTextColor="#8a8a8a"
        value={description}
        onChangeText={setDescription}
      />
      <Pressable style={styles.button} onPress={create} disabled={loading}>
        <Text style={styles.buttonText}>Crear liga</Text>
      </Pressable>
      <Pressable onPress={() => navigation.goBack()}>
        <Text style={styles.link}>Cancelar</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 16 },
  input: { color: '#1a1a20', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  link: { textAlign: 'center', color: '#6b6b64', marginTop: 8 },
});
