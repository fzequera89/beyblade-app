import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Pill, Hex, SectionTitle } from '../ui/primitives';
import { IconChevron, IconSwords } from '../ui/icons';
import { colors, space, type, radius, glow } from '../theme';

// Centro competitivo. Todo lo que se juega vive aquí: lo que tienes pendiente,
// los retos, los torneos y tus ligas. Antes estaba repartido entre tres pestañas
// y los torneos quedaban a cuatro toques, escondidos detrás de la liga.

type Tab = 'jugar' | 'torneos' | 'ligas';

const TABS: { key: Tab; label: string }[] = [
  { key: 'jugar', label: 'Por jugar' },
  { key: 'torneos', label: 'Torneos' },
  { key: 'ligas', label: 'Ligas' },
];

export default function BattlesScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [tab, setTab] = useState<Tab>('jugar');

  const [pending, setPending] = useState<any[]>([]);
  const [received, setReceived] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data: challenges }, { data: incoming }, { data: tours }, { data: memberships }] =
      await Promise.all([
        // Retos aceptados cuyo match sigue sin confirmarse: es lo que el jugador
        // tiene realmente pendiente de jugar o de cerrar.
        supabase
          .from('challenges')
          .select(
            'id, match_id, status, responded_at, challenger:players!challenges_challenger_id_fkey(id, display_name, elo_rating, city, avatar_key, avatar_url), challenged:players!challenges_challenged_id_fkey(id, display_name, elo_rating, city, avatar_key, avatar_url), match:matches(id, status, score_a, score_b, player_a_id, mode, points_to_win, reported_by)'
          )
          .or(`challenger_id.eq.${playerId},challenged_id.eq.${playerId}`)
          .eq('status', 'accepted')
          .limit(30),
        supabase
          .from('challenges')
          .select('id, challenger:players!challenges_challenger_id_fkey(id, display_name, elo_rating, avatar_key, avatar_url)')
          .eq('challenged_id', playerId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('tournaments')
          .select('id, name, status, league_id, leagues(name), tournament_registrations(count)')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase.from('league_members').select('league_id, role, leagues(id, name, description)').eq('player_id', playerId),
      ]);

    setPending(
      ((challenges as any[]) ?? []).filter((c) => c.match && c.match.status !== 'confirmed')
    );
    setReceived((incoming as any) ?? []);
    setTournaments((tours as any) ?? []);
    setLeagues((memberships as any) ?? []);
    setLoading(false);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function respond(id: string, accept: boolean) {
    if (accept) {
      const { data, error } = await supabase.rpc('accept_challenge', { p_challenge_id: id });
      if (error) return Alert.alert('Error', error.message);
      load();
      navigation.navigate('MatchDetail', { matchId: data });
      return;
    }
    const { error } = await supabase.from('challenges').update({ status: 'declined' }).eq('id', id);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  function matchState(status?: string) {
    if (status === 'reported') return { label: 'Falta confirmar', color: colors.streak };
    if (status === 'disputed') return { label: 'En disputa', color: colors.loss };
    return { label: 'Sin jugar', color: colors.blue };
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.head}>
        <Text style={styles.title}>Batallas</Text>
        <Text style={styles.sub}>Todo lo que juegas: retos, torneos y ligas.</Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.pad}>
        {tab === 'jugar' && (
          <>
            {received.length > 0 && (
              <View style={styles.block}>
                <SectionTitle>Te retaron</SectionTitle>
                {received.map((c) => (
                  <Card key={c.id} style={styles.row}>
                    <Avatar
                      uri={c.challenger?.avatar_url}
                      avatarKey={c.challenger?.avatar_key}
                      size={44}
                      ring={colors.loss}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{c.challenger?.display_name ?? '—'}</Text>
                      <Text style={styles.meta}>ELO {Math.round(c.challenger?.elo_rating ?? 1000)}</Text>
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

            <View style={styles.block}>
              <SectionTitle
                right={
                  <Pressable onPress={() => navigation.navigate('Challenges')} hitSlop={6}>
                    <Text style={styles.link}>Todos mis retos</Text>
                  </Pressable>
                }
              >
                Por jugar
              </SectionTitle>

              {pending.length === 0 ? (
                <Card>
                  <Text style={type.soft}>
                    No tienes batallas pendientes. Ve a Play para encontrar un rival.
                  </Text>
                </Card>
              ) : (
                pending.map((c, idx) => {
                  const rival = c.challenger?.id === playerId ? c.challenged : c.challenger;
                  const me = c.challenger?.id === playerId ? c.challenger : c.challenged;
                  const st = matchState(c.match?.status);
                  const m = c.match;

                  // La primera tarjeta de la lista lleva tratamiento de héroe:
                  // es la batalla más urgente y la que la gente mira primero.
                  if (idx === 0) {
                    const iAmA0 = m?.player_a_id === playerId;
                    const mine0 = iAmA0 ? m?.score_a : m?.score_b;
                    const theirs0 = iAmA0 ? m?.score_b : m?.score_a;
                    const shown = m?.status === 'reported' || m?.status === 'disputed';
                    const turn = m?.status === 'reported' && m?.reported_by !== playerId;

                    return (
                      <Card
                        key={c.id}
                        style={[styles.hero, { borderColor: st.color }]}
                        onPress={() => navigation.navigate('MatchDetail', { matchId: c.match_id })}
                      >
                        <View style={styles.heroTop}>
                          <View style={[styles.dot, { backgroundColor: st.color }]} />
                          <Text style={[styles.heroState, { color: st.color }]}>
                            {turn ? 'TE TOCA CONFIRMAR' : st.label.toUpperCase()}
                          </Text>
                          <Text style={styles.footMeta}>
                            {m?.mode === 'casual' ? 'Casual' : 'Ranking'} · a {m?.points_to_win ?? 4} pts
                          </Text>
                        </View>

                        <View style={styles.versus}>
                          <View style={styles.vsSide}>
                            <Avatar uri={me?.avatar_url} avatarKey={me?.avatar_key} size={64} ring={colors.blue} />
                            <Text style={styles.vsName} numberOfLines={1}>
                              Tú
                            </Text>
                          </View>

                          <View style={styles.vsMid}>
                            {shown ? (
                              <View style={styles.heroScoreRow}>
                                <Text
                                  style={[
                                    styles.heroScore,
                                    (mine0 ?? 0) > (theirs0 ?? 0) && { color: colors.win },
                                  ]}
                                >
                                  {mine0}
                                </Text>
                                <Text style={styles.scoreDash}>–</Text>
                                <Text
                                  style={[
                                    styles.heroScore,
                                    (theirs0 ?? 0) > (mine0 ?? 0) && { color: colors.loss },
                                  ]}
                                >
                                  {theirs0}
                                </Text>
                              </View>
                            ) : (
                              <IconSwords size={30} color={st.color} />
                            )}
                          </View>

                          <View style={styles.vsSide}>
                            <Avatar
                              uri={rival?.avatar_url}
                              avatarKey={rival?.avatar_key}
                              size={64}
                              ring={colors.loss}
                            />
                            <Text style={styles.vsName} numberOfLines={1}>
                              {rival?.display_name ?? '—'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.heroFoot}>
                          <Text style={styles.footMeta}>
                            ELO {Math.round(rival?.elo_rating ?? 1000)}
                            {rival?.city ? ` · ${rival.city}` : ''}
                          </Text>
                          <Text style={styles.heroCta}>
                            {m?.status === 'pending' ? 'Registrar resultado ›' : 'Ver detalle ›'}
                          </Text>
                        </View>
                      </Card>
                    );
                  }
                  const reported = m?.status === 'reported' || m?.status === 'disputed';
                  const iAmA = m?.player_a_id === playerId;
                  const mine = iAmA ? m?.score_a : m?.score_b;
                  const theirs = iAmA ? m?.score_b : m?.score_a;
                  // Si ya se reportó y no fui yo, la pelota está de mi lado.
                  const myTurn = m?.status === 'reported' && m?.reported_by !== playerId;

                  return (
                    <Card
                      key={c.id}
                      style={[styles.battle, { borderColor: st.color + '55' }]}
                      onPress={() => navigation.navigate('MatchDetail', { matchId: c.match_id })}
                    >
                      <View style={styles.battleTop}>
                        <Avatar uri={rival?.avatar_url} avatarKey={rival?.avatar_key} size={48} ring={st.color} />
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={styles.name} numberOfLines={1}>
                            {rival?.display_name ?? '—'}
                          </Text>
                          <Text style={styles.meta}>
                            ELO {Math.round(rival?.elo_rating ?? 1000)}
                            {rival?.city ? ` · ${rival.city}` : ''}
                          </Text>
                        </View>

                        {reported ? (
                          <View style={styles.scoreBox}>
                            <Text style={[styles.score, (mine ?? 0) > (theirs ?? 0) && { color: colors.win }]}>
                              {mine}
                            </Text>
                            <Text style={styles.scoreDash}>–</Text>
                            <Text style={[styles.score, (theirs ?? 0) > (mine ?? 0) && { color: colors.loss }]}>
                              {theirs}
                            </Text>
                          </View>
                        ) : (
                          <IconChevron />
                        )}
                      </View>

                      <View style={styles.battleFoot}>
                        <View style={[styles.dot, { backgroundColor: st.color }]} />
                        <Text style={[styles.state, { color: st.color }]}>{st.label}</Text>
                        <Text style={styles.footMeta}>
                          {m?.mode === 'casual' ? 'Casual' : 'Ranking'} · a {m?.points_to_win ?? 4} puntos
                        </Text>
                        {myTurn && <Pill label="Te toca" color={colors.streak} />}
                      </View>
                    </Card>
                  );
                })
              )}
            </View>
          </>
        )}

        {tab === 'torneos' && (
          <View style={styles.block}>
            <SectionTitle>Torneos</SectionTitle>
            {loading ? (
              <Text style={type.soft}>Cargando…</Text>
            ) : tournaments.length === 0 ? (
              <Card>
                <Text style={type.soft}>Todavía no hay torneos. Los crea un moderador de liga.</Text>
              </Card>
            ) : (
              tournaments.map((t) => (
                <Card
                  key={t.id}
                  style={styles.row}
                  onPress={() =>
                    navigation.navigate('TournamentDetail', { tournamentId: t.id, leagueId: t.league_id })
                  }
                >
                  <Hex size={44} color={t.status === 'pending' ? colors.win : colors.inkDim}>
                    <Text style={{ fontSize: 17 }}>🏆</Text>
                  </Hex>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.name}>{t.name}</Text>
                    <Text style={styles.meta}>
                      {t.leagues?.name ?? 'Liga'} · {t.tournament_registrations?.[0]?.count ?? 0} inscritos
                    </Text>
                  </View>
                  <Pill
                    label={t.status === 'pending' ? 'Abierto' : 'Terminado'}
                    color={t.status === 'pending' ? colors.win : colors.inkDim}
                  />
                </Card>
              ))
            )}
          </View>
        )}

        {tab === 'ligas' && (
          <View style={styles.block}>
            <SectionTitle
              right={
                <Pressable onPress={() => navigation.navigate('Leagues')} hitSlop={6}>
                  <Text style={styles.link}>Explorar</Text>
                </Pressable>
              }
            >
              Mis ligas
            </SectionTitle>

            {leagues.length === 0 ? (
              <Card onPress={() => navigation.navigate('Leagues')}>
                <Text style={type.soft}>
                  Todavía no perteneces a ninguna liga. Toca aquí para ver las que existen.
                </Text>
              </Card>
            ) : (
              leagues.map((m) => (
                <Card
                  key={m.league_id}
                  style={styles.row}
                  onPress={() => navigation.navigate('LeagueDetail', { leagueId: m.league_id })}
                >
                  <Hex size={44} color={colors.blue}>
                    <Text style={{ fontSize: 17 }}>🏅</Text>
                  </Hex>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.name}>{m.leagues?.name ?? 'Liga'}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {m.leagues?.description ?? 'Sin descripción'}
                    </Text>
                  </View>
                  {m.role === 'organizer' ? <Pill label="Moderador" /> : null}
                </Card>
              ))
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.lg },
  title: { ...type.display, fontSize: 28 },
  sub: { ...type.soft, marginTop: 4 },
  pad: { paddingHorizontal: space.xl },

  tabs: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.xl,
    marginBottom: space.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  tabOn: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  tabText: { fontSize: 12.5, fontWeight: '700', color: colors.inkSoft },
  tabTextOn: { color: colors.ink },

  block: { gap: space.sm, marginBottom: space.xxl },
  link: { color: colors.blue, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },

  hero: { gap: space.lg, paddingVertical: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  heroState: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  versus: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vsSide: { alignItems: 'center', gap: 6, width: 92 },
  vsName: { fontSize: 12.5, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  vsMid: { flex: 1, alignItems: 'center' },
  heroScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroScore: { fontSize: 32, fontWeight: '800', fontStyle: 'italic', color: colors.inkSoft },
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  heroCta: { fontSize: 12, fontWeight: '800', color: colors.blue },

  battle: { gap: space.md },
  battleTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  scoreBox: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  score: { fontSize: 21, fontWeight: '800', fontStyle: 'italic', color: colors.inkSoft },
  scoreDash: { fontSize: 14, color: colors.inkDim },
  battleFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  state: { fontSize: 11.5, fontWeight: '700' },
  footMeta: { flex: 1, fontSize: 11, color: colors.inkDim },

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
});
