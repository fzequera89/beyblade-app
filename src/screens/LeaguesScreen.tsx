import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type LeagueRow = {
  id: string;
  name: string;
  description: string | null;
  role: 'member' | 'organizer' | null;
  myRank: number | null;
  memberCount: number;
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

    // Multi-liga (5.1): la posición en cada liga se calcula ordenando a sus
    // miembros por el rating GLOBAL. No hay un ELO por liga — la vista por liga
    // es un filtro de lectura sobre el mismo rating (decisión 7 de PROGRESS.md).
    const myLeagueIds = [...roleByLeague.keys()];
    const rankByLeague = new Map<string, number>();
    const countByLeague = new Map<string, number>();

    if (myLeagueIds.length > 0) {
      const { data: rosters } = await supabase
        .from('league_members')
        .select('league_id, player_id, players(elo_rating)')
        .in('league_id', myLeagueIds);

      const byLeague = new Map<string, { player_id: string; elo: number }[]>();
      for (const row of ((rosters as any[]) ?? [])) {
        const list = byLeague.get(row.league_id) ?? [];
        list.push({ player_id: row.player_id, elo: row.players?.elo_rating ?? 1000 });
        byLeague.set(row.league_id, list);
      }
      for (const [leagueId, list] of byLeague) {
        list.sort((a, b) => b.elo - a.elo);
        countByLeague.set(leagueId, list.length);
        const index = list.findIndex((p) => p.player_id === playerId);
        if (index >= 0) rankByLeague.set(leagueId, index + 1);
      }
    }

    setLeagues(
      (allLeagues ?? []).map((l) => ({
        ...l,
        role: roleByLeague.get(l.id) ?? null,
        myRank: rankByLeague.get(l.id) ?? null,
        memberCount: countByLeague.get(l.id) ?? 0,
      }))
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
    <Screen style={styles.container}>
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
              {item.myRank ? (
                <Text style={styles.rankLine}>
                  Vas #{item.myRank} de {item.memberCount}
                </Text>
              ) : null}
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
    </Screen>
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
  rankLine: { color: '#2f5ad6', fontSize: 12, fontWeight: '600', marginTop: 4 },
  badge: { fontSize: 12, color: '#2f5ad6', fontWeight: '600' },
  joinButton: { backgroundColor: '#2f5ad6', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 },
  joinButtonText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#2f5ad6' },
});
