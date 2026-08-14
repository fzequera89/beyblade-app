import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { generateNextRound } from '../lib/bracket';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Hex, Pill } from '../ui/primitives';
import { colors, space, type } from '../theme';

type Player = { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;

type MatchRow = {
  id: string;
  bracket_round: number;
  status: 'pending' | 'reported' | 'confirmed' | 'disputed';
  winner_id: string | null;
  player_a_id: string;
  player_b_id: string;
  player_a: Player;
  player_b: Player;
};

type Bye = { bracket_round: number; players: { display_name: string } | null };

// El nombre de la ronda sale de cuántos enfrentamientos tiene: 1 es la final,
// 2 la semifinal, y así. Es lo que el jugador entiende, no "ronda 3".
function roundLabel(matchCount: number, round: number) {
  if (matchCount === 1) return 'FINAL';
  if (matchCount === 2) return 'SEMIFINAL';
  if (matchCount <= 4) return 'CUARTOS DE FINAL';
  if (matchCount <= 8) return 'OCTAVOS DE FINAL';
  return `RONDA ${round}`;
}

export default function BracketScreen({ route, navigation }: any) {
  const { tournamentId, leagueId, isOrganizer } = route.params;
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [byes, setByes] = useState<Bye[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: matchData }, { data: byeData }] = await Promise.all([
      supabase
        .from('matches')
        .select(
          'id, bracket_round, status, winner_id, player_a_id, player_b_id, player_a:players!matches_player_a_id_fkey(display_name, avatar_key, avatar_url), player_b:players!matches_player_b_id_fkey(display_name, avatar_key, avatar_url)'
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

  // Si la última ronda es una sola batalla ya confirmada, hay campeón.
  const finalMatch = lastRoundMatches.length === 1 ? lastRoundMatches[0] : null;
  const champion =
    finalMatch && finalMatch.status === 'confirmed'
      ? finalMatch.winner_id === finalMatch.player_a_id
        ? finalMatch.player_a
        : finalMatch.player_b
      : null;

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
    <Screen padded={false}>
      <FlatList
        data={rounds}
        keyExtractor={(r) => String(r)}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Bracket</Text>
            </View>

            {champion && (
              <Card style={styles.champ}>
                <Text style={styles.champTag}>CAMPEÓN DEL TORNEO</Text>
                <View style={styles.champRow}>
                  <Avatar
                    uri={champion.avatar_url}
                    avatarKey={champion.avatar_key}
                    size={64}
                    ring={colors.streak}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.champName} numberOfLines={1}>
                      {champion.display_name}
                    </Text>
                    <Text style={styles.meta}>Ganó la final</Text>
                  </View>
                  <Text style={{ fontSize: 30 }}>🏆</Text>
                </View>
              </Card>
            )}
          </View>
        }
        renderItem={({ item: round }) => {
          const roundMatches = matches.filter((m) => m.bracket_round === round);
          const roundByes = byes.filter((b) => b.bracket_round === round);
          return (
            <View style={styles.round}>
              <View style={styles.roundHead}>
                <View style={styles.roundLine} />
                <Text style={styles.roundTitle}>{roundLabel(roundMatches.length, round)}</Text>
                <View style={styles.roundLine} />
              </View>

              {roundMatches.map((m) => {
                const aWon = m.winner_id === m.player_a_id;
                const bWon = m.winner_id === m.player_b_id;
                const done = m.status === 'confirmed';
                return (
                  <Card
                    key={m.id}
                    style={[styles.match, !done && styles.matchLive]}
                    onPress={() => navigation.navigate('MatchDetail', { matchId: m.id })}
                  >
                    <Side player={m.player_a} won={aWon} dim={done && !aWon} />
                    <View style={styles.center}>
                      <Text style={styles.vs}>VS</Text>
                      {!done && (
                        <Pill
                          label={m.status === 'disputed' ? 'Disputa' : m.status === 'reported' ? 'Por confirmar' : 'En juego'}
                          color={m.status === 'disputed' ? colors.loss : colors.blue}
                          align="center"
                        />
                      )}
                    </View>
                    <Side player={m.player_b} won={bWon} dim={done && !bWon} right />
                  </Card>
                );
              })}

              {roundByes.map((b, i) => (
                <Card key={`bye-${round}-${i}`} style={styles.bye}>
                  <Hex size={34} color={colors.streak}>
                    <Text style={{ fontSize: 13 }}>➜</Text>
                  </Hex>
                  <Text style={styles.byeText}>
                    <Text style={styles.byeName}>{b.players?.display_name ?? '—'}</Text> pasa directo (bye)
                  </Text>
                </Card>
              ))}
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>🗺️</Text>
              </Hex>
              <Text style={styles.emptyTitle}>El bracket está vacío</Text>
              <Text style={styles.meta}>Se arma cuando el moderador cierra el check-in.</Text>
            </Card>
          ) : null
        }
        ListFooterComponent={
          isOrganizer && lastRoundDone ? (
            <View style={{ marginTop: space.lg }}>
              <Button label="AVANZAR RONDA" onPress={advance} disabled={busy} loading={busy} />
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

function Side({ player, won, dim, right }: { player: Player; won: boolean; dim: boolean; right?: boolean }) {
  return (
    <View style={[styles.side, right && { flexDirection: 'row-reverse' }]}>
      <Avatar
        uri={player?.avatar_url}
        avatarKey={player?.avatar_key}
        size={38}
        ring={won ? colors.win : undefined}
      />
      <Text
        style={[
          styles.sideName,
          right && { textAlign: 'right' },
          won && { color: colors.win },
          dim && { color: colors.inkDim },
        ]}
        numberOfLines={2}
      >
        {player?.display_name ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.lg },
  header: { gap: space.md, paddingTop: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },

  champ: { gap: space.md, borderColor: colors.streak },
  champTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: colors.streak },
  champRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  champName: { ...type.display, fontSize: 20 },

  round: { gap: space.sm },
  roundHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: 2 },
  roundLine: { flex: 1, height: 1, backgroundColor: colors.line },
  roundTitle: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4, color: colors.inkSoft },

  match: { flexDirection: 'row', alignItems: 'center' },
  matchLive: { borderColor: colors.lineHi },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sideName: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.ink },
  center: { alignItems: 'center', gap: 4, paddingHorizontal: space.sm },
  vs: { fontSize: 10, fontWeight: '800', fontStyle: 'italic', color: colors.inkDim, letterSpacing: 1 },

  bye: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  byeText: { flex: 1, fontSize: 12, color: colors.inkSoft },
  byeName: { color: colors.ink, fontWeight: '700' },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, textAlign: 'center' },
});
