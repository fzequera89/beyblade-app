import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Hex, Tabs } from '../ui/primitives';
import Cover, { coverAccent } from '../ui/Cover';
import { CountdownBox, ClosingBar, InfoRow, StatStrip, TournamentName, splitName } from '../ui/tournament';
import { leagueEmblem, emblemFont } from '../lib/emblem';
import { COMBAT_MODES } from '../lib/formats';
import { fmtDateFull } from '../lib/when';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius, glow } from '../theme';

// Lobby de torneos de una liga.
//
// El orden lo manda la relevancia, no la fecha de creación: primero al que
// todavía te puedes inscribir y antes se juega, después los que están en curso
// y hasta abajo los terminados. El tratamiento de héroe solo se aplica si lo
// primero de la lista DE VERDAD es lo más relevante — destacar un torneo
// terminado por estar arriba le inventaría importancia.

// El formato en una línea: cómo se juega y con cuántas peonzas. Repetir "deck
// de 3 · 3 piezas" dice dos veces lo mismo.
function formatLine(t: Tournament): string {
  const deck = COMBAT_MODES.find((m) => m.key === t.combat_mode)?.deckSize ?? 1;
  const rules = t.combat_mode === 'stock' ? 'Stock de caja' : 'Estándar';
  return `${rules} · ${deck} pieza${deck === 1 ? '' : 's'}`;
}

type Filter = 'todos' | 'abiertos' | 'completados';

type Champion = {
  id: string;
  display_name: string;
  elo_rating: number;
  avatar_key: string | null;
  avatar_url: string | null;
};

type Tournament = {
  id: string;
  name: string;
  status: string;
  mode: string | null;
  photo_url: string | null;
  combat_mode: string | null;
  created_at: string | null;
  starts_at: string | null;
  registration_closes_at: string | null;
  capacity: number | null;
  level: string | null;
  prize: string | null;
  venues: { name: string; city: string | null } | null;
  registered: number;
  mine: boolean;
  champion: Champion | null;
};

