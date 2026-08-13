import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type Row = {
  player_id: string;
  role: 'member' | 'organizer';
  players: { display_name: string; elo_rating: number; matches_played: number } | null;
};

export default function LeagueStandingsScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const { isAdmin } = useAuth();
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

  async function toggleModerator(playerId: string, currentRole: 'member' | 'organizer') {
    const nextRole = currentRole === 'organizer' ? 'member' : 'organizer';
    const { error } = await supabase
      .from('league_members')
      .update({ role: nextRole })
      .eq('league_id', leagueId)
      .eq('player_id', playerId);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(r) => r.player_id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>Ranking de la liga</Text>
            <Text style={styles.meta}>
              {rows.length} miembro{rows.length === 1 ? '' : 's'} · {tournamentCount} torneo
              {tournamentCount === 1 ? '' : 's'}
              {isAdmin ? ' · toca un jugador para nombrar/quitar moderador' : ''}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={styles.row}>
            <Text style={styles.rank}>#{index + 1}</Text>
            <Text style={styles.name}>{item.players?.display_name ?? '—'}</Text>
            {item.role === 'organizer' ? <Text style={styles.modBadge}>Moderador</Text> : null}
            <Text style={styles.elo}>{item.players?.elo_rating ?? 1000}</Text>
            <Text style={styles.matches}>{item.players?.matches_played ?? 0} PJ</Text>
            {isAdmin && (
              <Pressable style={styles.modButton} onPress={() => toggleModerator(item.player_id, item.role)}>
                <Text style={styles.modButtonText}>{item.role === 'organizer' ? 'Quitar' : 'Nombrar'}</Text>
              </Pressable>
            )}
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Sin miembros todavía.</Text> : null}
        ListFooterComponent={
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Volver a la liga</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6, marginBottom: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  rank: { width: 32, fontWeight: '700', color: '#6b6b64' },
  name: { flex: 1, fontSize: 14, fontWeight: '600' },
  modBadge: { fontSize: 10, color: '#2f5ad6', fontWeight: '700', borderWidth: 1, borderColor: '#2f5ad6', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  elo: { fontWeight: '700', color: '#2f5ad6' },
  matches: { fontSize: 11, color: '#6b6b64', width: 50, textAlign: 'right' },
  modButton: { backgroundColor: '#444', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  modButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
