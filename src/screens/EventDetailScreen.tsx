import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import { eventLabel, formatWhen } from '../lib/eventTypes';

type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  starts_at: string;
  created_by: string | null;
  venues: { id: string; name: string; city: string | null; address: string | null } | null;
  leagues: { name: string } | null;
};

type Attendee = { player_id: string; players: { display_name: string; elo_rating: number } | null };

export default function EventDetailScreen({ route, navigation }: any) {
  const { eventId } = route.params;
  const { playerId, isAdmin } = useAuth();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: rsvps }] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, title, description, type, starts_at, created_by, venues(id, name, city, address), leagues(name)'
        )
        .eq('id', eventId)
        .single(),
      supabase
        .from('event_rsvps')
        .select('player_id, players(display_name, elo_rating)')
        .eq('event_id', eventId),
    ]);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setEvent(data as any);
    setAttendees((rsvps as any) ?? []);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isGoing = attendees.some((a) => a.player_id === playerId);
  const canDelete = event && (event.created_by === playerId || isAdmin);

  async function toggleRsvp() {
    setBusy(true);
    const { error } = isGoing
      ? await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('player_id', playerId)
      : await supabase.from('event_rsvps').insert({ event_id: eventId, player_id: playerId });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  function remove() {
    Alert.alert('Cancelar evento', '¿Seguro que quieres borrarlo?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('events').delete().eq('id', eventId);
          if (error) {
            Alert.alert('Error', error.message);
            return;
          }
          navigation.goBack();
        },
      },
    ]);
  }

  if (loading || !event) {
    return (
      <Screen style={styles.container}>
        <Text>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.meta}>
          {eventLabel(event.type)} · {formatWhen(event.starts_at)}
        </Text>
        {event.leagues ? <Text style={styles.meta}>Liga: {event.leagues.name}</Text> : (
          <Text style={styles.openBadge}>Evento abierto</Text>
        )}

        {event.venues && (
          <Pressable
            style={styles.venueBox}
            onPress={() => navigation.navigate('VenueDetail', { venueId: event.venues!.id })}
          >
            <Text style={styles.venueName}>{event.venues.name}</Text>
            <Text style={styles.meta}>
              {[event.venues.address, event.venues.city].filter(Boolean).join(', ') || 'Sin dirección'}
            </Text>
          </Pressable>
        )}

        {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

        <Pressable style={[styles.button, isGoing && styles.secondaryButton]} onPress={toggleRsvp} disabled={busy}>
          <Text style={styles.buttonText}>{isGoing ? 'Ya no voy' : 'Voy a ir'}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>
          Quién va ({attendees.length})
        </Text>
        {attendees.length === 0 ? (
          <Text style={styles.empty}>Todavía nadie confirma. Sé el primero.</Text>
        ) : (
          attendees.map((a) => (
            <Pressable
              key={a.player_id}
              style={styles.row}
              onPress={() => navigation.navigate('PlayerProfile', { playerId: a.player_id })}
            >
              <Text style={styles.name}>{a.players?.display_name ?? '—'}</Text>
              <Text style={styles.elo}>{Math.round(a.players?.elo_rating ?? 1000)}</Text>
            </Pressable>
          ))
        )}

        {canDelete && (
          <Pressable style={[styles.button, styles.dangerButton]} onPress={remove}>
            <Text style={styles.buttonText}>Cancelar evento</Text>
          </Pressable>
        )}

        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Volver a eventos</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 4 },
  openBadge: { fontSize: 11, color: '#2f5ad6', fontWeight: '700', marginTop: 4 },
  venueBox: { backgroundColor: '#f6f7fb', borderRadius: 8, padding: 12, marginTop: 12 },
  venueName: { fontSize: 14, fontWeight: '600' },
  description: { fontSize: 14, color: '#333', marginTop: 12, lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  name: { flex: 1, fontSize: 14, fontWeight: '600' },
  elo: { fontWeight: '700', color: '#2f5ad6' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  secondaryButton: { backgroundColor: '#444' },
  dangerButton: { backgroundColor: '#b00020' },
  buttonText: { color: '#fff', fontWeight: '600' },
  empty: { color: '#6b6b64', fontSize: 12 },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
