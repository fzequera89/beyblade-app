import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import { badgeIcon } from '../lib/badges';

// League Passport (5.2): la trayectoria completa de un jugador en un solo
// lugar, consultable para cualquiera. Es la vista que da sentido al multi-liga:
// un mismo rating global, con la historia de por dónde pasó.

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  country: string | null;
  main_beyblade: string | null;
  elo_rating: number;
  matches_played: number;
  created_at: string;
};

type LeagueEntry = { id: string; name: string; role: string; rank: number | null; total: number };

export default function PassportScreen({ route, navigation }: any) {
  const { playerId: routePlayerId } = route.params ?? {};
  const { playerId: myId } = useAuth();
  const targetId = routePlayerId ?? myId;

  const [player, setPlayer] = useState<Player | null>(null);
  const [leagues, setLeagues] = useState<LeagueEntry[]>([]);
  const [tournaments, setTournaments] = useState<{ id: string; name: string; status: string }[]>([]);
  const [badges, setBadges] = useState<{ code: string; name: string }[]>([]);
  const [venues, setVenues] = useState<string[]>([]);
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [wins, setWins] = useState(0);
  const [rivalCount, setRivalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [
      { data: playerRow, error },
      { data: memberships },
      { data: regs },
      { data: badgeRows },
      { data: checkIns },
      { data: clubRows },
      { count: winCount },
      { count: rivals },
    ] = await Promise.all([
      supabase
        .from('players')
        .select('id, display_name, city, country, main_beyblade, elo_rating, matches_played, created_at')
        .eq('id', targetId)
        .single(),
      supabase.from('league_members').select('league_id, role, leagues(name)').eq('player_id', targetId),
      supabase
        .from('tournament_registrations')
        .select('tournament_id, tournaments(id, name, status)')
        .eq('player_id', targetId),
      supabase.from('player_badges').select('badges(code, name)').eq('player_id', targetId),
      supabase.from('check_ins').select('venues(name)').eq('player_id', targetId),
      supabase.from('club_members').select('clubs(id, name)').eq('player_id', targetId),
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'confirmed').eq('winner_id', targetId),
      supabase
        .from('rivalries')
        .select('*', { count: 'exact', head: true })
        .or(`player_a_id.eq.${targetId},player_b_id.eq.${targetId}`),
    ]);

    if (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
      return;
    }
    setPlayer(playerRow as any);
    setWins(winCount ?? 0);
    setRivalCount(rivals ?? 0);
    setBadges(((badgeRows as any[]) ?? []).map((r) => r.badges).filter(Boolean));
    setClubs(((clubRows as any[]) ?? []).map((r) => r.clubs).filter(Boolean));
    setTournaments(((regs as any[]) ?? []).map((r) => r.tournaments).filter(Boolean));

    // Venues distintos, en orden de aparición.
    const venueNames = ((checkIns as any[]) ?? []).map((c) => c.venues?.name).filter(Boolean);
    setVenues([...new Set(venueNames)] as string[]);

    // Posición en cada liga, sobre el rating global (ver decisión 7).
    const entries = ((memberships as any[]) ?? []).map((m) => ({
      id: m.league_id,
      name: m.leagues?.name ?? 'Liga',
      role: m.role,
    }));
    if (entries.length > 0) {
      const { data: rosters } = await supabase
        .from('league_members')
        .select('league_id, player_id, players(elo_rating)')
        .in(
          'league_id',
          entries.map((e) => e.id)
        );
      const byLeague = new Map<string, { player_id: string; elo: number }[]>();
      for (const row of ((rosters as any[]) ?? [])) {
        const list = byLeague.get(row.league_id) ?? [];
        list.push({ player_id: row.player_id, elo: row.players?.elo_rating ?? 1000 });
        byLeague.set(row.league_id, list);
      }
      setLeagues(
        entries.map((e) => {
          const list = (byLeague.get(e.id) ?? []).sort((a, b) => b.elo - a.elo);
          const index = list.findIndex((p) => p.player_id === targetId);
          return { ...e, rank: index >= 0 ? index + 1 : null, total: list.length };
        })
      );
    } else {
      setLeagues([]);
    }

    setLoading(false);
  }, [targetId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !player) {
    return (
      <Screen style={styles.container}>
        <Text>Cargando…</Text>
      </Screen>
    );
  }

  const losses = player.matches_played - wins;
  const winRate = player.matches_played > 0 ? Math.round((wins / player.matches_played) * 100) : 0;
  const since = new Date(player.created_at).toLocaleDateString();

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.passportHeader}>
          <Text style={styles.passportLabel}>LEAGUE PASSPORT</Text>
          <Text style={styles.name}>{player.display_name}</Text>
          <Text style={styles.sub}>
            {[player.city, player.country].filter(Boolean).join(', ') || 'Ubicación no definida'}
          </Text>
          <Text style={styles.sub}>Blader desde {since}</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Math.round(player.elo_rating)}</Text>
            <Text style={styles.statLabel}>ELO</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {wins}–{losses}
            </Text>
            <Text style={styles.statLabel}>Récord</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{winRate}%</Text>
            <Text style={styles.statLabel}>Win rate</Text>
          </View>
        </View>

        {player.main_beyblade ? <Text style={styles.field}>Main: {player.main_beyblade}</Text> : null}

        <Text style={styles.sectionTitle}>Ligas ({leagues.length})</Text>
        {leagues.length === 0 ? (
          <Text style={styles.empty}>Sin ligas todavía.</Text>
        ) : (
          leagues.map((l) => (
            <Pressable
              key={l.id}
              style={styles.row}
              onPress={() => navigation.navigate('LeagueStandings', { leagueId: l.id })}
            >
              <Text style={styles.rowName}>{l.name}</Text>
              {l.role === 'organizer' && <Text style={styles.tag}>Moderador</Text>}
              <Text style={styles.rowValue}>{l.rank ? `#${l.rank} de ${l.total}` : '—'}</Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>Torneos ({tournaments.length})</Text>
        {tournaments.length === 0 ? (
          <Text style={styles.empty}>Sin torneos todavía.</Text>
        ) : (
          tournaments.map((t) => (
            <View key={t.id} style={styles.row}>
              <Text style={styles.rowName}>{t.name}</Text>
              <Text style={styles.rowValue}>{t.status}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle}>Clubes ({clubs.length})</Text>
        {clubs.length === 0 ? (
          <Text style={styles.empty}>Sin club.</Text>
        ) : (
          clubs.map((c) => (
            <Pressable key={c.id} style={styles.row} onPress={() => navigation.navigate('ClubDetail', { clubId: c.id })}>
              <Text style={styles.rowName}>{c.name}</Text>
            </Pressable>
          ))
        )}

        <Text style={styles.sectionTitle}>Logros ({badges.length})</Text>
        {badges.length === 0 ? (
          <Text style={styles.empty}>Sin logros todavía.</Text>
        ) : (
          <View style={styles.badgeGrid}>
            {badges.map((b) => (
              <View key={b.code} style={styles.badgeChip}>
                <Text style={styles.badgeIcon}>{badgeIcon(b.code)}</Text>
                <Text style={styles.badgeName}>{b.name}</Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>Venues visitados ({venues.length})</Text>
        {venues.length === 0 ? (
          <Text style={styles.empty}>Sin check-ins todavía.</Text>
        ) : (
          <Text style={styles.venueList}>{venues.join(' · ')}</Text>
        )}

        <Text style={styles.sectionTitle}>Rivales</Text>
        <Text style={styles.field}>
          Se ha enfrentado a {rivalCount} jugador{rivalCount === 1 ? '' : 'es'} distinto
          {rivalCount === 1 ? '' : 's'}.
        </Text>

        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Volver</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#fff' },
  passportHeader: {
    borderWidth: 2,
    borderColor: '#2f5ad6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#f6f8ff',
  },
  passportLabel: { fontSize: 10, letterSpacing: 2, color: '#2f5ad6', fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700', marginTop: 6 },
  sub: { color: '#6b6b64', fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 16 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#6b6b64' },
  field: { fontSize: 13, color: '#333' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  rowName: { flex: 1, fontSize: 14, fontWeight: '600' },
  rowValue: { fontSize: 12, color: '#2f5ad6', fontWeight: '700' },
  tag: { fontSize: 10, color: '#2f5ad6', fontWeight: '700' },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f6f7fb',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  badgeIcon: { fontSize: 16 },
  badgeName: { fontSize: 11, fontWeight: '600' },
  venueList: { fontSize: 13, color: '#333', lineHeight: 20 },
  empty: { color: '#6b6b64', fontSize: 12 },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
