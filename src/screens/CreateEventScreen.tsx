import { useCallback, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import { EVENT_TYPES, EventCode, buildStartsAt } from '../lib/eventTypes';

type Venue = { id: string; name: string };
type League = { league_id: string; role: string; leagues: { name: string } | null };

export default function CreateEventScreen({ navigation }: any) {
  const { playerId, isAdmin } = useAuth();
  const [form, setForm] = useState({ title: '', description: '', date: '', time: '' });
  const [type, setType] = useState<EventCode>('free_play');
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
    // Solo se ofrecen las ligas donde puede crear eventos oficiales; en las demás
    // el insert lo rechazaría la política de la migración 0016.
    setLeagues(((leagueRows as any as League[]) ?? []).filter((l) => isAdmin || l.role === 'organizer'));
  }, [playerId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save() {
    const title = form.title.trim();
    if (!title) {
      Alert.alert('Falta el título', 'Ponle un nombre al evento.');
      return;
    }
    const startsAt = buildStartsAt(form.date, form.time);
    if (!startsAt) {
      Alert.alert('Fecha inválida', 'Usa el formato AAAA-MM-DD para la fecha y HH:MM para la hora.');
      return;
    }

    setBusy(true);
    const { error } = await supabase.from('events').insert({
      title,
      description: form.description.trim() || null,
      type,
      starts_at: startsAt,
      venue_id: venueId,
      league_id: leagueId,
      created_by: playerId,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    navigation.goBack();
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Crear evento</Text>

        <TextInput
          style={styles.input}
          value={form.title}
          onChangeText={(v) => setForm({ ...form, title: v })}
          placeholder="Título"
          placeholderTextColor="#8a8a8a"
        />
        <TextInput
          style={[styles.input, styles.textarea]}
          value={form.description}
          onChangeText={(v) => setForm({ ...form, description: v })}
          placeholder="Descripción (opcional)"
          placeholderTextColor="#8a8a8a"
          multiline
        />

        <Text style={styles.label}>Tipo</Text>
        <View style={styles.rowGap}>
          {EVENT_TYPES.map((t) => (
            <Pressable
              key={t.code}
              style={[styles.choice, type === t.code && styles.choiceSelected]}
              onPress={() => setType(t.code)}
            >
              <Text>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>¿Cuándo?</Text>
        <View style={styles.rowGap}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={form.date}
            onChangeText={(v) => setForm({ ...form, date: v })}
            placeholder="AAAA-MM-DD"
            placeholderTextColor="#8a8a8a"
          />
          <TextInput
            style={[styles.input, { width: 100 }]}
            value={form.time}
            onChangeText={(v) => setForm({ ...form, time: v })}
            placeholder="HH:MM"
            placeholderTextColor="#8a8a8a"
          />
        </View>

        <Text style={styles.label}>¿Dónde? (opcional)</Text>
        <View style={styles.rowGap}>
          {venues.map((v) => (
            <Pressable
              key={v.id}
              style={[styles.choice, venueId === v.id && styles.choiceSelected]}
              onPress={() => setVenueId(venueId === v.id ? null : v.id)}
            >
              <Text>{v.name}</Text>
            </Pressable>
          ))}
          {venues.length === 0 && <Text style={styles.meta}>No hay venues registrados todavía.</Text>}
        </View>

        {leagues.length > 0 && (
          <>
            <Text style={styles.label}>¿Es de alguna liga? (opcional)</Text>
            <Text style={styles.meta}>Si no eliges liga, queda como evento abierto para cualquiera.</Text>
            <View style={styles.rowGap}>
              {leagues.map((l) => (
                <Pressable
                  key={l.league_id}
                  style={[styles.choice, leagueId === l.league_id && styles.choiceSelected]}
                  onPress={() => setLeagueId(leagueId === l.league_id ? null : l.league_id)}
                >
                  <Text>{l.leagues?.name ?? 'Liga'}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Pressable style={styles.button} onPress={save} disabled={busy}>
          <Text style={styles.buttonText}>Crear evento</Text>
        </Pressable>
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Cancelar</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#fff', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  meta: { color: '#6b6b64', fontSize: 12 },
  input: { color: '#1a1a20', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  rowGap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choice: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  choiceSelected: { borderColor: '#2f5ad6', backgroundColor: '#e8edfd' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
