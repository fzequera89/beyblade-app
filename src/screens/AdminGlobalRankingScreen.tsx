import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Hex } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';
import { PAGE_SIZE, upToPage } from '../lib/paging';

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
  const [page, setPage] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [loading, setLoading] = useState(true);

  // Se pide UNA fila de más que lo que se muestra: es la forma barata de saber
  // si hay siguiente página sin pagar un count sobre toda la tabla.
  const load = useCallback(
    async (hasta = page) => {
      setLoading(true);
      const [desde, hastaFila] = upToPage(hasta);
      const { data, error } = await supabase
        .from('players')
        .select('id, display_name, elo_rating, matches_played, avatar_key, avatar_url')
        .order('elo_rating', { ascending: false })
        .range(desde, hastaFila + 1);
      setLoading(false);
      if (error) {
        alerta('Error', error.message);
        return;
      }
      const filas = data ?? [];
      setHayMas(filas.length > hastaFila - desde + 1);
      setPlayers(filas.slice(0, hastaFila - desde + 1));
    },
    [page]
  );

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
        ListFooterComponent={
          hayMas ? (
            <Pressable
              style={styles.masBtn}
              onPress={() => {
                const siguiente = page + 1;
                setPage(siguiente);
                load(siguiente);
              }}
            >
              <Text style={styles.masText}>VER {PAGE_SIZE} MÁS</Text>
            </Pressable>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  masBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    marginTop: space.sm,
  },
  masText: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkSoft },
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
