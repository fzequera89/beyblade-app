import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

type PlayerRow = {
  id: string;
  display_name: string;
  elo_rating: number;
  matches_played: number;
};

export default function AdminGlobalRankingScreen({ navigation }: any) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('players')
      .select('id, display_name, elo_rating, matches_played')
      .order('elo_rating', { ascending: false });
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

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={players}
        keyExtractor={(p) => p.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={<Text style={styles.title}>Ranking global</Text>}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>#{index + 1}</Text>
            <Text style={styles.name}>{item.display_name}</Text>
            <Text style={styles.elo}>{item.elo_rating}</Text>
            <Text style={styles.matches}>{item.matches_played} PJ</Text>
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
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  rank: { width: 32, fontWeight: '700', color: '#6b6b64' },
  name: { flex: 1, fontSize: 14, fontWeight: '600' },
  elo: { fontWeight: '700', color: '#2f5ad6' },
  matches: { fontSize: 11, color: '#6b6b64', width: 50, textAlign: 'right' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
