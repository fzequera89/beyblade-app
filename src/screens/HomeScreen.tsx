import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Logo from '../ui/Logo';
import Avatar from '../ui/Avatar';
import { Card, Pill, Hex, SectionTitle } from '../ui/primitives';
import { IconBell, IconSearch, IconSwords, IconCalendar, IconPin, IconFlame, IconChevron } from '../ui/icons';
import { colors, space, type, glow } from '../theme';

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  elo_rating: number;
  matches_played: number;
  avatar_key: string | null;
  avatar_url: string | null;
  experience_level: string | null;
};

const EXPERIENCE_LABEL: Record<string, string> = {
  rookie: 'Rookie Blader',
  blader: 'Blader',
  pro: 'Pro Blader',
  elite: 'Elite Blader',
};

// Las cuatro acciones son las que el jugador viene a hacer. Van arriba porque
// esta pantalla sustituye al menú de botones que había en el perfil: en vez de
// una lista de secciones, se ofrece lo que se puede HACER ahora.
// Cada acción lleva a un sitio distinto: dos que hacen lo mismo con nombres
// distintos solo confunden. Las dos primeras saltan de pestaña; las otras dos
// abren dentro de Inicio.
const ACTIONS = [
  { key: 'Play', tint: colors.blue, title: 'Encontrar\nrival', desc: 'Quién juega ahora', Icon: IconSearch },
  { key: 'Batallas', tint: colors.elite, title: 'Mis\nbatallas', desc: 'Retos y pendientes', Icon: IconSwords },
  { key: 'Events', tint: colors.win, title: 'Eventos\nde la liga', desc: 'Torneos y quedadas', Icon: IconCalendar },
  { key: 'Venues', tint: colors.streak, title: 'Lugares para\nbatallar', desc: 'Venues y tiendas', Icon: IconPin },
];

