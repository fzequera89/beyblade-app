import { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Pill, SectionTitle, Tabs } from '../ui/primitives';
import LeagueCard, { LeagueCardData } from '../ui/LeagueCard';
import {
  HeroCard,
  RowCard,
  byRelevance,
  attachChampions,
  Filter,
  Tournament,
} from '../ui/tournamentCards';
import { IconChevron, IconSwords } from '../ui/icons';
import { colors, space, type, radius, glow } from '../theme';

// Centro competitivo. Todo lo que se juega vive aquí: lo que tienes pendiente,
// los retos, los torneos y tus ligas. Antes estaba repartido entre tres pestañas
// y los torneos quedaban a cuatro toques, escondidos detrás de la liga.
//
// Torneos y Ligas usan las MISMAS tarjetas ricas que sus lobbies propios
// (ui/tournamentCards, ui/LeagueCard). La diferencia es el alcance: aquí es
// global —todos los torneos, todas mis ligas—, no una liga a la vez.

type Tab = 'jugar' | 'torneos' | 'ligas';

// El torneo del hub carga además a qué liga pertenece: la lista es global, así
// que la liga es el dato que ubica cada torneo.
type HubTournament = Tournament & { league_id: string; leagueName: string | null; isOrganizer: boolean };

const TABS: { key: Tab; label: string }[] = [
  { key: 'jugar', label: 'Por jugar' },
  { key: 'torneos', label: 'Torneos' },
  { key: 'ligas', label: 'Ligas' },
];

