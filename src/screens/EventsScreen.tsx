import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';
import { eventLabel, formatWhen } from '../lib/eventTypes';

type EventRow = {
  id: string;
  title: string;
  type: string;
  starts_at: string;
  league_id: string | null;
  venues: { name: string; city: string | null } | null;
  event_rsvps: { count: number }[];
};

export default function EventsScreen({ navigation }: any) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Solo lo que viene: un evento pasado ya no sirve para descubrir dónde jugar.
    // Se deja una hora de margen para que no desaparezca mientras está ocurriendo.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('events')
      .select('id, title, type, starts_at, league_id, venues(name, city), event_rsvps(count)')
      .gte('starts_at', since)
      .order('starts_at', { ascending: true });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setEvents((data as any) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={events}
        keyExtractor={(e) => e.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>Eventos</Text>
            <Text style={styles.meta}>Lo que viene en la escena. Toca uno para confirmar asistencia.</Text>
            <Pressable style={styles.button} onPress={() => navigation.navigate('CreateEvent')}>
              <Text style={styles.buttonText}>Crear evento</Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const going = item.event_rsvps?.[0]?.count ?? 0;
          return (
            <Pressable style={styles.row} onPress={() => navigation.navigate('EventDetail', { eventId: item.id })}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.title}</Text>
                <Text style={styles.sub}>
                  {eventLabel(item.type)} · {formatWhen(item.starts_at)}
                </Text>
                {item.venues ? (
                  <Text style={styles.sub}>
                    {item.venues.name}
                    {item.venues.city ? ` · ${item.venues.city}` : ''}
                  </Text>
                ) : null}
              </View>
              <View style={styles.goingBox}>
                <Text style={styles.goingCount}>{going}</Text>
                <Text style={styles.goingLabel}>van</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No hay eventos próximos. Crea el primero.</Text> : null
        }
        ListFooterComponent={
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Volver</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 12,
  },
  name: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12, color: '#6b6b64', marginTop: 2 },
  goingBox: { alignItems: 'center', minWidth: 40 },
  goingCount: { fontSize: 18, fontWeight: '700', color: '#2f5ad6' },
  goingLabel: { fontSize: 10, color: '#6b6b64' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