export default function HomeScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [wins, setWins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rank, setRank] = useState<number | null>(null);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [tournament, setTournament] = useState<any | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: me } = await supabase
      .from('players')
      .select('id, display_name, city, elo_rating, matches_played, avatar_key, avatar_url, experience_level')
      .eq('id', playerId)
      .single();
    if (!me) {
      setLoading(false);
      return;
    }
    setPlayer(me as any);

    const [{ count: winCount }, { count: above }, { data: matches }, { data: pending }, { data: next }] =
      await Promise.all([
        supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'confirmed').eq('winner_id', playerId),
        // Posición global: cuántos tienen más ELO que yo, más uno.
        supabase.from('players').select('*', { count: 'exact', head: true }).gt('elo_rating', (me as any).elo_rating),
        supabase
          .from('matches')
          .select('id, winner_id, score_a, score_b, player_a_id, elo_a_change, elo_b_change, confirmed_at, player_a:players!matches_player_a_id_fkey(display_name), player_b:players!matches_player_b_id_fkey(display_name)')
          .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
          .eq('status', 'confirmed')
          .order('confirmed_at', { ascending: false })
          .limit(20),
        supabase
          .from('challenges')
          .select('id, created_at, challenger:players!challenges_challenger_id_fkey(id, display_name, elo_rating, avatar_key, avatar_url, city)')
          .eq('challenged_id', playerId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('tournaments')
          .select('id, name, status, created_at, leagues(name), seasons(name)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    setWins(winCount ?? 0);
    setRank((above ?? 0) + 1);
    setChallenges((pending as any) ?? []);
    setTournament(next ?? null);

    const list = ((matches as any[]) ?? []);
    setActivity(list.slice(0, 3));

    let s = 0;
    for (const m of list) {
      if (m.winner_id === playerId) s += 1;
      else break;
    }
    setStreak(s);
    setLoading(false);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function respond(challengeId: string, accept: boolean) {
    if (accept) {
      const { data, error } = await supabase.rpc('accept_challenge', { p_challenge_id: challengeId });
      if (error) return Alert.alert('Error', error.message);
      load();
      navigation.navigate('MatchDetail', { matchId: data });
      return;
    }
    const { error } = await supabase.from('challenges').update({ status: 'declined' }).eq('id', challengeId);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  if (loading || !player) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const losses = player.matches_played - wins;
  const winRate = player.matches_played > 0 ? Math.round((wins / player.matches_played) * 100) : 0;

  return (
    <Screen scroll padded={false}>
      <View style={styles.header}>
        <Logo size="sm" />
        <Pressable style={styles.bell} hitSlop={8} onPress={() => navigation.navigate('Challenges')}>
          <IconBell />
          {challenges.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{challenges.length}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={styles.pad}>
        {/* Identidad y rating */}
        <View style={styles.heroRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.hello} numberOfLines={1}>
              ¡Hola, {player.display_name}!
            </Text>
            <Pill label={EXPERIENCE_LABEL[player.experience_level ?? ''] ?? 'Blader'} />
            <Text style={styles.city}>{player.city ?? 'Sin ciudad'}</Text>
          </View>

          <View style={styles.eloBox}>
            <Hex size={54} color={colors.blue}>
              <Avatar uri={player.avatar_url} avatarKey={player.avatar_key} size={34} />
            </Hex>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.eloLabel}>ELO RATING</Text>
              <Text style={styles.elo}>{Math.round(player.elo_rating).toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* Fila de estadísticas */}
        <Card style={styles.stats}>
          <Stat label="Matches" value={String(player.matches_played)} sub={`${wins}G · ${losses}P`} />
          <View style={styles.statDiv} />
          <Stat label="Win rate" value={`${winRate}%`} tint={colors.blue} />
          <View style={styles.statDiv} />
          <Stat
            label="Racha"
            value={String(streak)}
            tint={streak > 0 ? colors.streak : colors.inkSoft}
            icon={streak > 0 ? <IconFlame size={15} /> : undefined}
          />
          <View style={styles.statDiv} />
          <Stat label="Rank" value={rank ? `#${rank}` : '—'} sub="Global" />
        </Card>

        {/* Acciones */}
        <Text style={styles.question}>¿Qué quieres hacer hoy?</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionsRow}
        >
          {ACTIONS.map((a) => (
            <Pressable
              key={a.key}
              style={[styles.action, { borderColor: a.tint + '55' }]}
              onPress={() => navigation.navigate(a.key)}
            >
              <a.Icon color={a.tint} size={24} />
              <Text style={styles.actionTitle}>{a.title}</Text>
              <Text style={styles.actionDesc}>{a.desc}</Text>
              <View style={styles.actionArrow}>
                <IconChevron color={a.tint} size={15} />
              </View>
            </Pressable>
          ))}
        </ScrollView>

        {/* Desafíos */}
        {challenges.length > 0 && (
          <View style={styles.block}>
            <SectionTitle right={<Link onPress={() => navigation.navigate('Challenges')} />}>
              Desafíos pendientes
            </SectionTitle>
            {challenges.map((c) => (
              <Card key={c.id} style={styles.challenge}>
                <Avatar
                  uri={c.challenger?.avatar_url}
                  avatarKey={c.challenger?.avatar_key}
                  size={46}
                  ring={colors.loss}
                />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.chName}>{c.challenger?.display_name ?? '—'}</Text>
                  <Text style={styles.chMeta}>
                    ELO {Math.round(c.challenger?.elo_rating ?? 1000)} · {c.challenger?.city ?? '—'}
                  </Text>
                </View>
                <View style={{ gap: 6 }}>
                  <Pressable style={styles.accept} onPress={() => respond(c.id, true)}>
                    <Text style={styles.acceptText}>ACEPTAR</Text>
                  </Pressable>
                  <Pressable style={styles.reject} onPress={() => respond(c.id, false)}>
                    <Text style={styles.rejectText}>Rechazar</Text>
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Torneo */}
        {tournament && (
          <View style={styles.block}>
            <SectionTitle>Próximo torneo</SectionTitle>
            <Card
              onPress={() => navigation.navigate('TournamentDetail', { tournamentId: tournament.id })}
              style={styles.tournament}
            >
              <Hex size={46} color={colors.blue}>
                <Text style={{ fontSize: 18 }}>🏆</Text>
              </Hex>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.tName}>{tournament.name}</Text>
                <Text style={styles.chMeta}>{tournament.leagues?.name ?? 'Liga'}</Text>
              </View>
              <Pill label="Registro abierto" color={colors.win} />
            </Card>
          </View>
        )}

        {/* Actividad */}
        <View style={styles.block}>
          <SectionTitle>Actividad reciente</SectionTitle>
          {activity.length === 0 ? (
            <Card>
              <Text style={type.soft}>
                Todavía no tienes batallas. Encuentra un rival y empieza tu historial.
              </Text>
            </Card>
          ) : (
            activity.map((m) => {
              const isA = m.player_a_id === playerId;
              const won = m.winner_id === playerId;
              const rival = isA ? m.player_b?.display_name : m.player_a?.display_name;
              const delta = isA ? m.elo_a_change : m.elo_b_change;
              return (
                <Card
                  key={m.id}
                  style={styles.activity}
                  onPress={() => navigation.navigate('MatchDetail', { matchId: m.id })}
                >
                  <View style={[styles.dot, { backgroundColor: won ? colors.winSoft : colors.lossSoft }]}>
                    <IconSwords size={17} color={won ? colors.win : colors.loss} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actTitle}>
                      <Text style={{ color: won ? colors.win : colors.loss }}>
                        {won ? 'Victoria' : 'Derrota'}
                      </Text>{' '}
                      vs {rival ?? '—'}
                    </Text>
                    <Text style={styles.chMeta}>
                      {m.score_a}–{m.score_b}
                    </Text>
                  </View>
                  <Text style={[styles.delta, { color: (delta ?? 0) >= 0 ? colors.win : colors.loss }]}>
                    {(delta ?? 0) >= 0 ? '+' : ''}
                    {Math.round(delta ?? 0)} ELO
                  </Text>
                </Card>
              );
            })
          )}
        </View>
      </View>
    </Screen>
  );
}

function Stat({
  label,
  value,
  sub,
  tint,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <View style={styles.statValRow}>
        {icon}
        <Text style={[styles.statVal, tint ? { color: tint } : null]}>{value}</Text>
      </View>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function Link({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6}>
      <Text style={styles.link}>Ver todos</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: space.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.xl,
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.loss,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.lg },
  hello: { ...type.display, fontSize: 23 },
  city: { fontSize: 12, color: colors.inkSoft },
  eloBox: { alignItems: 'center', gap: 6 },
  eloLabel: { ...type.label, fontSize: 9, color: colors.blue },
  elo: { ...type.stat, fontSize: 27, color: colors.ink },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: space.xl, paddingVertical: space.md },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statDiv: { width: 1, height: 32, backgroundColor: colors.line },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7, color: colors.inkDim },
  statValRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  statSub: { fontSize: 9.5, color: colors.inkDim },

  question: { ...type.section, marginTop: space.xxl, marginBottom: space.md },
  actionsRow: { gap: space.md, paddingRight: space.xl },
  action: {
    width: 132,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: 14,
    padding: space.md,
    gap: 6,
  },
  actionTitle: { fontSize: 13.5, fontWeight: '700', color: colors.ink, lineHeight: 18 },
  actionDesc: { fontSize: 11, color: colors.inkSoft },
  actionArrow: { alignSelf: 'flex-end', marginTop: 2 },

  block: { marginTop: space.xxl, gap: space.md },
  link: { color: colors.blue, fontSize: 12, fontWeight: '700' },

  challenge: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chName: { fontSize: 15, fontWeight: '700', color: colors.ink },
  chMeta: { fontSize: 11.5, color: colors.inkSoft },
  accept: {
    backgroundColor: colors.blue,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    ...glow(colors.blue, 8),
  },
  acceptText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  reject: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  rejectText: { color: colors.inkSoft, fontSize: 11, fontWeight: '600' },

  tournament: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tName: { fontSize: 15, fontWeight: '800', fontStyle: 'italic', color: colors.ink },

  activity: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  dot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actTitle: { fontSize: 13.5, color: colors.ink, fontWeight: '600' },
  delta: { fontSize: 12, fontWeight: '800' },
});