export default function TournamentsScreen({ route, navigation }: any) {
  const { leagueId, isOrganizer } = route.params;
  const { playerId } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [filter, setFilter] = useState<Filter>('todos');
  const [onlyMine, setOnlyMine] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: mine }] = await Promise.all([
      supabase
        .from('tournaments')
        .select(
          'id, name, status, mode, photo_url, combat_mode, created_at, starts_at, registration_closes_at, capacity, level, prize, venues(name, city), tournament_registrations(count)'
        )
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false }),
      supabase.from('tournament_registrations').select('tournament_id').eq('player_id', playerId),
    ]);

    if (error) {
      setLoading(false);
      return Alert.alert('Error', error.message);
    }

    const rows = ((data as any[]) ?? []).map((t) => ({
      ...t,
      // Supabase devuelve la relación como objeto o como arreglo según el caso.
      venues: Array.isArray(t.venues) ? t.venues[0] ?? null : t.venues ?? null,
      registered: t.tournament_registrations?.[0]?.count ?? 0,
      mine: false,
      champion: null,
    })) as Tournament[];

    const mineSet = new Set(((mine as any[]) ?? []).map((r) => r.tournament_id));
    for (const t of rows) t.mine = mineSet.has(t.id);

    // El campeón de los terminados: el ganador del combate de ronda más alta.
    // Se resuelve en dos consultas para toda la lista, no una por torneo.
    const done = rows.filter((t) => t.status === 'completed').map((t) => t.id);
    if (done.length > 0) {
      const { data: finals } = await supabase
        .from('matches')
        .select('tournament_id, bracket_round, bracket_side, winner_id')
        .in('tournament_id', done)
        .eq('status', 'confirmed')
        .not('winner_id', 'is', null);

      const best = new Map<string, { round: number; final: boolean; winner: string }>();
      for (const m of ((finals as any[]) ?? [])) {
        const final = m.bracket_side === 'final';
        const prev = best.get(m.tournament_id);
        // La gran final de una eliminación doble manda sobre el número de ronda:
        // abajo se juegan más rondas que arriba y la última no es la que decide.
        const better =
          !prev || (final !== prev.final ? final : (m.bracket_round ?? 0) > prev.round);
        if (better) {
          best.set(m.tournament_id, { round: m.bracket_round ?? 0, final, winner: m.winner_id });
        }
      }

      const winnerIds = [...new Set([...best.values()].map((b) => b.winner))];
      if (winnerIds.length > 0) {
        const { data: players } = await supabase
          .from('players')
          .select('id, display_name, elo_rating, avatar_key, avatar_url')
          .in('id', winnerIds);
        const byId = new Map(((players as any[]) ?? []).map((p) => [p.id, p]));
        for (const t of rows) {
          const b = best.get(t.id);
          if (b) t.champion = byId.get(b.winner) ?? null;
        }
      }
    }

    rows.sort(byRelevance);
    setTournaments(rows);
    setLoading(false);
  }, [leagueId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const shown = useMemo(() => {
    let list = tournaments;
    if (filter === 'abiertos') list = list.filter((t) => t.status !== 'completed');
    if (filter === 'completados') list = list.filter((t) => t.status === 'completed');
    if (onlyMine) list = list.filter((t) => t.mine);
    return list;
  }, [tournaments, filter, onlyMine]);

  const openCount = tournaments.filter((t) => t.status !== 'completed').length;
  const hero = shown[0] && shown[0].status === 'pending' && filter !== 'completados' ? shown[0] : null;
  const rest = hero ? shown.slice(1) : shown;

  function open(t: Tournament, tab?: 'bracket') {
    navigation.navigate('TournamentDetail', {
      tournamentId: t.id,
      leagueId,
      isOrganizer,
      initialTab: tab,
    });
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={rest}
        keyExtractor={(t) => t.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: space.lg }}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.screenTitle}>TORNEOS</Text>
                <Text style={styles.screenSub}>Compite. Mejora. Conquista.</Text>
              </View>
              {/* El filtro es de verdad: deja la lista en los torneos donde
                  estás dentro. Un botón que abre un panel vacío sería peor que
                  no tenerlo. */}
              <Pressable
                onPress={() => setOnlyMine((v) => !v)}
                style={[styles.filterBtn, onlyMine && { borderColor: colors.blue, backgroundColor: colors.blueDeep }]}
                hitSlop={6}
              >
                <Text style={[styles.filterText, onlyMine && { color: colors.blueHi }]}>
                  {onlyMine ? '✓ MÍOS' : '⚙  FILTRAR'}
                </Text>
              </Pressable>
            </View>

            <Tabs
              variant="boxed"
              tabs={[
                { key: 'todos' as Filter, label: 'TODOS', glyph: '🏆' },
                { key: 'abiertos' as Filter, label: 'ABIERTOS', glyph: '🟢', badge: openCount },
                { key: 'completados' as Filter, label: 'COMPLETADOS', glyph: '🏁' },
              ]}
              current={filter}
              onChange={setFilter}
            />

            {hero ? <HeroCard t={hero} onPress={() => open(hero)} /> : null}

            {rest.length > 0 && (
              <View style={styles.sectionRow}>
                <Text style={styles.section}>
                  {filter === 'completados' ? 'TORNEOS JUGADOS' : 'PRÓXIMOS TORNEOS'}
                </Text>
                <Pressable onPress={() => navigation.navigate('Inicio', { screen: 'Events' })} hitSlop={6}>
                  <Text style={styles.sectionLink}>Ver calendario ›</Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <RowCard t={item} onPress={() => open(item, item.status === 'completed' ? 'bracket' : undefined)} />
        )}
        ListEmptyComponent={
          !loading && !hero ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>🏆</Text>
              </Hex>
              <Text style={styles.emptyTitle}>
                {onlyMine
                  ? 'No estás inscrito en ninguno'
                  : filter === 'completados'
                  ? 'Ninguno terminado todavía'
                  : 'Sin torneos todavía'}
              </Text>
              <Text style={styles.metaCenter}>
                {isOrganizer ? 'Crea el primero de esta liga.' : 'Los crea un moderador de la liga.'}
              </Text>
            </Card>
          ) : null
        }
        ListFooterComponent={
          <Card style={styles.banner}>
            <Hex size={48} color={colors.elite}>
              <Text style={{ fontSize: 18 }}>🏆</Text>
            </Hex>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>¿Organizas torneos?</Text>
              <Text style={styles.meta}>
                {isOrganizer
                  ? 'Registra y administra tus torneos desde el panel de organizador.'
                  : 'Los crea un moderador de esta liga. Pídele el rol si tú los organizas.'}
              </Text>
            </View>
            {isOrganizer ? (
              <Pressable
                style={styles.bannerBtn}
                onPress={() => navigation.navigate('CreateTournament', { leagueId })}
              >
                <Text style={styles.bannerBtnText}>IR AL PANEL ›</Text>
              </Pressable>
            ) : null}
          </Card>
        }
      />
    </Screen>
  );
}