export default function BattlesScreen({ navigation }: any) {
  const { playerId, isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('jugar');
  const [torneoFilter, setTorneoFilter] = useState<Filter>('todos');

  const [pending, setPending] = useState<any[]>([]);
  const [received, setReceived] = useState<any[]>([]);
  const [tournaments, setTournaments] = useState<HubTournament[]>([]);
  const [leagues, setLeagues] = useState<LeagueCardData[]>([]);
  const [isJudge, setIsJudge] = useState(false);
  const [disputeCount, setDisputeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [
      { data: challenges },
      { data: incoming },
      { data: tours },
      { data: memberships },
      { data: deTorneo },
    ] =
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
          .select(
            'id, name, status, league_id, mode, photo_url, combat_mode, created_at, starts_at, registration_closes_at, capacity, level, prize, venues(name, city), leagues(name), tournament_registrations(count)'
          )
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('league_members')
          .select('league_id, role, leagues(id, name, description, photo_url, owner_player_id)')
          .eq('player_id', playerId),
        // "Por jugar" salía SOLO de retos aceptados, así que un combate de
        // torneo —que no nace de un reto— no aparecía por ningún lado. El
        // jugador tenía un combate asignado y la app no se lo decía.
        supabase
          .from('matches')
          .select(
            'id, status, score_a, score_b, mode, points_to_win, reported_by, bracket_round, player_a_id, player_b_id, tournament_id, tournaments(name), player_a:players!matches_player_a_id_fkey(id, display_name, elo_rating, city, avatar_key, avatar_url), player_b:players!matches_player_b_id_fkey(id, display_name, elo_rating, city, avatar_key, avatar_url)'
          )
          .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
          .not('tournament_id', 'is', null)
          .neq('status', 'confirmed')
          .limit(30),
      ]);

    // Si arbitras, lo que está detenido esperándote va antes que lo tuyo.
    // El servidor decide CUÁLES te tocan: contar todas las disputas de la
    // plataforma inflaba el aviso con combates que este juez no puede tocar,
    // incluidos los que él mismo está jugando.
    const [{ data: me }, { data: arbitrable }] = await Promise.all([
      supabase.from('players').select('judge_role, is_admin').eq('id', playerId).maybeSingle(),
      supabase.rpc('arbitrable_match_ids'),
    ]);
    const disputes = ((arbitrable as string[]) ?? []).length;
    const judge =
      (me as any)?.is_admin === true ||
      ((me as any)?.judge_role && (me as any).judge_role !== 'none') ||
      ((memberships as any[]) ?? []).some((m) => m.role === 'organizer');
    setIsJudge(!!judge);
    setDisputeCount(disputes ?? 0);

    // Los combates de torneo se visten con la misma forma que un reto para que
    // la lista los pinte igual: al jugador le da lo mismo de dónde salió el
    // combate, lo que quiere es jugarlo.
    const deTorneoComoReto = ((deTorneo as any[]) ?? []).map((m) => ({
      id: `torneo-${m.id}`,
      match_id: m.id,
      challenger: m.player_a,
      challenged: m.player_b,
      torneo: (Array.isArray(m.tournaments) ? m.tournaments[0] : m.tournaments)?.name ?? 'Torneo',
      ronda: m.bracket_round,
      match: {
        id: m.id,
        status: m.status,
        score_a: m.score_a,
        score_b: m.score_b,
        player_a_id: m.player_a_id,
        mode: m.mode,
        points_to_win: m.points_to_win,
        reported_by: m.reported_by,
      },
    }));

    setPending([
      ...((challenges as any[]) ?? []).filter((c) => c.match && c.match.status !== 'confirmed'),
      ...deTorneoComoReto,
    ]);
    setReceived((incoming as any) ?? []);

    // ── Torneos (global): las mismas tarjetas del lobby, pero de todas las ligas ──
    const myLeagueRole = new Map<string, string>(
      ((memberships as any[]) ?? []).map((m) => [m.league_id, m.role])
    );
    const { data: myRegs } = await supabase
      .from('tournament_registrations')
      .select('tournament_id')
      .eq('player_id', playerId);
    const mineSet = new Set(((myRegs as any[]) ?? []).map((r) => r.tournament_id));

    const tRows: HubTournament[] = ((tours as any[]) ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status,
      mode: t.mode,
      photo_url: t.photo_url,
      combat_mode: t.combat_mode,
      created_at: t.created_at,
      starts_at: t.starts_at,
      registration_closes_at: t.registration_closes_at,
      capacity: t.capacity,
      level: t.level,
      prize: t.prize,
      venues: Array.isArray(t.venues) ? t.venues[0] ?? null : t.venues ?? null,
      registered: t.tournament_registrations?.[0]?.count ?? 0,
      mine: mineSet.has(t.id),
      champion: null,
      league_id: t.league_id,
      leagueName: (Array.isArray(t.leagues) ? t.leagues[0]?.name : t.leagues?.name) ?? null,
      // Puedes administrar el torneo si eres admin o moderador de su liga.
      isOrganizer: isAdmin || myLeagueRole.get(t.league_id) === 'organizer',
    }));
    await attachChampions(tRows);
    tRows.sort(byRelevance);
    setTournaments(tRows);

    // ── Mis ligas (con stats), las mismas tarjetas del lobby de Ligas ──
    const myLeagues = ((memberships as any[]) ?? []).map((m) => ({
      ...(Array.isArray(m.leagues) ? m.leagues[0] : m.leagues),
      role: m.role,
    }));
    const myLeagueIds = myLeagues.map((l) => l.id).filter(Boolean);
    if (myLeagueIds.length > 0) {
      const [{ data: rosters }, { data: tourneys }] = await Promise.all([
        supabase.from('league_members').select('league_id, player_id, players(elo_rating)').in('league_id', myLeagueIds),
        supabase.from('tournaments').select('league_id').in('league_id', myLeagueIds),
      ]);

      // La posición en cada liga se calcula sobre el rating GLOBAL de sus
      // miembros: no hay un ELO por liga (decisión 7 de PROGRESS.md).
      const byLeague = new Map<string, { player_id: string; elo: number }[]>();
      for (const row of ((rosters as any[]) ?? [])) {
        const list = byLeague.get(row.league_id) ?? [];
        list.push({ player_id: row.player_id, elo: row.players?.elo_rating ?? 1000 });
        byLeague.set(row.league_id, list);
      }
      const tourCount = new Map<string, number>();
      for (const t of ((tourneys as any[]) ?? [])) {
        tourCount.set(t.league_id, (tourCount.get(t.league_id) ?? 0) + 1);
      }

      const cards: LeagueCardData[] = myLeagues.map((l) => {
        const roster = (byLeague.get(l.id) ?? []).slice().sort((a, b) => b.elo - a.elo);
        const idx = roster.findIndex((p) => p.player_id === playerId);
        return {
          id: l.id,
          name: l.name,
          description: l.description ?? null,
          photo_url: l.photo_url ?? null,
          role: l.role,
          isOwner: l.owner_player_id === playerId,
          myRank: idx >= 0 ? idx + 1 : null,
          memberCount: roster.length,
          tournamentCount: tourCount.get(l.id) ?? 0,
        };
      });
      // Las que diriges primero (dueño, luego moderador): son las que vienes a gestionar.
      const rank = (l: LeagueCardData) => (l.isOwner ? 2 : l.role === 'organizer' ? 1 : 0);
      cards.sort((a, b) => rank(b) - rank(a));
      setLeagues(cards);
    } else {
      setLeagues([]);
    }

    setLoading(false);
  }, [playerId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function respond(id: string, accept: boolean) {
    if (accept) {
      const { data, error } = await supabase.rpc('accept_challenge', { p_challenge_id: id });
      if (error) return alerta('Error', error.message);
      load();
      navigation.navigate('MatchDetail', { matchId: data });
      return;
    }
    const { error } = await supabase.from('challenges').update({ status: 'declined' }).eq('id', id);
    if (error) return alerta('Error', error.message);
    load();
  }

  function matchState(status?: string) {
    if (status === 'reported') return { label: 'Falta confirmar', color: colors.streak };
    if (status === 'disputed') return { label: 'En disputa', color: colors.loss };
    return { label: 'Sin jugar', color: colors.blue };
  }

  // El filtro decide qué torneos se ven; el orden ya vino por relevancia. El
  // tratamiento de héroe solo va si lo primero DE VERDAD es un torneo abierto.
  const shownTournaments = useMemo(() => {
    if (torneoFilter === 'abiertos') return tournaments.filter((t) => t.status !== 'completed');
    if (torneoFilter === 'completados') return tournaments.filter((t) => t.status === 'completed');
    return tournaments;
  }, [tournaments, torneoFilter]);
  const openTournamentCount = tournaments.filter((t) => t.status !== 'completed').length;
  const torneoHero =
    shownTournaments[0] && shownTournaments[0].status === 'pending' && torneoFilter !== 'completados'
      ? shownTournaments[0]
      : null;
  const torneoRest = torneoHero ? shownTournaments.slice(1) : shownTournaments;

  function openTournament(t: HubTournament, toBracket = false) {
    navigation.navigate('TournamentDetail', {
      tournamentId: t.id,
      leagueId: t.league_id,
      isOrganizer: t.isOrganizer,
      initialTab: toBracket ? 'bracket' : undefined,
    });
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
        {/* Si arbitras, lo que espera tu aprobación va antes que tus propias
            batallas: ningún resultado cuenta para el ELO hasta que lo apruebes,
            así que cada uno tiene a dos personas esperando. */}
        {isJudge && disputeCount > 0 && (
          <Card
            style={[styles.judgeCall, glow(colors.loss, 8)]}
            onPress={() => navigation.navigate('Disputes')}
          >
            <Text style={styles.judgeTag}>TE TOCA ARBITRAR</Text>
            <Text style={styles.judgeBig}>
              {disputeCount}
              <Text style={styles.judgeUnit}>
                {' '}
                resultado{disputeCount === 1 ? '' : 's'} esperando
              </Text>
            </Text>
            <Text style={styles.judgeCta}>Abrir bandeja ›</Text>
          </Card>
        )}

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
            <Tabs
              variant="boxed"
              tabs={[
                { key: 'todos' as Filter, label: 'TODOS', glyph: '🏆' },
                { key: 'abiertos' as Filter, label: 'ABIERTOS', glyph: '🟢', badge: openTournamentCount },
                { key: 'completados' as Filter, label: 'COMPLETADOS', glyph: '🏁' },
              ]}
              current={torneoFilter}
              onChange={setTorneoFilter}
            />

            {loading ? (
              <Text style={type.soft}>Cargando…</Text>
            ) : shownTournaments.length === 0 ? (
              <Card>
                <Text style={type.soft}>
                  {torneoFilter === 'completados'
                    ? 'Ningún torneo terminado todavía.'
                    : 'Todavía no hay torneos. Los crea un moderador de liga.'}
                </Text>
              </Card>
            ) : (
              <View style={{ gap: space.md }}>
                {torneoHero ? <HeroCard t={torneoHero} onPress={() => openTournament(torneoHero)} /> : null}
                {torneoRest.map((t) => (
                  <RowCard
                    key={t.id}
                    t={t}
                    subtitle={t.leagueName}
                    onPress={() => openTournament(t, t.status === 'completed')}
                  />
                ))}
              </View>
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
              <View style={{ gap: space.md }}>
                {leagues.map((l) => (
                  <LeagueCard
                    key={l.id}
                    league={l}
                    onPress={() => navigation.navigate('LeagueDetail', { leagueId: l.id })}
                  />
                ))}
              </View>
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

  judgeCall: { gap: 2, borderColor: colors.loss, marginBottom: space.lg },
  judgeTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: colors.loss },
  judgeBig: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  judgeUnit: { fontSize: 13, fontWeight: '600', fontStyle: 'normal', color: colors.inkSoft },
  judgeCta: { fontSize: 12, fontWeight: '800', color: colors.loss, marginTop: 4 },

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
