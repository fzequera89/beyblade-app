import { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type Club = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  club_members: { count: number }[];
};

export default function ClubsScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [myClubIds, setMyClubIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: mine }] = await Promise.all([
      supabase.from('clubs').select('id, name, city, description, club_members(count)').order('name'),
      supabase.from('club_members').select('club_id').eq('player_id', playerId),
    ]);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setClubs((data as any) ?? []);
    setMyClubIds(((mine as any[]) ?? []).map((m) => m.club_id));
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function create() {
    const name = form.name.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'Ponle nombre al club.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('clubs').insert({
      name,
      city: form.city.trim() || null,
      description: form.description.trim() || null,
      owner_player_id: playerId,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setForm({ name: '', city: '', description: '' });
    setCreating(false);
    load();
  }

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={clubs}
        keyExtractor={(c) => c.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>Clubes</Text>
            <Text style={styles.meta}>El equipo con el que compites. Cualquiera puede fundar uno.</Text>

            {creating ? (
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                  placeholder="Nombre del club"
                  placeholderTextColor="#8a8a8a"
                />
                <TextInput
                  style={styles.input}
                  value={form.city}
                  onChangeText={(v) => setForm({ ...form, city: v })}
                  placeholder="Ciudad"
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
                <View style={styles.rowGap}>
                  <Pressable style={styles.button} onPress={create} disabled={busy}>
                    <Text style={styles.buttonText}>Fundar club</Text>
                  </Pressable>
                  <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => setCreating(false)}>
                    <Text style={styles.buttonText}>Cancelar</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable style={styles.button} onPress={() => setCreating(true)}>
                <Text style={styles.buttonText}>Fundar un club</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('ClubDetail', { clubId: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>
                {item.city ?? 'Sin ciudad'} · {item.club_members?.[0]?.count ?? 0} miembro
                {(item.club_members?.[0]?.count ?? 0) === 1 ? '' : 's'}
              </Text>
            </View>
            {myClubIds.includes(item.id) && <Text style={styles.badge}>Miembro</Text>}
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Todavía no hay clubes. Funda el primero.</Text> : null
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
  form: { gap: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  textarea: { minHeight: 70, textAlignVertical: 'top' },
  rowGap: { flexDirection: 'row', gap: 8 },
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
  badge: { fontSize: 11, color: '#2f5ad6', fontWeight: '700' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12, flex: 1 },
  secondaryButton: { backgroundColor: '#444' },
  buttonText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
