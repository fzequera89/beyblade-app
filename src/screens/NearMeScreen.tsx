import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type OtherPlayer = {
  id: string;
  expires_at: string;
  players: { id: string; display_name: string; elo_rating: number; city: string | null } | null;
};

const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: 'Todo el día', minutes: null },
];

export default function NearMeScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [myCity, setMyCity] = useState<string | null>(null);
  const [myExpiresAt, setMyExpiresAt] = useState<string | null>(null);
  const [others, setOthers] = useState<OtherPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();
    const { data: me } = await supabase.from('players').select('city').eq('id', playerId).single();
    const city = me?.city ?? null;
    setMyCity(city);

    const { data: mine } = await supabase
      .from('presence')
      .select('expires_at')
      .eq('player_id', playerId)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setMyExpiresAt(mine?.expires_at ?? null);

    let query = supabase
      .from('presence')
      .select('id, expires_at, players(id, display_name, elo_rating, city)')
      .gt('expires_at', nowIso)
      .neq('player_id', playerId)
      .order('expires_at', { ascending: true });
    const { data: othersData } = await query;
    const filtered = ((othersData as any) ?? []).filter((p: OtherPlayer) =>
      city ? p.players?.city === city : true
    );
    setOthers(filtered);
    setLoading(false);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function activate(minutes: number | null) {
    setBusy(true);
    const now = new Date();
    const expires = minutes
      ? new Date(now.getTime() + minutes * 60 * 1000)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    await supabase.from('presence').delete().eq('player_id', playerId).gt('expires_at', now.toISOString());
    const { error } = await supabase
      .from('presence')
      .insert({ player_id: playerId, status: 'looking_to_play', expires_at: expires.toISOString() });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function cancel() {
    setBusy(true);
    const { error } = await supabase
      .from('presence')
      .delete()
      .eq('player_id', playerId)
      .gt('expires_at', new Date().toISOString());
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function challenge(targetPlayerId: string, targetName: string) {
    const { error } = await supabase
      .from('challenges')
      .insert({ challenger_id: playerId, challenged_id: targetPlayerId });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Reto enviado', `Le mandaste un reto a ${targetName}.`);
  }

  const activeUntil = myExpiresAt ? new Date(myExpiresAt) : null;

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={others}
        keyExtractor={(o) => o.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Bladers Near Me</Text>
              <Pressable onPress={() => navigation.navigate('Challenges')}>
                <Text style={styles.link}>Mis retos ›</Text>
              </Pressable>
            </View>
            <Text style={styles.sub}>{myCity ? `Ciudad: ${myCity}` : 'Define tu ciudad en tu perfil para filtrar mejor.'}</Text>

            {activeUntil ? (
              <View style={styles.activeBox}>
                <Text style={styles.activeText}>
                  Buscando jugar hasta las{' '}
                  {activeUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Pressable style={styles.cancelButton} onPress={cancel} disabled={busy}>
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.durationRow}>
                {DURATIONS.map((d) => (
                  <Pressable key={d.label} style={styles.durationButton} onPress={() => activate(d.minutes)} disabled={busy}>
                    <Text style={styles.durationText}>{d.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Text style={styles.sectionTitle}>Buscando jugar ahora</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.playerName}>{item.players?.display_name ?? '—'}</Text>
              <Text style={styles.playerSub}>{item.players?.city ?? 'Sin ciudad'}</Text>
            </View>
            <Text style={styles.playerElo}>{item.players?.elo_rating ?? 1000}</Text>
            <Pressable
              style={styles.challengeButton}
              onPress={() => item.players && challenge(item.players.id, item.players.display_name)}
            >
              <Text style={styles.challengeButtonText}>Retar</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Nadie está buscando jugar por aquí en este momento.</Text> : null
        }
        ListFooterComponent={
          <Pressable style={styles.back} onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.backText}>‹ Volver a mi perfil</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  link: { color: '#2f5ad6', fontWeight: '600' },
  sub: { color: '#6b6b64', fontSize: 12, marginTop: 4, marginBottom: 12 },
  activeBox: {
    backgroundColor: '#e8edfd',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeText: { color: '#2f5ad6', fontWeight: '600', flex: 1 },
  cancelButton: { backgroundColor: '#b00020', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  cancelButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  durationRow: { flexDirection: 'row', gap: 8 },
  durationButton: { flex: 1, backgroundColor: '#2f5ad6', borderRadius: 8, padding: 12, alignItems: 'center' },
  durationText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  playerName: { fontSize: 14, fontWeight: '600' },
  playerSub: { fontSize: 11, color: '#6b6b64', marginTop: 2 },
  playerElo: { fontWeight: '700', color: '#2f5ad6', marginRight: 8 },
  challengeButton: { backgroundColor: '#2f5ad6', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  challengeButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 20 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
