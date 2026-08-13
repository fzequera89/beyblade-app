import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { generateNextRound } from '../lib/bracket';

type MatchRow = {
  id: string;
  bracket_round: number;
  status: 'pending' | 'reported' | 'confirmed' | 'disputed';
  winner_id: string | null;
  player_a_id: string;
  player_b_id: string;
  player_a: { display_name: string } | null;
  player_b: { display_name: string } | null;
};

export default function BracketScreen({ route, navigation }: any) {
  const { tournamentId, leagueId, isOrganizer } = route.params;
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [byes, setByes] = useState<{ bracket_round: number; players: { display_name: string } | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: matchData }, { data: byeData }] = await Promise.all([
      supabase
        .from('matches')
        .select(
          'id, bracket_round, status, winner_id, player_a_id, player_b_id, player_a:players!matches_player_a_id_fkey(display_name), player_b:players!matches_player_b_id_fkey(display_name)'
        )
        .eq('tournament_id', tournamentId)
        .order('bracket_round', { ascending: true }),
      supabase
        .from('bracket_byes')
        .select('bracket_round, players(display_name)')
        .eq('tournament_id', tournamentId),
    ]);
    setLoading(false);
    setMatches((matchData as any) ?? []);
    setByes((byeData as any) ?? []);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rounds = Array.from(new Set(matches.map((m) => m.bracket_round))).sort((a, b) => a - b);
  const lastRound = rounds[rounds.length - 1];
  const lastRoundMatches = matches.filter((m) => m.bracket_round === lastRound);
  const lastRoundDone = lastRoundMatches.length > 0 && lastRoundMatches.every((m) => m.status === 'confirmed');

  async function advance() {
    setBusy(true);
    try {
      const result = await generateNextRound(tournamentId, leagueId, lastRound);
      if (result.completed) {
        Alert.alert('¡Torneo terminado!', 'Ya se definió el campeón.');
      } else {
        Alert.alert('Siguiente ronda generada', `${result.pairsCreated} enfrentamiento(s) nuevos.`);
      }
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo avanzar de ronda');
    } finally {
      setBusy(false);
    }
  }

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
                  <Pressable
                    key={m.id}
                    style={styles.matchCard}
                    onPress={() => navigation.navigate('MatchDetail', { matchId: m.id })}
                  >
                    <Text style={[styles.playerName, m.winner_id === m.player_a_id ? styles.winner : undefined]}>
                      {m.player_a?.display_name ?? '—'}
                    </Text>
                    <Text style={styles.vs}>vs</Text>
                    <Text style={[styles.playerName, m.winner_id === m.player_b_id ? styles.winner : undefined]}>
                      {m.player_b?.display_name ?? '—'}
                    </Text>
                  </Pressable>
                ))}
              {byes
                .filter((b) => b.bracket_round === round)
                .map((b, i) => (
                  <View key={`bye-${round}-${i}`} style={styles.byeCard}>
                    <Text style={styles.byeText}>🔸 {b.players?.display_name ?? '—'} pasa directo (bye)</Text>
                  </View>
                ))}
            </View>
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>El bracket aún no tiene enfrentamientos.</Text> : null}
      />

      {isOrganizer && lastRoundDone && (
        <Pressable style={styles.button} onPress={advance} disabled={busy}>
          <Text style={styles.buttonText}>Avanzar ronda</Text>
        </Pressable>
      )}

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
  byeCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, backgroundColor: '#fafafa' },
  byeText: { color: '#6b6b64', fontSize: 13 },
  playerName: { fontSize: 14, fontWeight: '600', flex: 1 },
  winner: { color: '#2f5ad6' },
  vs: { color: '#6b6b64', fontSize: 12, marginHorizontal: 8 },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
