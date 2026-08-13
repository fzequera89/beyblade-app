import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { generateRound1Bracket } from '../lib/bracket';

type Registration = {
  player_id: string;
  checked_in_at: string | null;
  players: { display_name: string } | null;
};

export default function TournamentDetailScreen({ route, navigation }: any) {
  const { tournamentId, leagueId, isOrganizer } = route.params;
  const { playerId } = useAuth();
  const [name, setName] = useState('');
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [hasBracket, setHasBracket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: tournament }, { data: regs }, { count: matchCount }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase
        .from('tournament_registrations')
        .select('player_id, checked_in_at, players(display_name)')
        .eq('tournament_id', tournamentId),
      supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('bracket_round', 1),
    ]);
    setLoading(false);
    setName(tournament?.name ?? '');
    setRegistrations((regs as any) ?? []);
    setHasBracket((matchCount ?? 0) > 0);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const myRegistration = registrations.find((r) => r.player_id === playerId);
  const checkedInCount = registrations.filter((r) => r.checked_in_at).length;

  async function register() {
    const { error } = await supabase
      .from('tournament_registrations')
      .insert({ tournament_id: tournamentId, player_id: playerId });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function checkIn() {
    const { error } = await supabase
      .from('tournament_registrations')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function generateBracket() {
    setBusy(true);
    try {
      const { pairsCreated, bye } = await generateRound1Bracket(tournamentId, leagueId);
      Alert.alert(
        'Bracket generado',
        `${pairsCreated} enfrentamiento(s) creados.${bye ? ` ${bye.display_name} pasa directo (bye).` : ''}`
      );
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo generar el bracket');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.meta}>
        {registrations.length} registrado{registrations.length === 1 ? '' : 's'} · {checkedInCount} con check-in
      </Text>

      <View style={styles.actionsRow}>
        {!myRegistration ? (
          <Pressable style={styles.button} onPress={register}>
            <Text style={styles.buttonText}>Registrarme</Text>
          </Pressable>
        ) : myRegistration.checked_in_at ? (
          <Text style={styles.checkedIn}>✓ Check-in hecho</Text>
        ) : (
          <Pressable style={styles.button} onPress={checkIn}>
            <Text style={styles.buttonText}>Hacer check-in</Text>
          </Pressable>
        )}
      </View>

      {isOrganizer && (
        hasBracket ? (
          <Pressable
            style={[styles.button, styles.secondaryButton]}
            onPress={() => navigation.navigate('Bracket', { tournamentId, leagueId, isOrganizer })}
          >
            <Text style={styles.buttonText}>Ver bracket</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.secondaryButton]}
            onPress={generateBracket}
            disabled={busy || checkedInCount < 2}
          >
            <Text style={styles.buttonText}>Generar bracket ({checkedInCount} con check-in)</Text>
          </Pressable>
        )
      )}
      {hasBracket && !isOrganizer && (
        <Pressable
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate('Bracket', { tournamentId, leagueId, isOrganizer })}
        >
          <Text style={styles.buttonText}>Ver bracket</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Jugadores</Text>
      <FlatList
        data={registrations}
        keyExtractor={(r) => r.player_id}
        contentContainerStyle={{ gap: 6 }}
        renderItem={({ item }) => (
          <View style={styles.playerRow}>
            <Text>{item.players?.display_name ?? '—'}</Text>
            {item.checked_in_at ? <Text style={styles.badge}>check-in</Text> : null}
          </View>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Nadie registrado todavía.</Text> : null}
      />

      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Volver a torneos</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6, marginBottom: 12 },
  actionsRow: { marginBottom: 8 },
  checkedIn: { color: '#1f7a4d', fontWeight: '600' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  secondaryButton: { backgroundColor: '#444' },
  buttonText: { color: '#fff', fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  playerRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#eee', paddingVertical: 8 },
  badge: { color: '#2f5ad6', fontSize: 12, fontWeight: '600' },
  empty: { color: '#6b6b64' },
  back: { marginTop: 20 },
  backText: { color: '#6b6b64' },
});
