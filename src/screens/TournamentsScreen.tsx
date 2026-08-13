import { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

type Tournament = { id: string; name: string; status: string };

export default function TournamentsScreen({ route, navigation }: any) {
  const { leagueId, isOrganizer } = route.params;
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, status')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setTournaments(data ?? []);
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function create() {
    if (!name.trim()) return;
    const { error } = await supabase.from('tournaments').insert({ league_id: leagueId, name: name.trim() });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setName('');
    setShowNew(false);
    load();
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Torneos</Text>
      <FlatList
        data={tournaments}
        keyExtractor={(t) => t.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 8 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate('TournamentDetail', { tournamentId: item.id, leagueId, isOrganizer })}
          >
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardStatus}>{item.status}</Text>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Sin torneos todavía.</Text> : null}
      />
      {isOrganizer &&
        (showNew ? (
          <View style={styles.newRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Nombre del torneo"
              placeholderTextColor="#8a8a8a"
              value={name}
              onChangeText={setName}
            />
            <Pressable style={styles.button} onPress={create}>
              <Text style={styles.buttonText}>Crear</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.linkButton} onPress={() => setShowNew(true)}>
            <Text style={styles.link}>+ Nuevo torneo</Text>
          </Pressable>
        ))}
      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Volver a la liga</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardStatus: { color: '#6b6b64', fontSize: 12, textTransform: 'capitalize' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  newRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  linkButton: { marginTop: 12 },
  link: { color: '#2f5ad6', fontWeight: '600' },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
