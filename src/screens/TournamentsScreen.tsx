import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import { Card, Hex, Tabs } from '../ui/primitives';
import { HeroCard, RowCard, byRelevance, attachChampions, Filter, Tournament } from '../ui/tournamentCards';
import { colors, space, type, radius } from '../theme';

// Lobby de torneos de una liga.
//
// El orden lo manda la relevancia, no la fecha de creación: primero al que
// todavía te puedes inscribir y antes se juega, después los que están en curso
// y hasta abajo los terminados. El tratamiento de héroe solo se aplica si lo
// primero de la lista DE VERDAD es lo más relevante — destacar un torneo
// terminado por estar arriba le inventaría importancia.
//
// Las tarjetas (HeroCard/RowCard) viven en ui/tournamentCards y se comparten
// con el hub de Batallas: un torneo se ve igual dondequiera que aparezca.

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
      return alerta('Error', error.message);
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

    await attachChampions(rows);

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
  const hero = shown[0] && shown[0].status !== 'completed' && filter !== 'completados' ? shown[0] : null;
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

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },

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
