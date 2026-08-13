import { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

type PlayerRow = {
  id: string;
  display_name: string;
  city: string | null;
  elo_rating: number;
  auth_user_id: string | null;
  is_admin: boolean;
};

export default function AdminPlayersScreen({ navigation }: any) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [mainBeyblade, setMainBeyblade] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('players')
      .select('id, display_name, city, elo_rating, auth_user_id, is_admin')
      .order('display_name', { ascending: true });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setPlayers(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function registerPlayer() {
    if (!name.trim()) {
      Alert.alert('Falta el nombre');
      return;
    }
    const { error } = await supabase.from('players').insert({
      display_name: name.trim(),
      city: city.trim() || null,
      main_beyblade: mainBeyblade.trim() || null,
      auth_user_id: null,
    });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setName('');
    setCity('');
    setMainBeyblade('');
    setShowNew(false);
    load();
  }

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={players}
        keyExtractor={(p) => p.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.title}>Jugadores ({players.length})</Text>
            {showNew ? (
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre de jugador"
                  placeholderTextColor="#8a8a8a"
                  value={name}
                  onChangeText={setName}
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
                <Pressable style={styles.button} onPress={registerPlayer}>
                  <Text style={styles.buttonText}>Registrar jugador</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.button} onPress={() => setShowNew(true)}>
                <Text style={styles.buttonText}>+ Registrar jugador</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.display_name} {item.is_admin ? '👑' : ''}
              </Text>
              <Text style={styles.sub}>
                {item.city ?? 'Sin ciudad'} · {item.auth_user_id ? 'con cuenta' : 'registrado sin cuenta'}
              </Text>
            </View>
            <Text style={styles.elo}>{item.elo_rating}</Text>
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Sin jugadores todavía.</Text> : null}
        ListFooterComponent={
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Volver al panel</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  form: { gap: 8, marginTop: 8 },
  input: { color: '#1a1a20', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  name: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 11, color: '#6b6b64', marginTop: 2 },
  elo: { fontWeight: '700', color: '#2f5ad6' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
