import { useState } from 'react';
import { Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

export default function CreateVenueScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name.trim()) {
      Alert.alert('Falta el nombre del venue');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('venues')
      .insert({
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        qr_code: `venue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
      .select('id')
      .single();
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    navigation.replace('VenueDetail', { venueId: data.id });
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>Nuevo venue</Text>
      <TextInput
        style={styles.input}
        placeholder="Nombre (tienda, club, plaza...)"
        placeholderTextColor="#8a8a8a"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Dirección (opcional)"
        placeholderTextColor="#8a8a8a"
        value={address}
        onChangeText={setAddress}
      />
      <TextInput
        style={styles.input}
        placeholder="Ciudad (opcional)"
        placeholderTextColor="#8a8a8a"
        value={city}
        onChangeText={setCity}
      />
      <Pressable style={styles.button} onPress={create} disabled={loading}>
        <Text style={styles.buttonText}>Crear venue</Text>
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
