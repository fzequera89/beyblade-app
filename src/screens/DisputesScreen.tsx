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
  countermark_by: string | null;
  countermark_winner_id: string | null;
  countermark_score_a: number | null;
  countermark_score_b: number | null;
  player_a: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
  player_b: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
};

// En qué estado llega cada combate a la bandeja. El juez necesita distinguir de
// un vistazo lo que solo hay que aprobar de lo que hay que decidir.
function state(r: Row) {
  if (r.status === 'disputed') return { tag: 'EN DISPUTA', color: colors.loss, rank: 0 };
  if (!r.countermark_by) return { tag: 'FALTA LA 2ª MARCA', color: colors.inkDim, rank: 2 };
  const agree =
    r.countermark_winner_id === r.winner_id &&
    r.countermark_score_a === r.score_a &&
    r.countermark_score_b === r.score_b;
  return agree
    ? { tag: 'COINCIDEN', color: colors.win, rank: 1 }
    : { tag: 'NO COINCIDEN', color: colors.streak, rank: 0 };
}

// La bandeja del juez. Desde 0025 ningún resultado queda firme sin su
// aprobación, así que aquí cae TODO lo reportado, no solo las disputas. Se
// ordena por lo que está detenido primero y, dentro de eso, por lo que lleva
// más tiempo esperando: un combate parado tiene a dos personas paradas.
export default function DisputesScreen({ navigation }: any) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // Qué combates puede arbitrar ESTE juez lo decide el servidor, con la misma
    // función que después acepta o rechaza el fallo. Antes se listaban TODAS las
    // disputas de la plataforma, incluidas las de combates que el propio juez
    // está jugando — y en esas no puede hacer nada.
    const { data: ids } = await supabase.rpc('arbitrable_match_ids');
    const list = (ids as string[]) ?? [];
    if (list.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('matches')
      .select(
        'id, score_a, score_b, status, reported_at, winner_id, player_a_id, player_b_id, countermark_by, countermark_winner_id, countermark_score_a, countermark_score_b, player_a:players!matches_player_a_id_fkey(display_name, avatar_key, avatar_url), player_b:players!matches_player_b_id_fkey(display_name, avatar_key, avatar_url)'
      )
      .in('id', list)
      .order('reported_at', { ascending: true });

    // Lo trabado va primero; dentro de cada grupo se respeta el orden por
    // antigüedad que ya trajo la consulta.
    const sorted = (((data as any) ?? []) as Row[]).sort((a, b) => state(a).rank - state(b).rank);
    setRows(sorted);
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
              <Text style={styles.title}>Por arbitrar</Text>
            </View>
            <Text style={styles.sub}>
              {rows.length > 0
                ? 'Ningún resultado cuenta para el ELO hasta que lo apruebes.'
                : 'Nada pendiente de arbitrar.'}
            </Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const st = state(item);
          // Tratamiento de héroe solo si de verdad es lo más urgente: la
          // primera tarjeta cuando lo primero está trabado. Si arriba hay algo
          // que solo falta aprobar, destacarlo le inventaría urgencia.
          const hero = index === 0 && st.rank === 0;
          return (
            <Card
              style={[styles.row, hero && { borderColor: st.color }]}
              onPress={() => navigation.navigate('MatchDetail', { matchId: item.id })}
            >
              {hero && <Text style={[styles.oldest, { color: st.color }]}>LO QUE MÁS LLEVA DETENIDO</Text>}
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
                  <Text style={[styles.vs, { color: st.color }]}>{st.tag}</Text>
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
                <Text style={[styles.cta, { color: st.color }]}>
                  {st.rank === 1 ? 'Aprobar ›' : 'Arbitrar ›'}
                </Text>
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
              <Text style={styles.emptyTitle}>Nada por aprobar</Text>
              <Text style={styles.emptyText}>
                Cada resultado que reporten los jugadores va a aparecer aquí esperando tu
                aprobación.
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
