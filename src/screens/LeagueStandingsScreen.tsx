import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Pill, Hex } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';

type Row = {
  player_id: string;
  role: 'member' | 'organizer';
  players: {
    display_name: string;
    elo_rating: number;
    matches_played: number;
    avatar_key: string | null;
    avatar_url: string | null;
  } | null;
};

function medal(pos: number) {
  if (pos === 1) return colors.streak;
  if (pos === 2) return '#C3CDDD';
  if (pos === 3) return '#C77B45';
  return colors.inkDim;
}

export default function LeagueStandingsScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const { playerId, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [leagueName, setLeagueName] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: league }] = await Promise.all([
      supabase
        .from('league_members')
        .select(
          'player_id, role, players(display_name, elo_rating, matches_played, avatar_key, avatar_url)'
        )
        .eq('league_id', leagueId),
      supabase.from('leagues').select('name').eq('id', leagueId).maybeSingle(),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    setLeagueName((league as any)?.name ?? '');
    setRows(
      ((data as any as Row[]) ?? []).sort(
        (a, b) => (b.players?.elo_rating ?? 0) - (a.players?.elo_rating ?? 0)
      )
    );
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggleModerator(target: string, current: 'member' | 'organizer') {
    const next = current === 'organizer' ? 'member' : 'organizer';
    const { error } = await supabase
      .from('league_members')
      .update({ role: next })
      .eq('league_id', leagueId)
      .eq('player_id', target);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  const myPos = rows.findIndex((r) => r.player_id === playerId) + 1;

  return (
    <Screen padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.player_id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Ranking de liga</Text>
            </View>
            <Text style={styles.sub}>
              {leagueName} · {rows.length} miembro{rows.length === 1 ? '' : 's'}
            </Text>

            {myPos > 0 && (
              <View style={styles.myBox}>
                <Text style={styles.myLabel}>TU POSICIÓN EN LA LIGA</Text>
                <Text style={styles.myPos}>#{myPos}</Text>
              </View>
            )}

            {isAdmin && <Text style={styles.hint}>Toca «Nombrar» para dar o quitar moderación.</Text>}
          </View>
        }
        renderItem={({ item, index }) => {
          const pos = index + 1;
          const me = item.player_id === playerId;
          const p = item.players;
          return (
            <Card
              style={[styles.row, me && { borderColor: colors.blue }]}
              onPress={() => navigation.navigate('PlayerProfile', { playerId: item.player_id })}
            >
              <Text style={[styles.pos, { color: medal(pos) }]}>{pos}</Text>
              <Avatar
                uri={p?.avatar_url}
                avatarKey={p?.avatar_key}
                size={40}
                ring={pos <= 3 ? medal(pos) : undefined}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {me ? 'Tú' : p?.display_name ?? '—'}
                </Text>
                <Text style={styles.meta}>{p?.matches_played ?? 0} batallas</Text>
              </View>
              {item.role === 'organizer' && <Pill label="Mod" color={colors.streak} />}
              <Text style={styles.elo}>{Math.round(p?.elo_rating ?? 1000)}</Text>
              {isAdmin && (
                <Pressable
                  style={styles.modBtn}
                  onPress={() => toggleModerator(item.player_id, item.role)}
                >
                  <Text style={styles.modText}>{item.role === 'organizer' ? 'Quitar' : 'Nombrar'}</Text>
                </Pressable>
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>📊</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Sin miembros todavía</Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  sub: { ...type.soft, fontSize: 12.5 },
  hint: { fontSize: 11, color: colors.inkDim },

  myBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    backgroundColor: colors.blueDeep,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  myLabel: { ...type.label, fontSize: 9, color: colors.blueHi },
  myPos: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: colors.ink },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pos: { width: 22, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  elo: { fontSize: 14.5, fontWeight: '800', color: colors.blue },
  modBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  modText: { fontSize: 10, color: colors.inkSoft, fontWeight: '700' },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
