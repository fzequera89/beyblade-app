import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Hex } from '../ui/primitives';
import { colors, space, type } from '../theme';

type PlayerRow = {
  id: string;
  display_name: string;
  elo_rating: number;
  matches_played: number;
  avatar_key: string | null;
  avatar_url: string | null;
};

function medal(pos: number) {
  if (pos === 1) return colors.streak;
  if (pos === 2) return '#C3CDDD';
  if (pos === 3) return '#C77B45';
  return colors.inkDim;
}

export default function AdminGlobalRankingScreen({ navigation }: any) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('players')
      .select('id, display_name, elo_rating, matches_played, avatar_key, avatar_url')
      .order('elo_rating', { ascending: false });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setPlayers(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Contender = el top 5 del ranking completo. Aquí se marca para que el admin
  // vea de un golpe quiénes son.
  const CONTENDER = 5;

  return (
    <Screen padded={false}>
      <FlatList
        data={players}
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
              <Text style={styles.title}>Ranking global</Text>
            </View>
            <Text style={styles.sub}>
              {players.length} jugador{players.length === 1 ? '' : 'es'} · los 5 primeros son Contender.
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const pos = index + 1;
          const contender = pos <= CONTENDER;
          return (
            <Card
              style={[styles.row, contender && { borderColor: colors.elite }]}
              onPress={() => navigation.navigate('PlayerProfile', { playerId: item.id })}
            >
              <Text style={[styles.pos, { color: medal(pos) }]}>{pos}</Text>
              <Avatar
                uri={item.avatar_url}
                avatarKey={item.avatar_key}
                size={38}
                ring={pos <= 3 ? medal(pos) : contender ? colors.elite : undefined}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text style={styles.meta}>{item.matches_played} batallas</Text>
              </View>
              <Text style={styles.elo}>{Math.round(item.elo_rating)}</Text>
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={50} color={colors.inkDim}>
                <Text style={{ fontSize: 19 }}>📊</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Sin jugadores todavía</Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.sm, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  sub: { ...type.soft, fontSize: 12.5 },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pos: { width: 24, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  elo: { fontSize: 14.5, fontWeight: '800', color: colors.blue },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
