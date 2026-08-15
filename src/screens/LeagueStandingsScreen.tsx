import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Pill, Hex } from '../ui/primitives';
import { coverAccent } from '../ui/Cover';
import { colors, space, type, radius } from '../theme';
import { PAGE_SIZE } from '../lib/paging';

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

const MEDAL: Record<number, string> = { 1: colors.streak, 2: '#C3CDDD', 3: '#C77B45' };

export default function LeagueStandingsScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const { playerId, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [leagueName, setLeagueName] = useState('');
  const [wins, setWins] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
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
    if (error) {
      setLoading(false);
      return Alert.alert('Error', error.message);
    }
    setLeagueName((league as any)?.name ?? '');

    // Se ordena en el cliente porque el ELO vive en `players`, no en la fila de
    // membresía: pedirle la página a la consulta daría los 12 primeros por
    // fecha de ingreso, no por rating. Se trae la liga completa y se corta aquí.
    const sorted = ((data as any as Row[]) ?? []).sort(
      (a, b) => (b.players?.elo_rating ?? 0) - (a.players?.elo_rating ?? 0)
    );
    setRows(sorted);

    // Las victorias solo se cuentan para el podio: para toda la liga serían
    // tantas consultas como miembros, y abajo no se muestran.
    const podium = sorted.slice(0, 3);
    const counts = await Promise.all(
      podium.map((r) =>
        supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'confirmed')
          .eq('winner_id', r.player_id)
      )
    );
    const map: Record<string, number> = {};
    podium.forEach((r, i) => (map[r.player_id] = counts[i].count ?? 0));
    setWins(map);
    setLoading(false);
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

  const accent = coverAccent(leagueId);
  const myPos = rows.findIndex((r) => r.player_id === playerId) + 1;

  // Mismo modelo que el ranking general: el 1º no compite por atención con el
  // 2º y el 3º, así que va en tarjeta propia y ellos comparten una fila.
  const podium = rows.slice(0, 3);
  // El podio no cuenta contra la página: son tres tarjetas de otro tamaño, no
  // renglones de la tabla.
  const restCompleto = rows.slice(3);
  const rest = restCompleto.slice(0, (page + 1) * PAGE_SIZE);
  const hayMas = restCompleto.length > rest.length;
  const [first, second, third] = podium;

  return (
    <Screen padded={false}>
      <FlatList
        data={rest}
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
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Ranking de liga</Text>
                <Text style={styles.sub}>
                  {leagueName} · {rows.length} miembro{rows.length === 1 ? '' : 's'}
                </Text>
              </View>
            </View>

            {myPos > 0 && (
              <View style={[styles.myBox, { borderColor: accent.neon, backgroundColor: colors.surface }]}>
                <Text style={[styles.myLabel, { color: accent.warm }]}>TU POSICIÓN EN LA LIGA</Text>
                <Text style={styles.myPos}>#{myPos}</Text>
              </View>
            )}

            {first && (
              <Pressable
                style={[styles.champion, { borderColor: MEDAL[1] }]}
                onPress={() => navigation.navigate('PlayerProfile', { playerId: first.player_id })}
              >
                <View style={styles.crownRow}>
                  <Text style={styles.crown}>👑</Text>
                  <Text style={styles.championLabel}>LÍDER DE LA LIGA</Text>
                </View>

                <View style={styles.championTop}>
                  <Avatar
                    uri={first.players?.avatar_url}
                    avatarKey={first.players?.avatar_key}
                    size={82}
                    ring={MEDAL[1]}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.championName} numberOfLines={1}>
                      {first.player_id === playerId ? 'Tú' : first.players?.display_name ?? '—'}
                    </Text>
                    {first.role === 'organizer' && <Pill label="Moderador" color={colors.streak} />}
                    <Text style={styles.championElo}>
                      {Math.round(first.players?.elo_rating ?? 1000).toLocaleString()}
                    </Text>
                    <Text style={styles.championEloLabel}>ELO</Text>
                  </View>
                </View>

                <View style={styles.championStats}>
                  <ChampStat label="Batallas" value={String(first.players?.matches_played ?? 0)} />
                  <View style={styles.vDiv} />
                  <ChampStat label="Ganadas" value={String(wins[first.player_id] ?? 0)} tint={MEDAL[1]} />
                  <View style={styles.vDiv} />
                  <ChampStat
                    label="Win rate"
                    value={
                      first.players?.matches_played
                        ? `${Math.round(((wins[first.player_id] ?? 0) / first.players.matches_played) * 100)}%`
                        : '—'
                    }
                  />
                </View>
              </Pressable>
            )}

            {(second || third) && (
              <View style={styles.runners}>
                {[second, third].map((r, i) =>
                  r ? (
                    <Pressable
                      key={r.player_id}
                      style={[styles.runner, { borderColor: MEDAL[i + 2] }]}
                      onPress={() => navigation.navigate('PlayerProfile', { playerId: r.player_id })}
                    >
                      <View style={styles.runnerTop}>
                        <Avatar
                          uri={r.players?.avatar_url}
                          avatarKey={r.players?.avatar_key}
                          size={48}
                          ring={MEDAL[i + 2]}
                        />
                        <View style={[styles.place, { borderColor: MEDAL[i + 2] }]}>
                          <Text style={[styles.placeText, { color: MEDAL[i + 2] }]}>{i + 2}</Text>
                        </View>
                      </View>
                      <Text style={styles.runnerName} numberOfLines={1}>
                        {r.player_id === playerId ? 'Tú' : r.players?.display_name ?? '—'}
                      </Text>
                      <Text style={[styles.runnerElo, { color: MEDAL[i + 2] }]}>
                        {Math.round(r.players?.elo_rating ?? 1000).toLocaleString()}
                      </Text>
                      <Text style={styles.runnerWins}>{wins[r.player_id] ?? 0} ganadas</Text>
                    </Pressable>
                  ) : (
                    <View key={i} style={{ flex: 1 }} />
                  )
                )}
              </View>
            )}

            {isAdmin && rows.length > 3 && (
              <Text style={styles.hint}>Toca «Nombrar» para dar o quitar moderación.</Text>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          // Arranca en el 4º: los tres primeros salieron al podio.
          const pos = index + 4;
          const me = item.player_id === playerId;
          const p = item.players;
          return (
            <Card
              style={[styles.row, me && { borderColor: accent.neon }]}
              onPress={() => navigation.navigate('PlayerProfile', { playerId: item.player_id })}
            >
              <Text style={styles.pos}>{pos}</Text>
              <Avatar uri={p?.avatar_url} avatarKey={p?.avatar_key} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {me ? 'Tú' : p?.display_name ?? '—'}
                </Text>
                <Text style={styles.meta}>{p?.matches_played ?? 0} batallas</Text>
              </View>
              {item.role === 'organizer' && <Pill label="Mod" color={colors.streak} />}
              <Text style={[styles.elo, { color: accent.warm }]}>
                {Math.round(p?.elo_rating ?? 1000)}
              </Text>
              {isAdmin && (
                <Pressable style={styles.modBtn} onPress={() => toggleModerator(item.player_id, item.role)}>
                  <Text style={styles.modText}>{item.role === 'organizer' ? 'Quitar' : 'Nombrar'}</Text>
                </Pressable>
              )}
            </Card>
          );
        }}
        ListFooterComponent={
          hayMas ? (
            <Pressable style={styles.masBtn} onPress={() => setPage((p) => p + 1)}>
              <Text style={styles.masText}>VER {PAGE_SIZE} MÁS</Text>
            </Pressable>
          ) : null
        }
        ListEmptyComponent={
          !loading && rows.length === 0 ? (
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

function ChampStat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.champStat}>
      <Text style={styles.champStatLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.champStatVal, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  masBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    marginTop: space.sm,
  },
  masText: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkSoft },
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
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  myLabel: { ...type.label, fontSize: 9 },
  myPos: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: colors.ink },

  champion: {
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: space.lg,
    gap: space.md,
  },
  crownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crown: { fontSize: 15 },
  championLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: colors.streak },
  championTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  championName: { ...type.display, fontSize: 21 },
  championElo: { fontSize: 26, fontWeight: '800', fontStyle: 'italic', color: colors.streak, marginTop: 2 },
  championEloLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.inkDim, marginTop: -4 },
  championStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  champStat: { flex: 1, alignItems: 'center', gap: 2 },
  champStatLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  champStatVal: { fontSize: 16, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 26, backgroundColor: colors.line },

  runners: { flexDirection: 'row', gap: space.sm },
  runner: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
  },
  runnerTop: { alignItems: 'center' },
  place: {
    position: 'absolute',
    top: -4,
    left: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: { fontSize: 11, fontWeight: '800' },
  runnerName: { fontSize: 13, fontWeight: '800', fontStyle: 'italic', color: colors.ink, marginTop: 5 },
  runnerElo: { fontSize: 14, fontWeight: '800' },
  runnerWins: { fontSize: 10.5, color: colors.inkSoft },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pos: { width: 22, fontSize: 13, fontWeight: '800', color: colors.inkDim, textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  elo: { fontSize: 14.5, fontWeight: '800' },
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
