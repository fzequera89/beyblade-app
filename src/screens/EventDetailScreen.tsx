import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import { IconCalendar, IconPin } from '../ui/icons';
import { eventLabel } from '../lib/eventTypes';
import { colors, space, type, radius, glow } from '../theme';

type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  league_id: string | null;
  venues: { id: string; name: string; city: string | null; address: string | null } | null;
  leagues: { name: string } | null;
};

type Attendee = {
  player_id: string;
  players: {
    display_name: string;
    elo_rating: number;
    avatar_key: string | null;
    avatar_url: string | null;
  } | null;
};

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
          'id, title, description, type, starts_at, ends_at, created_by, league_id, venues(id, name, city, address), leagues(name)'
        )
        .eq('id', eventId)
        .single(),
      supabase
        .from('event_rsvps')
        .select('player_id, players(display_name, elo_rating, avatar_key, avatar_url)')
        .eq('event_id', eventId),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    setEvent(data as any);
    setAttendees((rsvps as any) ?? []);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !event) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const going = attendees.some((a) => a.player_id === playerId);
  const canDelete = event.created_by === playerId || isAdmin;
  const official = !!event.league_id;
  const start = new Date(event.starts_at);

  async function toggleRsvp() {
    setBusy(true);
    const { error } = going
      ? await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('player_id', playerId)
      : await supabase.from('event_rsvps').insert({ event_id: eventId, player_id: playerId });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  function remove() {
    Alert.alert('Cancelar evento', '¿Seguro que quieres borrarlo? Los asistentes lo perderán de su lista.', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('events').delete().eq('id', eventId);
          if (error) return Alert.alert('Error', error.message);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.headRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.pad}>
        <View style={styles.hero}>
          <Hex size={76} color={official ? colors.streak : colors.blue}>
            <Text style={{ fontSize: 28 }}>{official ? '🏆' : '🌀'}</Text>
          </Hex>
          <Pill
            label={official ? `Oficial · ${event.leagues?.name ?? 'Liga'}` : 'Evento abierto'}
            color={official ? colors.streak : colors.win}
            align="center"
          />
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.typeText}>{eventLabel(event.type)}</Text>
        </View>

        <Card style={{ gap: space.md }}>
          <View style={styles.line}>
            <IconCalendar size={17} color={colors.blue} />
            <View style={{ flex: 1 }}>
              <Text style={styles.lineMain}>
                {start.toLocaleDateString('es-MX', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
              <Text style={styles.lineSub}>
                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {event.ends_at
                  ? ` – ${new Date(event.ends_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : ''}
              </Text>
            </View>
          </View>

          {event.venues && (
            <Pressable
              style={styles.line}
              onPress={() => navigation.navigate('VenueDetail', { venueId: event.venues!.id })}
            >
              <IconPin size={17} color={colors.blue} />
              <View style={{ flex: 1 }}>
                <Text style={styles.lineMain}>{event.venues.name}</Text>
                <Text style={styles.lineSub}>
                  {[event.venues.address, event.venues.city].filter(Boolean).join(', ') || 'Sin dirección'}
                </Text>
              </View>
              <Text style={styles.linkSmall}>Ver ›</Text>
            </Pressable>
          )}
        </Card>

        {event.description ? (
          <Card style={{ marginTop: space.sm }}>
            <Text style={styles.description}>{event.description}</Text>
          </Card>
        ) : null}

        <View style={{ marginTop: space.lg }}>
          <Button
            label={going ? 'YA NO VOY' : 'VOY A IR'}
            variant={going ? 'ghost' : 'primary'}
            onPress={toggleRsvp}
            loading={busy}
          />
        </View>

        <View style={styles.block}>
          <SectionTitle>{`Quién va (${attendees.length})`}</SectionTitle>
          {attendees.length === 0 ? (
            <Card>
              <Text style={type.soft}>Todavía nadie confirma. Sé el primero.</Text>
            </Card>
          ) : (
            <Card style={styles.attendeeGrid}>
              {attendees.map((a) => (
                <Pressable
                  key={a.player_id}
                  style={styles.attendee}
                  onPress={() => navigation.navigate('PlayerProfile', { playerId: a.player_id })}
                >
                  <Avatar
                    uri={a.players?.avatar_url}
                    avatarKey={a.players?.avatar_key}
                    size={46}
                    ring={a.player_id === playerId ? colors.blue : undefined}
                  />
                  <Text style={styles.attendeeName} numberOfLines={1}>
                    {a.player_id === playerId ? 'Tú' : a.players?.display_name ?? '—'}
                  </Text>
                </Pressable>
              ))}
            </Card>
          )}
        </View>

        {canDelete && (
          <View style={{ marginTop: space.xxl }}>
            <Button label="Cancelar evento" variant="danger" onPress={remove} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headRow: { paddingHorizontal: space.xl, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  pad: { paddingHorizontal: space.xl },

  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  title: { ...type.display, fontSize: 24, textAlign: 'center', marginTop: 4 },
  typeText: { fontSize: 12.5, color: colors.inkSoft },

  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  lineMain: { fontSize: 13.5, fontWeight: '700', color: colors.ink, textTransform: 'capitalize' },
  lineSub: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  linkSmall: { fontSize: 12, color: colors.blue, fontWeight: '700' },
  description: { fontSize: 13.5, color: colors.ink, lineHeight: 20 },

  block: { marginTop: space.xxl, gap: space.sm },
  attendeeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  attendee: { alignItems: 'center', gap: 5, width: 62 },
  attendeeName: { fontSize: 10.5, color: colors.inkSoft, textAlign: 'center' },
});
