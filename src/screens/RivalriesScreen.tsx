import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type RivalryRow = {
  player_a_id: string;
  player_b_id: string;
  wins_a: number;
  wins_b: number;
  updated_at: string;
  player_a: { display_name: string } | null;
  player_b: { display_name: string } | null;
};

type Rival = {
  opponentId: string;
  opponentName: string;
  myWins: number;
  theirWins: number;
  updatedAt: string;
};

type HistoryRow = {
  id: string;
  player_a_id: string;
  score_a: number;
  score_b: number;
  winner_id: string | null;
  confirmed_at: string | null;
};

export default function RivalriesScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [rivals, setRivals] = useState<Rival[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // La pareja se guarda normalizada (el uuid menor primero, ver confirm_match_result),
    // así que hay que resolver de qué lado quedó el jugador para leer su récord.
    const { data, error } = await supabase
      .from('rivalries')
      .select(
        'player_a_id, player_b_id, wins_a, wins_b, updated_at, player_a:players!rivalries_player_a_id_fkey(display_name), player_b:players!rivalries_player_b_id_fkey(display_name)'
      )
      .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
      .order('updated_at', { ascending: false });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    const mapped = ((data as any as RivalryRow[]) ?? []).map((r) => {
      const iAmA = r.player_a_id === playerId;
      return {
        opponentId: iAmA ? r.player_b_id : r.player_a_id,
        opponentName: (iAmA ? r.player_b?.display_name : r.player_a?.display_name) ?? '—',
        myWins: iAmA ? r.wins_a : r.wins_b,
        theirWins: iAmA ? r.wins_b : r.wins_a,
        updatedAt: r.updated_at,
      };
    });
    setRivals(mapped);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggle(opponentId: string) {
    if (expandedId === opponentId) {
      setExpandedId(null);
      setHistory([]);
      return;
    }
    setExpandedId(opponentId);
    setHistory([]);
    const { data } = await supabase
      .from('matches')
      .select('id, player_a_id, score_a, score_b, winner_id, confirmed_at')
      .eq('status', 'confirmed')
      .or(
        `and(player_a_id.eq.${playerId},player_b_id.eq.${opponentId}),and(player_a_id.eq.${opponentId},player_b_id.eq.${playerId})`
      )
      .order('confirmed_at', { ascending: false })
      .limit(10);
    setHistory((data as any) ?? []);
  }

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={rivals}
        keyExtractor={(r) => r.opponentId}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>Rivalidades</Text>
            <Text style={styles.meta}>Tu récord contra cada jugador. Toca uno para ver los últimos matches.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const total = item.myWins + item.theirWins;
          const leading = item.myWins > item.theirWins;
          const tied = item.myWins === item.theirWins;
          return (
            <View>
              <Pressable style={styles.row} onPress={() => toggle(item.opponentId)}>
                <Text style={styles.name}>{item.opponentName}</Text>
                <Text style={tied ? styles.tied : leading ? styles.win : styles.loss}>
                  {item.myWins}–{item.theirWins}
                </Text>
                <Text style={styles.total}>
                  {total} match{total === 1 ? '' : 'es'}
                </Text>
              </Pressable>

              {expandedId === item.opponentId && (
                <View style={styles.history}>
                  {history.length === 0 ? (
                    <Text style={styles.meta}>Cargando…</Text>
                  ) : (
                    history.map((m) => {
                      const iAmA = m.player_a_id === playerId;
                      const myScore = iAmA ? m.score_a : m.score_b;
                      const theirScore = iAmA ? m.score_b : m.score_a;
                      const iWon = m.winner_id === playerId;
                      return (
                        <Pressable
                          key={m.id}
                          style={styles.historyRow}
                          onPress={() => navigation.navigate('MatchDetail', { matchId: m.id })}
                        >
                          <Text style={iWon ? styles.win : styles.loss}>{iWon ? 'W' : 'L'}</Text>
                          <Text style={styles.historyScore}>
                            {myScore}–{theirScore}
                          </Text>
                          <Text style={styles.historyDate}>
                            {m.confirmed_at ? new Date(m.confirmed_at).toLocaleDateString() : '—'}
                          </Text>
                        </Pressable>
                      );
                    })
                  )}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              Todavía no tienes rivalidades. Se crean solas al confirmar tu primer match.
            </Text>
          ) : null
        }
        ListFooterComponent={
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Volver</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 12,
  },
  name: { flex: 1, fontSize: 14, fontWeight: '600' },
  win: { color: '#1f7a4d', fontWeight: '700' },
  loss: { color: '#b00020', fontWeight: '700' },
  tied: { color: '#6b6b64', fontWeight: '700' },
  total: { fontSize: 11, color: '#6b6b64', width: 70, textAlign: 'right' },
  history: { backgroundColor: '#f6f7fb', borderRadius: 8, padding: 10, gap: 6, marginTop: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  historyScore: { flex: 1, fontSize: 12 },
  historyDate: { fontSize: 11, color: '#6b6b64' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
