import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import { IconChevron, IconPin } from '../ui/icons';
import { colors, space, type, radius, glow } from '../theme';

const ACTIVE_WINDOW_HOURS = 4;

type Venue = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  active: number;
};

export default function VenuesScreen({ navigation }: any) {
  const { playerId, isAdmin } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - ACTIVE_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

    const [{ data, error }, { count: organizerCount }, { data: recent }] = await Promise.all([
      supabase.from('venues').select('id, name, address, city').order('name'),
      supabase
        .from('league_members')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('role', 'organizer'),
      supabase.from('check_ins').select('venue_id, player_id').gte('checked_in_at', since),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);

    // Cuántos jugadores DISTINTOS hay en cada venue ahora. Un mismo jugador que
    // escaneó dos veces no cuenta como dos personas.
    const byVenue = new Map<string, Set<string>>();
    for (const c of ((recent as any[]) ?? [])) {
      if (!c.venue_id) continue;
      const set = byVenue.get(c.venue_id) ?? new Set<string>();
      set.add(c.player_id);
      byVenue.set(c.venue_id, set);
    }

    const list = ((data as any[]) ?? []).map((v) => ({
      ...v,
      active: byVenue.get(v.id)?.size ?? 0,
    }));

    // El orden es por actividad, no alfabético: destacar al primero de la lista
    // solo tiene sentido si ese primero de verdad importa. Aquí importa el
    // venue donde hay gente jugando ahora.
    list.sort((a, b) => b.active - a.active || a.name.localeCompare(b.name));
    setVenues(list);
    setCanCreate(isAdmin || (organizerCount ?? 0) > 0);
  }, [playerId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const hot = venues.filter((v) => v.active > 0);

  return (
    <Screen padded={false}>
      <FlatList
        data={venues}
        keyExtractor={(v) => v.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Venues</Text>
            </View>
            <Text style={styles.sub}>
              {hot.length > 0
                ? `Hay gente jugando en ${hot.length} lugar${hot.length === 1 ? '' : 'es'} ahora mismo.`
                : 'Lugares registrados para batallar.'}
            </Text>

            <Button
              label="📷  ESCANEAR QR DE CHECK-IN"
              variant="ghost"
              onPress={() => navigation.navigate('ScanCheckIn')}
            />
            {canCreate && (
              <Pressable onPress={() => navigation.navigate('CreateVenue')} hitSlop={6}>
                <Text style={styles.link}>＋ Agregar un venue</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const live = item.active > 0;
          // Solo el primero lleva tratamiento grande, y solo si de verdad tiene
          // actividad: destacar un venue vacío sería inventarle importancia.
          const hero = index === 0 && live;

          if (hero) {
            return (
              <Card style={[styles.hero, glow(colors.win, 10)]}>
                <View style={styles.heroTop}>
                  <View style={[styles.pulse, glow(colors.win, 6)]} />
                  <Text style={styles.heroTag}>ACTIVO AHORA</Text>
                </View>
                <View style={styles.heroBody}>
                  <Hex size={58} color={colors.win}>
                    <IconPin size={22} color={colors.win} />
                  </Hex>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.heroName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>
                      {[item.address, item.city].filter(Boolean).join(', ') || 'Sin dirección'}
                    </Text>
                  </View>
                </View>
                <View style={styles.heroFoot}>
                  <Text style={styles.heroCount}>
                    {item.active} blader{item.active === 1 ? '' : 's'} en las últimas {ACTIVE_WINDOW_HOURS} h
                  </Text>
                  <Pressable onPress={() => navigation.navigate('VenueDetail', { venueId: item.id })}>
                    <Text style={styles.heroCta}>Ver quién está ›</Text>
                  </Pressable>
                </View>
              </Card>
            );
          }

          return (
            <Card
              style={styles.row}
              onPress={() => navigation.navigate('VenueDetail', { venueId: item.id })}
            >
              <Hex size={42} color={live ? colors.win : colors.inkDim}>
                <IconPin size={17} color={live ? colors.win : colors.inkDim} />
              </Hex>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[item.address, item.city].filter(Boolean).join(', ') || 'Sin dirección'}
                </Text>
              </View>
              {live ? <Pill label={`${item.active} aquí`} color={colors.win} /> : <IconChevron />}
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <IconPin size={20} color={colors.inkDim} />
              </Hex>
              <Text style={styles.emptyTitle}>No hay venues registrados</Text>
              <Text style={styles.meta}>
                Los registra un moderador de liga o el administrador.
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
  sub: { ...type.soft, fontSize: 12.5 },
  link: { color: colors.blue, fontSize: 12.5, fontWeight: '700', alignSelf: 'center' },

  hero: { gap: space.md, borderColor: colors.win },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.win },
  heroTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.win },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroName: { ...type.display, fontSize: 19 },
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  heroCount: { fontSize: 11.5, color: colors.inkSoft, flex: 1 },
  heroCta: { fontSize: 12, fontWeight: '800', color: colors.win },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
