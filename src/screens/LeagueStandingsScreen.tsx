import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

type Row = {
  player_id: string;
  role: string;
  players: { display_name: string; elo_rating: number; matches_played: number } | null;
};

export default function LeagueStandingsScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const [rows, setRows] = useState<Row[]>([]);
  const [tournamentCount, setTournamentCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from('league_members')
        .select('player_id, role, players(display_name, elo_rating, matches_played)')
        .eq('league_id', leagueId),
      supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('league_id', leagueId),
    ]);
    setLoading(false);
    const sorted = ((data as any) ?? []).sort(
      (a: Row, b: Row) => (b.players?.elo_rating ?? 0) - (a.players?.elo_rating ?? 0)
    );
    setRows(sorted);
    setTournamentCount(count ?? 0);
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ranking de la liga</Text>
      <Text style={styles.meta}>
        {rows.length} miembro{rows.length === 1 ? '' : 's'} · {tournamentCount} torneo{tournamentCount === 1 ? '' : 's'}
      </Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.player_id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6 }}
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>#{index + 1}</Text>
            <Text style={styles.name}>{item.players?.display_name ?? '—'}</Text>
            <Text style={styles.elo}>{item.players?.elo_rating ?? 1000}</Text>
            <Text style={styles.matches}>{item.players?.matches_played ?? 0} PJ</Text>
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Sin miembros todavía.</Text> : null}
      />
      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Volver a la liga</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6, marginBottom: 16 },
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
