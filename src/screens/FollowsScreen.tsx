import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Hex } from '../ui/primitives';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius } from '../theme';

type Person = {
  id: string;
  display_name: string;
  elo_rating: number;
  city: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
};

const P = 'id, display_name, elo_rating, city, avatar_key, avatar_url';

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
        .select(`followee:players!follows_followee_id_fkey(${P})`)
        .eq('follower_id', playerId),
      supabase
        .from('follows')
        .select(`follower:players!follows_follower_id_fkey(${P})`)
        .eq('followee_id', playerId),
    ]);
    setLoading(false);
    if (error) {
      alerta('Error', error.message);
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
  // Quién te sigue y a quién no sigues de vuelta: es lo que hace útil la pestaña
  // de seguidores, si no es una lista de nombres sin acción.
  const followingIds = new Set(following.map((p) => p.id));

  return (
    <Screen padded={false}>
      <FlatList
        data={data}
        keyExtractor={(p) => p.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Mi gente</Text>
            </View>

            <View style={styles.tabs}>
              <Tab
                label="Siguiendo"
                count={following.length}
                active={tab === 'following'}
                onPress={() => setTab('following')}
              />
              <Tab
                label="Seguidores"
                count={followers.length}
                active={tab === 'followers'}
                onPress={() => setTab('followers')}
              />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Card
            style={styles.row}
            onPress={() => navigation.navigate('PlayerProfile', { playerId: item.id })}
          >
            <Avatar uri={item.avatar_url} avatarKey={item.avatar_key} size={44} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.display_name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {Math.round(item.elo_rating)} ELO{item.city ? ` · ${item.city}` : ''}
              </Text>
            </View>
            {tab === 'followers' && !followingIds.has(item.id) && (
              <Text style={styles.hint}>No lo sigues</Text>
            )}
            <IconChevron />
          </Card>
        )}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={50} color={colors.inkDim}>
                <Text style={{ fontSize: 19 }}>{tab === 'following' ? '👥' : '👋'}</Text>
              </Hex>
              <Text style={styles.emptyTitle}>
                {tab === 'following' ? 'No sigues a nadie' : 'Nadie te sigue todavía'}
              </Text>
              <Text style={styles.emptyText}>
                {tab === 'following'
                  ? 'Busca bladers en Play o en el ranking y síguelos para ver su actividad.'
                  : 'Compite y comparte tu perfil: los seguidores llegan solos.'}
              </Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

function Tab({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      <Text style={[styles.tabCount, active && styles.tabCountActive]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },

  tabs: { flexDirection: 'row', gap: space.sm },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: 10,
  },
  tabActive: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  tabText: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },
  tabTextActive: { color: colors.ink },
  tabCount: { fontSize: 12, fontWeight: '800', color: colors.inkDim },
  tabCountActive: { color: colors.blueHi },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  hint: { fontSize: 10, color: colors.inkDim },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  emptyText: { ...type.soft, fontSize: 12, textAlign: 'center' },
});
