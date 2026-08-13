import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

type MatchRow = {
  id: string;
  bracket_round: number;
  winner_id: string | null;
  player_a_id: string;
  player_b_id: string;
  player_a: { display_name: string } | null;
  player_b: { display_name: string } | null;
};

export default function BracketScreen({ route, navigation }: any) {
  const { tournamentId } = route.params;
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(
        'id, bracket_round, winner_id, player_a_id, player_b_id, player_a:players!matches_player_a_id_fkey(display_name), player_b:players!matches_player_b_id_fkey(display_name)'
      )
      .eq('tournament_id', tournamentId)
      .order('bracket_round', { ascending: true });
    setLoading(false);
    setMatches((data as any) ?? []);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rounds = Array.from(new Set(matches.map((m) => m.bracket_round))).sort((a, b) => a - b);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bracket</Text>
      <FlatList
        data={rounds}
        keyExtractor={(r) => String(r)}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 16 }}
        renderItem={({ item: round }) => (
          <View>
            <Text style={styles.roundTitle}>Ronda {round}</Text>
            <View style={{ gap: 8 }}>
              {matches
                .filter((m) => m.bracket_round === round)
                .map((m) => (
                  <View key={m.id} style={styles.matchCard}>
                    <Text style={[styles.playerName, m.winner_id === m.player_a_id ? styles.winner : undefined]}>
                      {m.player_a?.display_name ?? '—'}
                    </Text>
                    <Text style={styles.vs}>vs</Text>
                    <Text style={[styles.playerName, m.winner_id === m.player_b_id ? styles.winner : undefined]}>
                      {m.player_b?.display_name ?? '—'}
                    </Text>
                  </View>
                ))}
            </View>
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>El bracket aún no tiene enfrentamientos.</Text> : null}
      />
      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Volver</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  roundTitle: { fontSize: 14, fontWeight: '700', color: '#6b6b64', marginBottom: 8, textTransform: 'uppercase' },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
  },
  playerName: { fontSize: 14, fontWeight: '600', flex: 1 },
  winner: { color: '#2f5ad6' },
  vs: { color: '#6b6b64', fontSize: 12, marginHorizontal: 8 },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
