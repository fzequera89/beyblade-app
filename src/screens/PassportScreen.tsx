import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Pill, Hex, SectionTitle } from '../ui/primitives';
import { badgeIcon } from '../lib/badges';
import { colors, space, type, radius } from '../theme';

// League Passport: la trayectoria completa de un jugador en una sola vista.
// Es lo que le da sentido al multi-liga — un mismo rating global, con la
// historia de por dónde pasó.

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  country: string | null;
  main_beyblade: string | null;
  elo_rating: number;
  matches_played: number;
  created_at: string;
  avatar_key: string | null;
  avatar_url: string | null;
  experience_level: string | null;
};

type LeagueEntry = { id: string; name: string; role: string; rank: number | null; total: number };

const EXPERIENCE_LABEL: Record<string, string> = {
  rookie: 'Rookie Blader',
  blader: 'Blader',
  pro: 'Pro Blader',
  elite: 'Elite Blader',
};

export default function PassportScreen({ route, navigation }: any) {
  const { playerId: routePlayerId } = route.params ?? {};
  const { playerId: myId } = useAuth();
  const targetId = routePlayerId ?? myId;
  const isMe = targetId === myId;

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
        .select(
          'id, display_name, city, country, main_beyblade, elo_rating, matches_played, created_at, avatar_key, avatar_url, experience_level'
        )
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
      supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .eq('winner_id', targetId),
      supabase
        .from('rivalries')
        .select('*', { count: 'exact', head: true })
        .or(`player_a_id.eq.${targetId},player_b_id.eq.${targetId}`),
    ]);

    if (error) {
      setLoading(false);
      alerta('Error', error.message);
      return;
    }
    setPlayer(playerRow as any);
    setWins(winCount ?? 0);
    setRivalCount(rivals ?? 0);
    setBadges(((badgeRows as any[]) ?? []).map((r) => r.badges).filter(Boolean));
    setClubs(((clubRows as any[]) ?? []).map((r) => r.clubs).filter(Boolean));
    setTournaments(((regs as any[]) ?? []).map((r) => r.tournaments).filter(Boolean));
    setVenues([...new Set(((checkIns as any[]) ?? []).map((c) => c.venues?.name).filter(Boolean))] as string[]);

    // Posición en cada liga, sobre el rating global (decisión 7 de PROGRESS.md).
    const entries = ((memberships as any[]) ?? []).map((m) => ({
      id: m.league_id,
      name: m.leagues?.name ?? 'Liga',
      role: m.role,
    }));
    if (entries.length > 0) {
      const { data: rosters } = await supabase
        .from('league_members')
        .select('league_id, player_id, players(elo_rating)')
        .in('league_id', entries.map((e) => e.id));
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
    } else setLeagues([]);

    setLoading(false);
  }, [targetId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !player) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const losses = player.matches_played - wins;
  const winRate = player.matches_played > 0 ? Math.round((wins / player.matches_played) * 100) : 0;
  const since = new Date(player.created_at).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  return (
    <Screen scroll padded={false}>
      <View style={styles.headRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.pad}>
        {/* Pasaporte */}
        <Card style={styles.passport}>
          <Text style={styles.stamp}>LEAGUE PASSPORT</Text>

          <View style={styles.idRow}>
            <Hex size={98} color={colors.blue}>
              <Avatar uri={player.avatar_url} avatarKey={player.avatar_key} size={70} />
            </Hex>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.name} numberOfLines={1}>
                {player.display_name}
              </Text>
              <Pill label={EXPERIENCE_LABEL[player.experience_level ?? ''] ?? 'Blader'} />
              <Text style={styles.meta}>
                {[player.city, player.country].filter(Boolean).join(', ') || 'Sin ubicación'}
              </Text>
              <Text style={styles.since}>Blader desde {since}</Text>
            </View>
          </View>

          <View style={styles.stats}>
            <Stat label="ELO" value={Math.round(player.elo_rating).toLocaleString()} tint={colors.blue} />
            <View style={styles.vDiv} />
            <Stat label="Récord" value={`${wins}–${losses}`} />
            <View style={styles.vDiv} />
            <Stat label="Win rate" value={`${winRate}%`} />
          </View>

          {player.main_beyblade ? (
            <Text style={styles.main}>
              <Text style={styles.mainLabel}>Beyblade principal · </Text>
              {player.main_beyblade}
            </Text>
          ) : null}
        </Card>

        {/* Ligas */}
        <Section title={`Ligas (${leagues.length})`}>
          {leagues.length === 0 ? (
            <Empty text="Sin ligas todavía." />
          ) : (
            leagues.map((l) => (
              <Card
                key={l.id}
                style={styles.row}
                onPress={() => navigation.navigate('LeagueStandings', { leagueId: l.id })}
              >
                <Hex size={40} color={colors.blue}>
                  <Text style={{ fontSize: 15 }}>🏅</Text>
                </Hex>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{l.name}</Text>
                  {l.role === 'organizer' && <Text style={styles.rowTag}>Moderador</Text>}
                </View>
                <Text style={styles.rowValue}>{l.rank ? `#${l.rank} de ${l.total}` : '—'}</Text>
              </Card>
            ))
          )}
        </Section>

        {/* Torneos */}
        <Section title={`Torneos (${tournaments.length})`}>
          {tournaments.length === 0 ? (
            <Empty text="Sin torneos todavía." />
          ) : (
            tournaments.map((t) => (
              <Card key={t.id} style={styles.row}>
                <Hex size={40} color={t.status === 'pending' ? colors.win : colors.inkDim}>
                  <Text style={{ fontSize: 15 }}>🏆</Text>
                </Hex>
                <Text style={[styles.rowName, { flex: 1 }]} numberOfLines={1}>
                  {t.name}
                </Text>
                <Pill
                  label={t.status === 'pending' ? 'Abierto' : 'Terminado'}
                  color={t.status === 'pending' ? colors.win : colors.inkDim}
                />
              </Card>
            ))
          )}
        </Section>

        {/* Clubes */}
        <Section title={`Clubes (${clubs.length})`}>
          {clubs.length === 0 ? (
            <Empty text="Sin club." />
          ) : (
            clubs.map((c) => (
              <Card
                key={c.id}
                style={styles.row}
                onPress={() => navigation.navigate('ClubDetail', { clubId: c.id })}
              >
                <Hex size={40} color={colors.elite}>
                  <Text style={{ fontSize: 15 }}>🛡️</Text>
                </Hex>
                <Text style={[styles.rowName, { flex: 1 }]}>{c.name}</Text>
              </Card>
            ))
          )}
        </Section>

        {/* Logros */}
        <Section title={`Logros (${badges.length})`}>
          {badges.length === 0 ? (
            <Empty text="Sin logros todavía." />
          ) : (
            <Card style={styles.badgeGrid}>
              {badges.map((b) => (
                <View key={b.code} style={styles.badgeChip}>
                  <Text style={styles.badgeGlyph}>{badgeIcon(b.code)}</Text>
                  <Text style={styles.badgeName}>{b.name}</Text>
                </View>
              ))}
            </Card>
          )}
        </Section>

        {/* Trayectoria */}
        <Section title="Trayectoria">
          <Card style={{ gap: space.md }}>
            <Line label="Venues visitados" value={venues.length > 0 ? venues.join(' · ') : 'Sin check-ins'} />
            <Line
              label="Rivales enfrentados"
              value={`${rivalCount} jugador${rivalCount === 1 ? '' : 'es'} distinto${rivalCount === 1 ? '' : 's'}`}
            />
          </Card>
        </Section>

        {isMe && (
          <Text style={styles.footNote}>
            Este es tu pasaporte. Cualquier jugador puede verlo desde tu perfil.
          </Text>
        )}
      </View>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <Text style={type.soft}>{text}</Text>
    </Card>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.statVal, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={styles.lineLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headRow: { paddingHorizontal: space.xl, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  pad: { paddingHorizontal: space.xl },

  passport: { gap: space.lg, borderColor: colors.blue },
  stamp: { ...type.label, fontSize: 9, letterSpacing: 2.4, color: colors.blue },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  name: { ...type.display, fontSize: 22 },
  meta: { fontSize: 12, color: colors.inkSoft },
  since: { fontSize: 11, color: colors.inkDim },

  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 28, backgroundColor: colors.line },
  main: { fontSize: 12.5, color: colors.ink },
  mainLabel: { color: colors.inkDim },

  block: { marginTop: space.xxl, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowTag: { fontSize: 10, color: colors.blue, fontWeight: '700', marginTop: 2 },
  rowValue: { fontSize: 12.5, fontWeight: '800', color: colors.blue },

  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  badgeGlyph: { fontSize: 14 },
  badgeName: { fontSize: 11, fontWeight: '700', color: colors.ink },

  lineLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  lineValue: { fontSize: 13, color: colors.ink, lineHeight: 19 },
  footNote: { fontSize: 11, color: colors.inkDim, textAlign: 'center', marginTop: space.xxl },
});
