import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Card, Hex } from '../ui/primitives';
import Cover from '../ui/Cover';
import { COMBAT_MODES } from '../lib/formats';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius } from '../theme';

// La modalidad se muestra solo si NO es la de siempre: repetir "1 vs 1" en cada
// tarjeta cuando casi todos lo son es ruido.
function combatLabel(mode?: string | null): string | null {
  if (!mode || mode === 'solo') return null;
  return COMBAT_MODES.find((m) => m.key === mode)?.label ?? null;
}

type Tournament = {
  id: string;
  name: string;
  status: string;
  photo_url: string | null;
  combat_mode: string | null;
  tournament_registrations: { count: number }[];
};

export default function TournamentsScreen({ route, navigation }: any) {
  const { leagueId, isOrganizer } = route.params;
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, status, photo_url, combat_mode, tournament_registrations(count)')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    // Los abiertos primero: son a los que todavía te puedes inscribir.
    setTournaments(
      ((data as any as Tournament[]) ?? []).sort(
        (a, b) => (b.status === 'pending' ? 1 : 0) - (a.status === 'pending' ? 1 : 0)
      )
    );
  }, [leagueId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={tournaments}
        keyExtractor={(t) => t.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Torneos</Text>
            </View>

            {isOrganizer && (
              <Button
                label="＋  NUEVO TORNEO"
                variant="ghost"
                onPress={() => navigation.navigate('CreateTournament', { leagueId })}
              />
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const open = item.status === 'pending';
          const registered = item.tournament_registrations?.[0]?.count ?? 0;
          // Se destaca el primero solo si está abierto: un torneo terminado
          // no merece la tarjeta grande.
          const hero = index === 0 && open;

          return (
            <Pressable
              onPress={() =>
                navigation.navigate('TournamentDetail', { tournamentId: item.id, leagueId, isOrganizer })
              }
              style={({ pressed }) => pressed && { opacity: 0.85 }}
            >
              <View style={[styles.card, open && { borderColor: colors.win }]}>
                <Cover
                  id={item.id}
                  photoUrl={item.photo_url}
                  live={open}
                  height={hero ? 148 : 92}
                />

                {/* El nombre va SOBRE la portada: la imagen es el sujeto de la
                    tarjeta, no un adorno arriba del texto. */}
                <View style={styles.overlay}>
                  {open && <Text style={styles.openTag}>REGISTRO ABIERTO</Text>}
                  <Text style={[styles.name, hero && styles.nameHero]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta}>
                    {registered} inscrito{registered === 1 ? '' : 's'}
                    {combatLabel(item.combat_mode) ? ` · ${combatLabel(item.combat_mode)}` : ''}
                  </Text>
                </View>

                <View style={styles.foot}>
                  <Text style={styles.footText}>
                    {open ? 'Todavía te puedes inscribir' : 'Terminado'}
                  </Text>
                  {open ? <Text style={styles.cta}>Ver torneo ›</Text> : <IconChevron />}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>🏆</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Sin torneos todavía</Text>
              <Text style={styles.meta}>
                {isOrganizer ? 'Crea el primero de esta liga.' : 'Los crea un moderador de la liga.'}
              </Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },


  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  overlay: { paddingHorizontal: space.lg, paddingTop: space.md, gap: 3 },
  openTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.win },
  nameHero: { fontSize: 20 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  footText: { flex: 1, fontSize: 11, color: colors.inkDim },
  cta: { fontSize: 12, fontWeight: '800', color: colors.win },


  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 15.5, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.2 },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
