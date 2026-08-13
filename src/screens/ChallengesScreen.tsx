import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type Challenge = {
  id: string;
  status: string;
  match_id: string | null;
  challenger: { id: string; display_name: string } | null;
  challenged: { id: string; display_name: string } | null;
};

export default function ChallengesScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [received, setReceived] = useState<Challenge[]>([]);
  const [sent, setSent] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: recv }, { data: snt }] = await Promise.all([
      supabase
        .from('challenges')
        .select(
          'id, status, match_id, challenger:players!challenges_challenger_id_fkey(id, display_name), challenged:players!challenges_challenged_id_fkey(id, display_name)'
        )
        .eq('challenged_id', playerId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('challenges')
        .select(
          'id, status, match_id, challenger:players!challenges_challenger_id_fkey(id, display_name), challenged:players!challenges_challenged_id_fkey(id, display_name)'
        )
        .eq('challenger_id', playerId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    setLoading(false);
    setReceived((recv as any) ?? []);
    setSent((snt as any) ?? []);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function accept(challengeId: string) {
    setBusy(true);
    const { data, error } = await supabase.rpc('accept_challenge', { p_challenge_id: challengeId });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Reto aceptado', 'Ya pueden jugar. Cuando terminen, reporten el resultado.', [
      { text: 'Ver match', onPress: () => navigation.navigate('MatchDetail', { matchId: data }) },
      { text: 'OK' },
    ]);
    load();
  }

  async function decline(challengeId: string) {
    setBusy(true);
    const { error } = await supabase.from('challenges').update({ status: 'declined' }).eq('id', challengeId);
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function cancelSent(challengeId: string) {
    setBusy(true);
    const { error } = await supabase.from('challenges').update({ status: 'cancelled' }).eq('id', challengeId);
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={received}
        keyExtractor={(c) => c.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        ListHeaderComponent={<Text style={styles.title}>Retos recibidos</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.challenger?.display_name ?? '—'} te retó</Text>
            <View style={styles.actionsRow}>
              <Pressable style={styles.acceptButton} onPress={() => accept(item.id)} disabled={busy}>
                <Text style={styles.actionText}>Aceptar</Text>
              </Pressable>
              <Pressable style={styles.declineButton} onPress={() => decline(item.id)} disabled={busy}>
                <Text style={styles.actionText}>Rechazar</Text>
              </Pressable>
            </View>
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Sin retos pendientes.</Text> : null}
        ListFooterComponent={
          <View>
            <Text style={styles.sectionTitle}>Retos enviados</Text>
            {sent.length === 0 ? (
              <Text style={styles.empty}>No has retado a nadie todavía.</Text>
            ) : (
              sent.map((c) => (
                <View key={c.id} style={styles.card}>
                  <Text style={styles.name}>
                    Retaste a {c.challenged?.display_name ?? '—'} · <Text style={styles.status}>{c.status}</Text>
                  </Text>
                  {c.status === 'pending' && (
                    <Pressable style={styles.declineButton} onPress={() => cancelSent(c.id)} disabled={busy}>
                      <Text style={styles.actionText}>Cancelar</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
            <Pressable style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>‹ Volver</Text>
            </Pressable>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 12, marginBottom: 8 },
  name: { fontSize: 14, fontWeight: '600' },
  status: { fontWeight: '400', color: '#6b6b64', textTransform: 'capitalize' },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  acceptButton: { backgroundColor: '#1f7a4d', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  declineButton: { backgroundColor: '#b00020', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  empty: { color: '#6b6b64', fontSize: 13 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
