import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Cover from '../ui/Cover';
import { Card, Hex, Pill } from '../ui/primitives';
import { IconChevron, IconPin } from '../ui/icons';
import { colors, space, type, radius, glow } from '../theme';

const ACTIVE_WINDOW_HOURS = 4;

type Venue = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  photo_url: string | null;
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
      supabase.from('venues').select('id, name, address, city, photo_url').order('name'),
      supabase
        .from('league_members')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('role', 'organizer'),
      supabase.from('check_ins').select('venue_id, player_id').gte('checked_in_at', since),
    ]);
    setLoading(false);
    if (error) return alerta('Error', error.message);

    // Cuántos jugadores DISTINTOS hay en cada locación ahora. Un mismo jugador
    // que escaneó dos veces no cuenta como dos personas.
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
    // solo tiene sentido si ese primero de verdad importa. Aquí importa la
    // locación donde hay gente jugando ahora.
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
              <Text style={styles.title}>Locaciones</Text>
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
                <Text style={styles.link}>＋ Agregar una locación</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const live = item.active > 0;
          const place = [item.address, item.city].filter(Boolean).join(', ') || 'Sin dirección';
          // Solo el primero lleva portada grande, y solo si de verdad tiene
          // actividad: destacar un lugar vacío sería inventarle importancia.
          const hero = index === 0 && live;

          return (
            <Pressable
              onPress={() => navigation.navigate('VenueDetail', { venueId: item.id })}
              style={({ pressed }) => pressed && { opacity: 0.85 }}
            >
              <View style={[styles.card, live && styles.cardLive, hero && glow(colors.win, 10)]}>
                <Cover
                  id={item.id}
                  photoUrl={item.photo_url}
                  live={live}
                  height={hero ? 152 : 96}
                />

                {/* El nombre va SOBRE la portada: la foto es el sujeto de la
                    tarjeta, no un adorno arriba del texto. */}
                <View style={styles.overlay}>
                  {live && (
                    <View style={styles.liveRow}>
                      <View style={[styles.pulse, glow(colors.win, 6)]} />
                      <Text style={styles.liveText}>
                        {item.active} BLADER{item.active === 1 ? '' : 'S'} AQUÍ AHORA
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.name, hero && styles.nameHero]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={styles.placeRow}>
                    <IconPin size={12} color={colors.inkSoft} />
                    <Text style={styles.place} numberOfLines={1}>
                      {place}
                    </Text>
                  </View>
                </View>

                <View style={styles.foot}>
                  <Text style={styles.footText}>
                    {live
                      ? `Check-ins de las últimas ${ACTIVE_WINDOW_HOURS} h`
                      : 'Sin gente en este momento'}
                  </Text>
                  {live ? (
                    <Text style={styles.cta}>Ver quién está ›</Text>
                  ) : (
                    <IconChevron />
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <IconPin size={20} color={colors.inkDim} />
              </Hex>
              <Text style={styles.emptyTitle}>No hay locaciones registradas</Text>
              <Text style={styles.emptyText}>Las registra un moderador de liga o el administrador.</Text>
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
  sub: { ...type.soft, fontSize: 12.5 },
  link: { color: colors.blue, fontSize: 12.5, fontWeight: '700', alignSelf: 'center' },

  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  cardLive: { borderColor: colors.win },

  overlay: { paddingHorizontal: space.lg, paddingTop: space.md, gap: 3 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  pulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.win },
  liveText: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.win },
  name: { fontSize: 16, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.3 },
  nameHero: { fontSize: 21 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  place: { flex: 1, fontSize: 11.5, color: colors.inkSoft },

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

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  emptyText: { ...type.soft, fontSize: 12, textAlign: 'center' },
});
