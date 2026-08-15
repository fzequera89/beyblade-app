import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Card, Hex, Pill } from '../ui/primitives';
import Cover from '../ui/Cover';
import { IconChevron, IconCalendar, IconPin } from '../ui/icons';
import { eventLabel } from '../lib/eventTypes';
import { colors, space, type, radius, glow } from '../theme';

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  starts_at: string;
  photo_url: string | null;
  league_id: string | null;
  venues: { name: string; city: string | null } | null;
  leagues: { name: string } | null;
  event_rsvps: { count: number }[];
};

// Cuánto falta, en palabras. "En 3 días" se entiende de inmediato; una fecha
// hay que compararla mentalmente con hoy.
function countdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms < 0) return 'En curso';
  const h = Math.floor(ms / 3600000);
  if (h < 1) return `En ${Math.max(1, Math.floor(ms / 60000))} min`;
  if (h < 24) return `En ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'Mañana' : `En ${d} días`;
}

function whenText(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

export default function EventsScreen({ navigation }: any) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Una hora de margen para que un evento no desaparezca mientras ocurre.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('events')
      .select(
        'id, title, description, type, starts_at, photo_url, league_id, venues(name, city), leagues(name), event_rsvps(count)'
      )
      .gte('starts_at', since)
      .order('starts_at', { ascending: true });
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    setEvents((data as any) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Eventos</Text>
            </View>
            <Text style={styles.sub}>Lo que viene en la escena. Toca uno para confirmar asistencia.</Text>
            <Button label="＋  CREAR EVENTO" variant="ghost" onPress={() => navigation.navigate('CreateEvent')} />
          </View>
        }
        renderItem={({ item, index }) => {
          const going = item.event_rsvps?.[0]?.count ?? 0;
          const official = !!item.league_id;

          // El próximo evento es el que importa: va en grande. Aquí el orden
          // es cronológico, así que el primero sí es el más relevante.
          if (index === 0) {
            return (
              <Pressable
                onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}
                style={({ pressed }) => pressed && { opacity: 0.9 }}
              >
                <View style={[styles.hero, glow(colors.blue, 10)]}>
                  {/* Portada del próximo evento: su foto si la subieron, si no una
                      arena dibujada del id. Las etiquetas van encima. */}
                  <View style={styles.heroBanner}>
                    <View style={styles.absFill} pointerEvents="none">
                      <Cover id={item.id} photoUrl={item.photo_url} height={128} live />
                    </View>
                    <View style={styles.heroTop}>
                      <Pill label={countdown(item.starts_at)} color={colors.blue} />
                      <Pill
                        label={official ? 'Oficial' : 'Abierto'}
                        color={official ? colors.streak : colors.win}
                      />
                    </View>
                  </View>

                  <View style={styles.heroBody}>
                    <Text style={styles.heroTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.heroType}>{eventLabel(item.type)}</Text>

                    {item.description ? (
                      <Text style={styles.heroDesc} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : null}

                    <View style={styles.heroLines}>
                      <View style={styles.line}>
                        <IconCalendar size={15} color={colors.inkSoft} />
                        <Text style={styles.lineText}>{whenText(item.starts_at)}</Text>
                      </View>
                      {item.venues ? (
                        <View style={styles.line}>
                          <IconPin size={15} color={colors.inkSoft} />
                          <Text style={styles.lineText} numberOfLines={1}>
                            {item.venues.name}
                            {item.venues.city ? ` · ${item.venues.city}` : ''}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.heroFoot}>
                      <Text style={styles.goingBig}>
                        {going} <Text style={styles.goingLabel}>van a ir</Text>
                      </Text>
                      <Text style={styles.heroCta}>Ver detalle ›</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          }

          return (
            <Card style={styles.row} onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}>
              <Hex size={46} color={official ? colors.streak : colors.blue}>
                <Text style={{ fontSize: 16 }}>{official ? '🏆' : '🌀'}</Text>
              </Hex>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {eventLabel(item.type)} · {whenText(item.starts_at)}
                </Text>
                {item.venues ? (
                  <Text style={styles.metaDim} numberOfLines={1}>
                    {item.venues.name}
                  </Text>
                ) : null}
              </View>
              <View style={styles.goingBox}>
                <Text style={styles.going}>{going}</Text>
                <Text style={styles.goingSmall}>van</Text>
              </View>
              <IconChevron />
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <IconCalendar size={20} color={colors.inkDim} />
              </Hex>
              <Text style={styles.emptyTitle}>No hay eventos próximos</Text>
              <Text style={styles.meta}>Crea el primero y avísale a la comunidad.</Text>
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

  hero: {
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  absFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  heroBanner: { height: 128 },
  heroTop: { flexDirection: 'row', gap: space.sm, padding: space.md },
  heroBody: { padding: space.lg, gap: space.sm },
  heroTitle: { ...type.display, fontSize: 21, marginTop: 4 },
  heroType: { fontSize: 11.5, color: colors.blue, fontWeight: '700' },
  heroDesc: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18, marginTop: 2 },
  heroLines: { gap: 6, marginTop: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  lineText: { fontSize: 12.5, color: colors.inkSoft, flex: 1 },
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
    marginTop: space.sm,
  },
  goingBig: { fontSize: 18, fontWeight: '800', color: colors.ink },
  goingLabel: { fontSize: 11.5, fontWeight: '400', color: colors.inkSoft },
  heroCta: { fontSize: 12, fontWeight: '800', color: colors.blue },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft },
  metaDim: { fontSize: 11, color: colors.inkDim },
  goingBox: { alignItems: 'center', minWidth: 32 },
  going: { fontSize: 16, fontWeight: '800', color: colors.blue },
  goingSmall: { fontSize: 9, color: colors.inkDim },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
