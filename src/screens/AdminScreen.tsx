import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

export default function AdminScreen({ navigation }: any) {
  const [playerCount, setPlayerCount] = useState(0);
  const [leagueCount, setLeagueCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ count: players }, { count: leagues }, { count: matches }] = await Promise.all([
      supabase.from('players').select('*', { count: 'exact', head: true }),
      supabase.from('leagues').select('*', { count: 'exact', head: true }),
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
    ]);
    setPlayerCount(players ?? 0);
    setLeagueCount(leagues ?? 0);
    setMatchCount(matches ?? 0);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>Panel de administrador</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{loading ? '—' : playerCount}</Text>
          <Text style={styles.statLabel}>Jugadores</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{loading ? '—' : leagueCount}</Text>
          <Text style={styles.statLabel}>Ligas</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{loading ? '—' : matchCount}</Text>
          <Text style={styles.statLabel}>Matches jugados</Text>
        </View>
      </View>

      <Pressable style={styles.card} onPress={() => navigation.navigate('AdminPlayers')}>
        <Text style={styles.cardTitle}>Jugadores</Text>
        <Text style={styles.cardSub}>Ver a todos, registrar jugadores nuevos manualmente</Text>
      </Pressable>

      <Pressable style={styles.card} onPress={() => navigation.navigate('Leagues')}>
        <Text style={styles.cardTitle}>Ligas</Text>
        <Text style={styles.cardSub}>Crear ligas, nombrar moderadores</Text>
      </Pressable>

      <Pressable style={styles.card} onPress={() => navigation.navigate('AdminGlobalRanking')}>
        <Text style={styles.cardTitle}>Ranking global</Text>
        <Text style={styles.cardSub}>Todos los jugadores de la plataforma por ELO</Text>
      </Pressable>

      <Pressable style={styles.back} onPress={() => navigation.navigate('Profile')}>
        <Text style={styles.backText}>‹ Volver a mi perfil</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff', gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 24, fontWeight: '700', color: '#2f5ad6' },
  statLabel: { fontSize: 11, color: '#6b6b64', marginTop: 2 },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSub: { fontSize: 12, color: '#6b6b64', marginTop: 4 },
  back: { marginTop: 8 },
  backText: { color: '#6b6b64' },
});
