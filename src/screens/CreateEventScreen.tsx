import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card, Chip, OptionCard, Hex } from '../ui/primitives';
import { IconCalendar } from '../ui/icons';
import { EVENT_TYPES, EventCode, buildStartsAt } from '../lib/eventTypes';
import { colors, space, type, radius } from '../theme';

type Venue = { id: string; name: string };
type League = { league_id: string; role: string; leagues: { name: string } | null };

const TYPE_GLYPH: Record<string, string> = {
  tournament: '🏆',
  league_night: '🌙',
  free_play: '🌀',
  practice_night: '🎯',
  meetup: '🤝',
  club_battle: '🛡️',
  beginner_day: '🌱',
};

// Atajos de fecha: la mayoría de los eventos se agendan para pronto, y escribir
// AAAA-MM-DD a mano es la parte más molesta del formulario.
function dateShortcuts() {
  const out: { label: string; value: string }[] = [];
  for (let i = 0; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const label =
      i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
    out.push({ label, value });
  }
  return out;
}

export default function CreateEventScreen({ navigation }: any) {
  const { playerId, isAdmin } = useAuth();
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '' });
  const [eventType, setEventType] = useState<EventCode>('free_play');
  const [venueId, setVenueId] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: venueRows }, { data: leagueRows }] = await Promise.all([
      supabase.from('venues').select('id, name').order('name'),
      supabase.from('league_members').select('league_id, role, leagues(name)').eq('player_id', playerId),
    ]);
    setVenues((venueRows as any) ?? []);
    // Solo se ofrecen las ligas donde puede crear eventos oficiales; en las
    // demás el insert lo rechazaría la política de la migración 0016.
    setLeagues(((leagueRows as any as League[]) ?? []).filter((l) => isAdmin || l.role === 'organizer'));
  }, [playerId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save() {
    const title = form.title.trim();
    if (!title) return Alert.alert('Falta el título', 'Ponle un nombre al evento.');

    const startsAt = buildStartsAt(form.date, form.time);
    if (!startsAt)
      return Alert.alert('Fecha inválida', 'Usa AAAA-MM-DD para la fecha y HH:MM para la hora.');

    setBusy(true);
    const { error } = await supabase.from('events').insert({
      title,
      description: form.description.trim() || null,
      type: eventType,
      starts_at: startsAt,
      venue_id: venueId,
      league_id: leagueId,
      created_by: playerId,
    });
    setBusy(false);
    if (error) return Alert.alert('No se pudo crear', error.message);
    navigation.goBack();
  }

  const shortcuts = dateShortcuts();

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Crear evento</Text>
      </View>

      <View style={styles.hero}>
        <Hex size={64} color={colors.blue}>
          <IconCalendar size={24} color={colors.blue} />
        </Hex>
        <Text style={styles.lead}>
          {leagues.length > 0
            ? 'Si eliges liga queda como evento oficial; si no, abierto para cualquiera.'
            : 'Tu evento queda abierto: cualquier blader puede apuntarse.'}
        </Text>
      </View>

      <View style={styles.form}>
        <Field
          label="Título"
          placeholder="Juego libre de los martes"
          value={form.title}
          onChangeText={(v) => setForm({ ...form, title: v })}
        />

        <View>
          <Text style={type.label}>Tipo de evento</Text>
          <View style={styles.grid}>
            {EVENT_TYPES.map((t) => (
              <OptionCard
                key={t.code}
                glyph={TYPE_GLYPH[t.code] ?? '🌀'}
                title={t.label}
                selected={eventType === t.code}
                onPress={() => setEventType(t.code)}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>¿Cuándo?</Text>
          <View style={styles.chips}>
            {shortcuts.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                selected={form.date === s.value}
                onPress={() => setForm({ ...form, date: s.value })}
              />
            ))}
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field
                placeholder="AAAA-MM-DD"
                value={form.date}
                onChangeText={(v) => setForm({ ...form, date: v })}
              />
            </View>
            <View style={{ width: 110 }}>
              <Field
                placeholder="HH:MM"
                value={form.time}
                onChangeText={(v) => setForm({ ...form, time: v })}
              />
            </View>
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={type.label}>¿Dónde? (opcional)</Text>
          {venues.length === 0 ? (
            <Text style={styles.note}>No hay venues registrados todavía.</Text>
          ) : (
            <View style={styles.chips}>
              <Chip label="Sin lugar fijo" selected={venueId === null} onPress={() => setVenueId(null)} />
              {venues.map((v) => (
                <Chip
                  key={v.id}
                  label={v.name}
                  selected={venueId === v.id}
                  onPress={() => setVenueId(v.id)}
                />
              ))}
            </View>
          )}
        </View>

        {leagues.length > 0 && (
          <View style={{ gap: space.sm }}>
            <Text style={type.label}>¿Es de alguna liga? (opcional)</Text>
            <View style={styles.chips}>
              <Chip label="Abierto" selected={leagueId === null} onPress={() => setLeagueId(null)} />
              {leagues.map((l) => (
                <Chip
                  key={l.league_id}
                  label={l.leagues?.name ?? 'Liga'}
                  selected={leagueId === l.league_id}
                  onPress={() => setLeagueId(l.league_id)}
                />
              ))}
            </View>
          </View>
        )}

        <Field
          label="Descripción (opcional)"
          placeholder="Sin registro, sin ranking. Caes y juegas."
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          multiline
          style={styles.textarea}
        />

        <Button label="CREAR EVENTO" onPress={save} loading={busy} />
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={{ alignSelf: 'center' }}>
          <Text style={styles.cancel}>Cancelar</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  hero: { alignItems: 'center', gap: space.md, paddingVertical: space.lg },
  lead: { ...type.soft, fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  form: { gap: space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  row: { flexDirection: 'row', gap: space.sm },
  note: { fontSize: 12, color: colors.inkDim },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  cancel: { color: colors.inkSoft, fontSize: 13 },
});
