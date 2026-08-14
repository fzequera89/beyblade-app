import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Hex } from '../ui/primitives';
import { colors, space, type } from '../theme';

type Row = {
  id: string;
  score_a: number;
  score_b: number;
  status: string;
  reported_at: string | null;
  winner_id: string | null;
  player_a_id: string;
  player_b_id: string;
  player_a: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
  player_b: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
};

// La bandeja del juez. Un combate en disputa está detenido: nadie puede seguir
// hasta que alguien falle, así que aquí se ordenan por el que lleva más tiempo
// esperando, no por el más reciente.
export default function DisputesScreen({ navigation }: any) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('matches')
      .select(
        'id, score_a, score_b, status, reported_at, winner_id, player_a_id, player_b_id, player_a:players!matches_player_a_id_fkey(display_name, avatar_key, avatar_url), player_b:players!matches_player_b_id_fkey(display_name, avatar_key, avatar_url)'
      )
      .eq('status', 'disputed')
      .order('reported_at', { ascending: true });
    setRows((data as any) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function waiting(iso: string | null) {
    if (!iso) return 'sin fecha';
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (h < 1) return 'menos de 1 h esperando';
    if (h < 24) return `${h} h esperando`;
    return `${Math.floor(h / 24)} d esperando`;
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Disputas</Text>
            </View>
            <Text style={styles.sub}>
              {rows.length > 0
                ? 'Combates detenidos esperando el fallo de un juez.'
                : 'Nada pendiente de arbitrar.'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const hero = index === 0;
          return (
            <Card
              style={[styles.row, hero && { borderColor: colors.loss }]}
              onPress={() => navigation.navigate('MatchDetail', { matchId: item.id })}
            >
              {hero && <Text style={styles.oldest}>LA QUE MÁS LLEVA ESPERANDO</Text>}
              <View style={styles.duel}>
                <View style={styles.side}>
                  <Avatar
                    uri={item.player_a?.avatar_url}
                    avatarKey={item.player_a?.avatar_key}
                    size={hero ? 48 : 38}
                  />
                  <Text style={styles.name} numberOfLines={1}>
                    {item.player_a?.display_name ?? '—'}
                  </Text>
                </View>
                <View style={styles.mid}>
                  <Text style={styles.score}>
                    {item.score_a}–{item.score_b}
                  </Text>
                  <Text style={styles.vs}>EN DISPUTA</Text>
                </View>
                <View style={styles.side}>
                  <Avatar
                    uri={item.player_b?.avatar_url}
                    avatarKey={item.player_b?.avatar_key}
                    size={hero ? 48 : 38}
                  />
                  <Text style={styles.name} numberOfLines={1}>
                    {item.player_b?.display_name ?? '—'}
                  </Text>
                </View>
              </View>
              <View style={styles.foot}>
                <Text style={styles.meta}>{waiting(item.reported_at)}</Text>
                <Text style={styles.cta}>Arbitrar ›</Text>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={50} color={colors.win}>
                <Text style={{ fontSize: 19 }}>✓</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Sin disputas</Text>
              <Text style={styles.emptyText}>
                Cuando dos jugadores no coincidan en un resultado, el combate aparece aquí.
              </Text>
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

  row: { gap: space.md },
  oldest: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.loss },
  duel: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  side: { flex: 1, alignItems: 'center', gap: 5 },
  name: { fontSize: 12, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  mid: { alignItems: 'center', gap: 2, paddingHorizontal: space.sm },
  score: { fontSize: 20, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  vs: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.loss },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  meta: { fontSize: 11.5, color: colors.inkSoft },
  cta: { fontSize: 12, fontWeight: '800', color: colors.loss },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  emptyText: { ...type.soft, fontSize: 12, textAlign: 'center' },
});
