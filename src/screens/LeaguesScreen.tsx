import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type LeagueRow = {
  id: string;
  name: string;
  description: string | null;
  role: 'member' | 'organizer' | null;
};

export default function LeaguesScreen({ navigation }: any) {
  const { playerId, isAdmin } = useAuth();
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: allLeagues, error: leaguesError }, { data: memberships }] = await Promise.all([
      supabase.from('leagues').select('id, name, description').order('created_at', { ascending: false }),
      supabase.from('league_members').select('league_id, role').eq('player_id', playerId),
    ]);
    setLoading(false);
    if (leaguesError) {
      Alert.alert('Error', leaguesError.message);
      return;
    }
    const roleByLeague = new Map((memberships ?? []).map((m) => [m.league_id, m.role]));
    setLeagues(
      (allLeagues ?? []).map((l) => ({ ...l, role: roleByLeague.get(l.id) ?? null }))
    );
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function join(leagueId: string) {
    const { error } = await supabase
      .from('league_members')
      .insert({ league_id: leagueId, player_id: playerId, role: 'member' });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ligas</Text>
        {isAdmin && (
          <Pressable style={styles.createButton} onPress={() => navigation.navigate('CreateLeague')}>
            <Text style={styles.createButtonText}>+ Crear liga</Text>
          </Pressable>
        )}
      </View>
      <FlatList
        data={leagues}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('LeagueDetail', { leagueId: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              {item.description ? <Text style={styles.cardSub}>{item.description}</Text> : null}
            </View>
            {item.role ? (
              <Text style={styles.badge}>{item.role === 'organizer' ? 'Moderador' : 'Miembro'}</Text>
            ) : (
              <Pressable style={styles.joinButton} onPress={() => join(item.id)}>
                <Text style={styles.joinButtonText}>Unirme</Text>
              </Pressable>
            )}
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              {isAdmin ? 'Todavía no hay ligas. Crea la primera.' : 'Todavía no hay ligas activas.'}
            </Text>
          ) : null
        }
      />
      <Pressable style={styles.back} onPress={() => navigation.navigate('Profile')}>
        <Text style={styles.backText}>‹ Volver a mi perfil</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  createButton: { backgroundColor: '#2f5ad6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { color: '#6b6b64', fontSize: 13, marginTop: 2 },
  badge: { fontSize: 12, color: '#2f5ad6', fontWeight: '600' },
  joinButton: { backgroundColor: '#2f5ad6', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  joinButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#2f5ad6' },
});
