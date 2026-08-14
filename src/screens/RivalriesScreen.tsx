import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Hex, Pill } from '../ui/primitives';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius } from '../theme';

type RivalryRow = {
  player_a_id: string;
  player_b_id: string;
  wins_a: number;
  wins_b: number;
  updated_at: string;
  player_a: { display_name: string; avatar_key: string | null; avatar_url: string | null; elo_rating: number } | null;
  player_b: { display_name: string; avatar_key: string | null; avatar_url: string | null; elo_rating: number } | null;
};

type Rival = {
  opponentId: string;
  name: string;
  elo: number;
  avatarKey: string | null;
  avatarUrl: string | null;
  myWins: number;
  theirWins: number;
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
    // La pareja se guarda normalizada (uuid menor primero, ver confirm_match_result),
    // así que hay que resolver de qué lado quedó el jugador para leer su récord.
    const { data, error } = await supabase
      .from('rivalries')
      .select(
        'player_a_id, player_b_id, wins_a, wins_b, updated_at, player_a:players!rivalries_player_a_id_fkey(display_name, avatar_key, avatar_url, elo_rating), player_b:players!rivalries_player_b_id_fkey(display_name, avatar_key, avatar_url, elo_rating)'
      )
      .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
      .order('updated_at', { ascending: false });
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);

    const mapped = ((data as any as RivalryRow[]) ?? []).map((r) => {
      const iAmA = r.player_a_id === playerId;
      const other = iAmA ? r.player_b : r.player_a;
      return {
        opponentId: iAmA ? r.player_b_id : r.player_a_id,
        name: other?.display_name ?? '—',
        elo: other?.elo_rating ?? 1000,
        avatarKey: other?.avatar_key ?? null,
        avatarUrl: other?.avatar_url ?? null,
        myWins: iAmA ? r.wins_a : r.wins_b,
        theirWins: iAmA ? r.wins_b : r.wins_a,
      };
    });
    // Se ordenan por número de encuentros: la rivalidad real es la que más veces
    // se ha jugado, no la más reciente.
    mapped.sort((a, b) => b.myWins + b.theirWins - (a.myWins + a.theirWins));
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

  function renderRival(r: Rival, hero: boolean) {
    const total = r.myWins + r.theirWins;
    const pct = total > 0 ? Math.round((r.myWins / total) * 100) : 0;
    const leading = r.myWins > r.theirWins;
    const tied = r.myWins === r.theirWins;
    const color = tied ? colors.inkSoft : leading ? colors.win : colors.loss;
    const open = expandedId === r.opponentId;

    return (
      <Card key={r.opponentId} style={[hero && { borderColor: color }]}>
        <Pressable onPress={() => toggle(r.opponentId)} style={styles.rivalTop}>
          <Avatar uri={r.avatarUrl} avatarKey={r.avatarKey} size={hero ? 60 : 44} ring={hero ? color : undefined} />
          <View style={{ flex: 1, gap: 3 }}>
            {hero && <Text style={styles.tag}>TU MAYOR RIVALIDAD</Text>}
            <Text style={[styles.name, hero && { fontSize: 17 }]} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={styles.meta}>
              {Math.round(r.elo)} ELO · {total} encuentro{total === 1 ? '' : 's'}
            </Text>
          </View>
          <View style={styles.recordBox}>
            <Text style={[styles.record, { color }]}>
              {r.myWins}–{r.theirWins}
            </Text>
            <Text style={styles.recordLabel}>{tied ? 'empatados' : leading ? 'vas arriba' : 'vas abajo'}</Text>
          </View>
        </Pressable>

        {/* Barra de dominio: se ve quién manda sin leer números */}
        <View style={styles.duel}>
          <View style={[styles.duelMine, { flex: Math.max(r.myWins, 0.001) }]} />
          <View style={[styles.duelTheirs, { flex: Math.max(r.theirWins, 0.001) }]} />
        </View>
        {hero && <Text style={styles.duelLabel}>Ganas el {pct}% de sus enfrentamientos</Text>}

        {open && (
          <View style={styles.history}>
            {history.length === 0 ? (
              <Text style={styles.meta}>Cargando…</Text>
            ) : (
              history.map((m) => {
                const iAmA = m.player_a_id === playerId;
                const mine = iAmA ? m.score_a : m.score_b;
                const theirs = iAmA ? m.score_b : m.score_a;
                const won = m.winner_id === playerId;
                return (
                  <Pressable
                    key={m.id}
                    style={styles.historyRow}
                    onPress={() => navigation.navigate('MatchDetail', { matchId: m.id })}
                  >
                    <Pill label={won ? 'V' : 'D'} color={won ? colors.win : colors.loss} />
                    <Text style={styles.historyScore}>
                      {mine}–{theirs}
                    </Text>
                    <Text style={styles.historyDate}>
                      {m.confirmed_at ? new Date(m.confirmed_at).toLocaleDateString() : '—'}
                    </Text>
                    <IconChevron size={14} />
                  </Pressable>
                );
              })
            )}
          </View>
        )}
      </Card>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={rivals}
        keyExtractor={(r) => r.opponentId}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Rivalidades</Text>
            </View>
            <Text style={styles.sub}>Tu récord contra cada jugador. Toca uno para ver el historial.</Text>
          </View>
        }
        renderItem={({ item, index }) => renderRival(item, index === 0)}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>⚔️</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Sin rivalidades todavía</Text>
              <Text style={styles.meta}>Se crean solas al confirmar tu primera batalla.</Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.sm, paddingTop: space.md, marginBottom: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  sub: { ...type.soft, fontSize: 12.5 },

  rivalTop: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  tag: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9, color: colors.blue },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft },
  recordBox: { alignItems: 'flex-end' },
  record: { fontSize: 19, fontWeight: '800' },
  recordLabel: { fontSize: 9.5, color: colors.inkDim },

  duel: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.line },
  duelMine: { backgroundColor: colors.win },
  duelTheirs: { backgroundColor: colors.loss },
  duelLabel: { fontSize: 11, color: colors.inkSoft, marginTop: 6 },

  history: {
    gap: space.sm,
    marginTop: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  historyScore: { flex: 1, fontSize: 13, color: colors.ink, fontWeight: '600' },
  historyDate: { fontSize: 11, color: colors.inkDim },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
