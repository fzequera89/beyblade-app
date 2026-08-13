import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type Club = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  owner_player_id: string | null;
};

type Member = { player_id: string; players: { display_name: string; elo_rating: number } | null };

export default function ClubDetailScreen({ route, navigation }: any) {
  const { clubId } = route.params;
  const { playerId, isAdmin } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: roster }] = await Promise.all([
      supabase.from('clubs').select('id, name, city, description, owner_player_id').eq('id', clubId).single(),
      supabase.from('club_members').select('player_id, players(display_name, elo_rating)').eq('club_id', clubId),
    ]);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setClub(data as any);
    // El roster se ordena por ELO: es el ranking interno del club.
    const sorted = ((roster as any as Member[]) ?? []).sort(
      (a, b) => (b.players?.elo_rating ?? 0) - (a.players?.elo_rating ?? 0)
    );
    setMembers(sorted);
  }, [clubId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isMember = members.some((m) => m.player_id === playerId);
  const isOwner = club?.owner_player_id === playerId;

  async function toggleMembership() {
    if (isOwner) {
      Alert.alert('Eres el fundador', 'Para salir tendrías que borrar el club o pasarlo a otra persona.');
      return;
    }
    setBusy(true);
    const { error } = isMember
      ? await supabase.from('club_members').delete().eq('club_id', clubId).eq('player_id', playerId)
      : await supabase.from('club_members').insert({ club_id: clubId, player_id: playerId });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  function remove() {
    Alert.alert('Borrar club', `¿Seguro que quieres borrar "${club?.name}"?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('clubs').delete().eq('id', clubId);
          if (error) {
            Alert.alert('Error', error.message);
            return;
          }
          navigation.goBack();
        },
      },
    ]);
  }

  if (loading || !club) {
    return (
      <Screen style={styles.container}>
        <Text>Cargando…</Text>
      </Screen>
    );
  }

  const avgElo =
    members.length > 0
      ? Math.round(members.reduce((sum, m) => sum + (m.players?.elo_rating ?? 1000), 0) / members.length)
      : 1000;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{club.name}</Text>
        <Text style={styles.meta}>{club.city ?? 'Sin ciudad'}</Text>
        {club.description ? <Text style={styles.description}>{club.description}</Text> : null}

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{members.length}</Text>
            <Text style={styles.statLabel}>Miembros</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{avgElo}</Text>
            <Text style={styles.statLabel}>ELO promedio</Text>
          </View>
        </View>

        <Pressable
          style={[styles.button, isMember && styles.secondaryButton]}
          onPress={toggleMembership}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{isMember ? 'Salir del club' : 'Unirme al club'}</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>Roster</Text>
        {members.map((m, i) => (
          <Pressable
            key={m.player_id}
            style={styles.row}
            onPress={() => navigation.navigate('PlayerProfile', { playerId: m.player_id })}
          >
            <Text style={styles.rank}>#{i + 1}</Text>
            <Text style={styles.name}>{m.players?.display_name ?? '—'}</Text>
            {m.player_id === club.owner_player_id && <Text style={styles.ownerBadge}>Fundador</Text>}
            <Text style={styles.elo}>{Math.round(m.players?.elo_rating ?? 1000)}</Text>
          </Pressable>
        ))}

        {(isOwner || isAdmin) && (
          <Pressable style={[styles.button, styles.dangerButton]} onPress={remove}>
            <Text style={styles.buttonText}>Borrar club</Text>
          </Pressable>
        )}

        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Volver a clubes</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 4 },
  description: { fontSize: 14, color: '#333', marginTop: 12, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 32, marginVertical: 16, justifyContent: 'center' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#6b6b64' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  rank: { width: 32, fontWeight: '700', color: '#6b6b64' },
  name: { flex: 1, fontSize: 14, fontWeight: '600' },
  ownerBadge: { fontSize: 10, color: '#2f5ad6', fontWeight: '700' },
  elo: { fontWeight: '700', color: '#2f5ad6' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  secondaryButton: { backgroundColor: '#444' },
  dangerButton: { backgroundColor: '#b00020' },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
