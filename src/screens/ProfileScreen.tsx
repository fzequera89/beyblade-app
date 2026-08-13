import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  country: string | null;
  main_beyblade: string | null;
  play_style: string | null;
  elo_rating: number;
  matches_played: number;
};

type HistoryMatch = {
  id: string;
  score_a: number;
  score_b: number;
  player_a_id: string;
  winner_id: string | null;
  elo_a_change: number | null;
  elo_b_change: number | null;
  confirmed_at: string | null;
  player_a: { display_name: string } | null;
  player_b: { display_name: string } | null;
};

export default function ProfileScreen({ navigation }: any) {
  const { session } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: '', city: '', main_beyblade: '', play_style: '' });
  const [history, setHistory] = useState<HistoryMatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('players')
      .select('id, display_name, city, country, main_beyblade, play_style, elo_rating, matches_played')
      .eq('auth_user_id', session!.user.id)
      .single();
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setPlayer(data);
    setForm({
      display_name: data.display_name ?? '',
      city: data.city ?? '',
      main_beyblade: data.main_beyblade ?? '',
      play_style: data.play_style ?? '',
    });

    const { data: matches } = await supabase
      .from('matches')
      .select(
        'id, score_a, score_b, player_a_id, winner_id, elo_a_change, elo_b_change, confirmed_at, player_a:players!matches_player_a_id_fkey(display_name), player_b:players!matches_player_b_id_fkey(display_name)'
      )
      .or(`player_a_id.eq.${data.id},player_b_id.eq.${data.id}`)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
      .limit(20);
    setHistory((matches as any) ?? []);
  }

  async function save() {
    if (!player) return;
    const { error } = await supabase
      .from('players')
      .update({
        display_name: form.display_name.trim(),
        city: form.city.trim() || null,
        main_beyblade: form.main_beyblade.trim() || null,
        play_style: form.play_style.trim() || null,
      })
      .eq('id', player.id);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setEditing(false);
    load();
  }

  if (loading || !player) {
    return (
      <View style={styles.container}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.avatar} />
      {editing ? (
        <>
          <TextInput
            style={styles.input}
            value={form.display_name}
            onChangeText={(v) => setForm({ ...form, display_name: v })}
            placeholder="Nombre"
          />
          <TextInput
            style={styles.input}
            value={form.city}
            onChangeText={(v) => setForm({ ...form, city: v })}
            placeholder="Ciudad"
          />
          <TextInput
            style={styles.input}
            value={form.main_beyblade}
            onChangeText={(v) => setForm({ ...form, main_beyblade: v })}
            placeholder="Main Beyblade"
          />
          <TextInput
            style={styles.input}
            value={form.play_style}
            onChangeText={(v) => setForm({ ...form, play_style: v })}
            placeholder="Estilo de juego"
          />
          <Pressable style={styles.button} onPress={save}>
            <Text style={styles.buttonText}>Guardar</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.name}>{player.display_name}</Text>
          <Text style={styles.sub}>
            {[player.city, player.country].filter(Boolean).join(', ') || 'Ubicación no definida'}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{player.elo_rating}</Text>
              <Text style={styles.statLabel}>ELO</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{player.matches_played}</Text>
              <Text style={styles.statLabel}>Matches</Text>
            </View>
          </View>
          {player.main_beyblade ? <Text style={styles.field}>Main: {player.main_beyblade}</Text> : null}
          {player.play_style ? <Text style={styles.field}>Estilo: {player.play_style}</Text> : null}
          <Pressable style={styles.button} onPress={() => setEditing(true)}>
            <Text style={styles.buttonText}>Editar perfil</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => navigation.navigate('Leagues')}>
            <Text style={styles.buttonText}>Mis ligas</Text>
          </Pressable>

          {history.length > 0 && (
            <View style={{ width: '100%', marginTop: 20 }}>
              <Text style={styles.sectionTitle}>Historial</Text>
              {history.map((m) => {
                const isA = m.player_a_id === player.id;
                const opponent = isA ? m.player_b?.display_name : m.player_a?.display_name;
                const won = m.winner_id === player.id;
                const myChange = isA ? m.elo_a_change : m.elo_b_change;
                return (
                  <View key={m.id} style={styles.historyRow}>
                    <Text style={won ? styles.win : styles.loss}>{won ? 'W' : 'L'}</Text>
                    <Text style={styles.historyOpponent}>vs {opponent ?? '—'}</Text>
                    <Text style={styles.historyScore}>
                      {m.score_a}-{m.score_b}
                    </Text>
                    <Text style={won ? styles.win : styles.loss}>
                      {(myChange ?? 0) >= 0 ? '+' : ''}
                      {myChange}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
      <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', padding: 24, gap: 10, backgroundColor: '#fff' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e8edfd', marginBottom: 8 },
  name: { fontSize: 22, fontWeight: '700' },
  sub: { color: '#6b6b64' },
  statsRow: { flexDirection: 'row', gap: 24, marginVertical: 12 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 12, color: '#6b6b64' },
  field: { fontSize: 14, color: '#333' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
    width: '100%',
  },
  historyOpponent: { flex: 1, fontSize: 13 },
  historyScore: { fontSize: 12, color: '#6b6b64' },
  win: { color: '#1f7a4d', fontWeight: '700' },
  loss: { color: '#b00020', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, width: '100%' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12, width: '100%' },
  secondaryButton: { backgroundColor: '#444' },
  buttonText: { color: '#fff', fontWeight: '600' },
  signOut: { marginTop: 24 },
  signOutText: { color: '#b00020' },
});
