import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card, Hex, Pill } from '../ui/primitives';
import { IconChevron } from '../ui/icons';
import { colors, space, type } from '../theme';

type Tournament = {
  id: string;
  name: string;
  status: string;
  tournament_registrations: { count: number }[];
};

// Las dos modalidades del reglamento. La elección baja a cada combate del
// bracket y decide el emparejamiento, el Aerial y si mueve el ELO.
const MODES = [
  { value: 'ranking' as const, label: 'Ranking', desc: 'Cuenta para el ELO · sin Aerial' },
  { value: 'casual' as const, label: 'Casual', desc: 'Al azar · Aerial vale · no toca el ELO' },
];

export default function TournamentsScreen({ route, navigation }: any) {
  const { leagueId, isOrganizer } = route.params;
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'ranking' | 'casual'>('ranking');
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, status, tournament_registrations(count)')
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

  async function create() {
    if (!name.trim()) return;
    const { error } = await supabase
      .from('tournaments')
      .insert({ league_id: leagueId, name: name.trim(), mode });
    if (error) return Alert.alert('Error', error.message);
    setName('');
    setMode('ranking');
    setCreating(false);
    load();
  }

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

            {isOrganizer &&
              (creating ? (
                <Card style={{ gap: space.md }}>
                  <Field
                    label="Nombre del torneo"
                    placeholder="Copa Central — Septiembre"
                    value={name}
                    onChangeText={setName}
                  />

                  <View style={{ gap: space.xs }}>
                    <Text style={styles.fieldLabel}>MODALIDAD</Text>
                    <View style={styles.modeRow}>
                      {MODES.map((m) => {
                        const on = mode === m.value;
                        return (
                          <Pressable
                            key={m.value}
                            onPress={() => setMode(m.value)}
                            style={[styles.modeCard, on && styles.modeCardOn]}
                          >
                            <Text style={[styles.modeName, on && styles.modeNameOn]}>{m.label}</Text>
                            <Text style={styles.modeDesc}>{m.desc}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <Button label="CREAR TORNEO" onPress={create} />
                  <Button label="Cancelar" variant="ghost" onPress={() => setCreating(false)} />
                </Card>
              ) : (
                <Button label="＋  NUEVO TORNEO" variant="ghost" onPress={() => setCreating(true)} />
              ))}
          </View>
        }
        renderItem={({ item, index }) => {
          const open = item.status === 'pending';
          const registered = item.tournament_registrations?.[0]?.count ?? 0;
          // Se destaca el primero solo si está abierto: un torneo terminado
          // no merece la tarjeta grande.
          const hero = index === 0 && open;

          if (hero) {
            return (
              <Card
                style={styles.hero}
                onPress={() =>
                  navigation.navigate('TournamentDetail', { tournamentId: item.id, leagueId, isOrganizer })
                }
              >
                <Pill label="Registro abierto" color={colors.win} />
                <View style={styles.heroTop}>
                  <Hex size={62} color={colors.win}>
                    <Text style={{ fontSize: 24 }}>🏆</Text>
                  </Hex>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.heroName} numberOfLines={2}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>
                      {registered} inscrito{registered === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.heroCta}>Inscribirme ›</Text>
              </Card>
            );
          }

          return (
            <Card
              style={styles.row}
              onPress={() =>
                navigation.navigate('TournamentDetail', { tournamentId: item.id, leagueId, isOrganizer })
              }
            >
              <Hex size={44} color={open ? colors.win : colors.inkDim}>
                <Text style={{ fontSize: 17 }}>🏆</Text>
              </Hex>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>
                  {registered} inscrito{registered === 1 ? '' : 's'}
                </Text>
              </View>
              <Pill
                label={open ? 'Abierto' : 'Terminado'}
                color={open ? colors.win : colors.inkDim}
              />
              <IconChevron />
            </Card>
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
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },

  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  modeRow: { flexDirection: 'row', gap: space.sm },
  modeCard: {
    flex: 1,
    gap: 3,
    padding: space.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  modeCardOn: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  modeName: { fontSize: 14, fontWeight: '800', color: colors.inkSoft },
  modeNameOn: { color: colors.ink },
  modeDesc: { fontSize: 10.5, color: colors.inkSoft, lineHeight: 14 },

  hero: { gap: space.md, borderColor: colors.win },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroName: { ...type.display, fontSize: 19 },
  heroCta: { fontSize: 12, fontWeight: '800', color: colors.win },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