// Abiertos primero y por fecha más cercana; después los que están en curso; al
// final los terminados. Sin fecha va después de los que sí la tienen: no se
// puede decidir si urge.
function byRelevance(a: Tournament, b: Tournament): number {
  const rank = (t: Tournament) => (t.status === 'pending' ? 0 : t.status === 'completed' ? 2 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const at = a.starts_at ? new Date(a.starts_at).getTime() : null;
  const bt = b.starts_at ? new Date(b.starts_at).getTime() : null;
  if (at === null && bt === null) return 0;
  if (at === null) return 1;
  if (bt === null) return -1;
  // Los terminados, del más reciente al más viejo. Los demás, del más próximo.
  return rank(a) === 2 ? bt - at : at - bt;
}

function HeroCard({ t, onPress }: { t: Tournament; onPress: () => void }) {
  const accent = coverAccent(t.id);
  const full = t.capacity !== null && t.registered >= t.capacity;

  return (
    <View style={[styles.hero, { borderColor: accent.neon }]}>
      <View style={styles.heroHead}>
        <View style={styles.absFill} pointerEvents="none">
          <Cover id={t.id} photoUrl={t.photo_url} live height={244} />
        </View>

        <View style={styles.heroTop}>
          <View style={[styles.tag, { borderColor: colors.win, backgroundColor: 'rgba(4,6,12,0.6)' }]}>
            <Text style={[styles.tagText, { color: colors.win }]}>REGISTRO ABIERTO</Text>
          </View>
          <CountdownBox startsAt={t.starts_at} accent={accent.warm} />
        </View>

        <View style={styles.heroBottom}>
          <TournamentName name={t.name} color={accent.warm} size={25} />
          <View style={styles.heroInfo}>
            <InfoRow glyph="📅" value={fmtDateFull(t.starts_at) ?? 'Fecha por confirmar'} accent={accent.warm} />
            <InfoRow
              glyph="📍"
              value={
                t.venues ? [t.venues.name, t.venues.city].filter(Boolean).join(', ') : 'Sede por confirmar'
              }
              accent={accent.warm}
            />
            <InfoRow glyph="👥" label="Formato" value={formatLine(t)} accent={accent.warm} />
          </View>
        </View>
      </View>

      <View style={styles.heroFoot}>
        <StatStrip
          items={[
            {
              glyph: '👥',
              label: 'INSCRITOS',
              value: t.capacity ? `${t.registered} / ${t.capacity}` : String(t.registered),
              tint: full ? colors.loss : undefined,
            },
            { glyph: '🛡️', label: 'NIVEL', value: t.level ?? 'Abierto' },
            { glyph: '🏆', label: 'PREMIO', value: t.prize ?? 'Sin premio' },
          ]}
        />

        <ClosingBar createdAt={t.created_at} closesAt={t.registration_closes_at} accent={accent.neon} />

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.heroBtn,
            { backgroundColor: accent.neon },
            glow(accent.neon, 14),
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={styles.heroBtnText}>VER TORNEO</Text>
          <Text style={styles.heroBtnChevron}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RowCard({ t, onPress }: { t: Tournament; onPress: () => void }) {
  const accent = coverAccent(t.id);
  const done = t.status === 'completed';
  const live = t.status === 'in_progress';
  const emblem = leagueEmblem(t.name);
  const [head, tail] = splitName(t.name);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <View style={[styles.row, { borderColor: done ? colors.line : accent.neon }]}>
        {/* Escudo sobre un trozo de su propia portada: la fila se reconoce de
            vista antes de leer el nombre. */}
        <View style={styles.thumb}>
          <View style={styles.absFill} pointerEvents="none">
            <Cover id={t.id} photoUrl={t.photo_url} height={116} />
          </View>
          <Hex size={70} color={done ? colors.inkDim : accent.neon}>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={[styles.emblem, { fontSize: emblemFont(emblem.top, 13) }, done && { color: colors.inkSoft }]}
                numberOfLines={1}
              >
                {emblem.top}
              </Text>
              {emblem.bottom ? (
                <Text style={[styles.emblemSub, { fontSize: emblemFont(emblem.bottom, 9) }]} numberOfLines={1}>
                  {emblem.bottom}
                </Text>
              ) : null}
            </View>
          </Hex>
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTags}>
            <View
              style={[
                styles.tag,
                { borderColor: done ? colors.inkDim : live ? accent.neon : colors.win },
              ]}
            >
              <Text
                style={[
                  styles.tagText,
                  { color: done ? colors.inkSoft : live ? accent.warm : colors.win },
                ]}
              >
                {done ? 'COMPLETADO' : live ? 'EN JUEGO' : 'REGISTRO ABIERTO'}
              </Text>
            </View>
            {t.mine && !done ? (
              <View style={[styles.tag, { borderColor: colors.blue }]}>
                <Text style={[styles.tagText, { color: colors.blueHi }]}>INSCRITO</Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.rowName, done && { color: colors.inkSoft }]} numberOfLines={2}>
            {head}
            {tail ? <Text style={{ color: done ? colors.inkDim : accent.warm }}> — {tail}</Text> : null}
          </Text>

          <Text style={styles.meta} numberOfLines={1}>
            📅 {fmtDateFull(t.starts_at) ?? 'Fecha por confirmar'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            📍 {t.venues ? [t.venues.name, t.venues.city].filter(Boolean).join(', ') : 'Sede por confirmar'}
          </Text>

          {/* Un torneo terminado es su campeón; uno abierto son sus lugares. */}
          {done && t.champion ? (
            <View style={styles.champRow}>
              <Avatar
                uri={t.champion.avatar_url}
                avatarKey={t.champion.avatar_key}
                size={26}
                ring={colors.streak}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.champTag}>CAMPEÓN</Text>
                <Text style={styles.champName} numberOfLines={1}>
                  {t.champion.display_name} · {Math.round(t.champion.elo_rating)} ELO
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.rowSide}>
          {done ? (
            <View style={[styles.results, { borderColor: colors.win }]}>
              <Text style={styles.resultsText}>VER RESULTADOS ›</Text>
            </View>
          ) : (
            <>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.sideLabel}>INSCRITOS</Text>
                <Text style={styles.sideValue}>
                  {t.registered}
                  {t.capacity ? ` / ${t.capacity}` : ''}
                </Text>
              </View>
              <CountdownBox startsAt={t.starts_at} accent={accent.warm} compact />
            </>
          )}
        </View>

        {!done && <IconChevron />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  absFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 20 },
  screenTitle: { ...type.display, fontSize: 27 },
  screenSub: { fontSize: 12, color: colors.inkSoft, marginTop: -2 },
  filterBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  filterText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.7, color: colors.inkSoft },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.1, color: colors.inkSoft },
  sectionLink: { fontSize: 11.5, fontWeight: '700', color: colors.blueHi },

  hero: {
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  heroHead: { height: 244, justifyContent: 'space-between', padding: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  heroBottom: { gap: space.md },
  heroInfo: { gap: 5 },
  heroFoot: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: space.lg,
  },
  heroBtnText: { fontSize: 13.5, fontWeight: '800', letterSpacing: 1, color: '#fff' },
  heroBtnChevron: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: -2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    paddingRight: space.md,
  },
  thumb: { width: 96, height: 128, alignItems: 'center', justifyContent: 'center' },
  emblem: { fontSize: 12.5, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.4 },
  emblemSub: { fontSize: 7, fontWeight: '800', letterSpacing: 0.4, color: colors.inkSoft, marginTop: -1 },

  rowBody: { flex: 1, gap: 2, paddingVertical: space.md },
  rowTags: { flexDirection: 'row', gap: 5, marginBottom: 2 },
  rowName: { fontSize: 14.5, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.3 },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2.5 },
  tagText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },

  rowSide: { alignItems: 'center', gap: 6, width: 78 },
  sideLabel: { fontSize: 7.5, fontWeight: '800', letterSpacing: 0.6, color: colors.inkDim },
  sideValue: { fontSize: 13, fontWeight: '800', color: colors.ink },
  results: { borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8 },
  resultsText: { fontSize: 8.5, fontWeight: '800', color: colors.win, letterSpacing: 0.4 },

  champRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 },
  champTag: { fontSize: 7.5, fontWeight: '800', letterSpacing: 0.7, color: colors.streak },
  champName: { fontSize: 11.5, fontWeight: '700', color: colors.ink },

  meta: { fontSize: 11, color: colors.inkSoft },
  metaCenter: { fontSize: 11.5, color: colors.inkSoft, textAlign: 'center' },

  banner: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  bannerTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  bannerBtn: {
    borderWidth: 1,
    borderColor: colors.elite,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  bannerBtnText: { fontSize: 10.5, fontWeight: '800', color: colors.elite, letterSpacing: 0.5 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
