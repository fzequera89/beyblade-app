import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type Person = { id: string; display_name: string; elo_rating: number; city: string | null };

export default function FollowsScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [tab, setTab] = useState<'following' | 'followers'>('following');
  const [following, setFollowing] = useState<Person[]>([]);
  const [followers, setFollowers] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: out, error }, { data: incoming }] = await Promise.all([
      supabase
        .from('follows')
        .select('followee:players!follows_followee_id_fkey(id, display_name, elo_rating, city)')
        .eq('follower_id', playerId),
      supabase
        .from('follows')
        .select('follower:players!follows_follower_id_fkey(id, display_name, elo_rating, city)')
        .eq('followee_id', playerId),
    ]);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setFollowing(((out as any[]) ?? []).map((r) => r.followee).filter(Boolean));
    setFollowers(((incoming as any[]) ?? []).map((r) => r.follower).filter(Boolean));
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const data = tab === 'following' ? following : followers;

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={data}
        keyExtractor={(p) => p.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>Mi gente</Text>
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, tab === 'following' && styles.tabActive]}
                onPress={() => setTab('following')}
              >
                <Text style={tab === 'following' ? styles.tabTextActive : styles.tabText}>
                  Siguiendo ({following.length})
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, tab === 'followers' && styles.tabActive]}
                onPress={() => setTab('followers')}
              >
                <Text style={tab === 'followers' ? styles.tabTextActive : styles.tabText}>
                  Seguidores ({followers.length})
                </Text>
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('PlayerProfile', { playerId: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.display_name}</Text>
              {item.city ? <Text style={styles.sub}>{item.city}</Text> : null}
            </View>
            <Text style={styles.elo}>{Math.round(item.elo_rating)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              {tab === 'following'
                ? 'Todavía no sigues a nadie. Busca jugadores en Bladers Near Me o en el ranking.'
                : 'Nadie te sigue todavía.'}
            </Text>
          ) : null
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
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tab: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  tabActive: { borderColor: '#2f5ad6', backgroundColor: '#e8edfd' },
  tabText: { fontSize: 12, color: '#6b6b64' },
  tabTextActive: { fontSize: 12, color: '#2f5ad6', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 12,
  },
  name: { fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 12, color: '#6b6b64', marginTop: 2 },
  elo: { fontWeight: '700', color: '#2f5ad6' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
