import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card } from '../ui/primitives';
import { formatVp } from '../lib/categories';
import { colors, space, type, radius } from '../theme';

// Ranking Unificado Interclubes: los VP acumulados CRUZANDO ligas y ciudades.
//
// No es el ELO (habilidad personal, no se resetea) ni la tabla local (posición
// en una liga, por victorias). Aquí el VP sí es la métrica: cada categoría
// aporta distinto, la derrota resta, y el periodo dura ~6 meses.

type Row = {
  player_id: string;
  display_name: string;
  city: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
  vp: number;
  point_diff: number;
  matches_won: number;
  matches_lost: number;
  h2h_wins: number;
  place: number;
};

function rankColor(pos: number) {
  if (pos === 1) return colors.streak;
  if (pos === 2) return '#C3CDDD';
  if (pos === 3) return '#C77B45';
  return colors.inkDim;
}

export default function InterclubScreen({ navigation }: any) {
  const { playerId, isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [periodLabel, setPeriodLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: period }] = await Promise.all([
      supabase.rpc('interclub_ranking_ordered', { p_period_id: null }),
      supabase
        .from('interclub_periods')
        .select('label')
        .is('ended_on', null)
        .order('started_on', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    setRows(((data as any) ?? []) as Row[]);
    setPeriodLabel((period as any)?.label ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const mine = rows.find((r) => r.player_id === playerId);
  const leader = rows[0] ?? null;
  const rest = leader ? rows.slice(1) : rows;

  function confirmReset() {
    Alert.alert(
      'Reiniciar el interclubes',
      'Cierra el periodo actual y abre uno nuevo desde cero. El histórico del periodo que cierras se conserva. ¿Seguro?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Reiniciar',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase.rpc('reset_interclub_ranking', { p_label: null });
            setBusy(false);
            if (error) return Alert.alert('No se pudo reiniciar', error.message);
            load();
          },
        },
      ]
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={rest}
        keyExtractor={(r) => r.player_id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <View style={styles.head}>
              <View style={styles.headRow}>
                <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                  <Text style={styles.back}>‹</Text>
                </Pressable>
                <Text style={styles.title}>Interclubes</Text>
              </View>
              <Text style={styles.sub}>El ranking unificado de VP. Cruza todas las ligas y ciudades.</Text>
              {periodLabel ? (
                <View style={styles.periodPill}>
                  <Text style={styles.periodText}>{periodLabel}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.pad}>
              <Card style={{ marginBottom: space.lg }}>
                <Text style={styles.hint}>
                  Cada combate de ranking suma VP según tu categoría (un Diamante aporta más que un
                  Porcelana) y la derrota resta. Es un sistema aparte del ELO y de la tabla de tu
                  liga: aquí compiten todos los clubes juntos.
                </Text>
              </Card>

              {mine ? (
                <View style={styles.myBox}>
                  <Text style={styles.myLabel}>TU POSICIÓN</Text>
                  <Text style={styles.myPos}>#{mine.place}</Text>
                  <Text style={styles.myOf}>de {rows.length}</Text>
                  <Text style={[styles.myVp, { color: mine.vp >= 0 ? colors.win : colors.loss }]}>
                    {formatVp(mine.vp)} VP
                  </Text>
                </View>
              ) : null}

              {leader ? (
                <Pressable
                  style={styles.leader}
                  onPress={() => navigation.navigate('PlayerProfile', { playerId: leader.player_id })}
                >
                  <View style={styles.crownRow}>
                    <Text style={styles.crown}>👑</Text>
                    <Text style={styles.leaderLabel}>LÍDER INTERCLUBES</Text>
                  </View>
                  <View style={styles.leaderTop}>
                    <Avatar
                      uri={leader.avatar_url}
                      avatarKey={leader.avatar_key}
                      size={72}
                      ring={colors.streak}
                    />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.leaderName} numberOfLines={1}>
                        {leader.display_name}
                      </Text>
                      <Text style={styles.leaderMeta}>{leader.city ?? 'Sin ciudad'}</Text>
                      <Text style={styles.leaderVp}>{formatVp(leader.vp)}</Text>
                      <Text style={styles.leaderVpLabel}>VP</Text>
                    </View>
                  </View>
                  <View style={styles.leaderStats}>
                    <Stat label="Ganados" value={String(leader.matches_won)} tint={colors.win} />
                    <View style={styles.vDiv} />
                    <Stat label="Perdidos" value={String(leader.matches_lost)} />
                    <View style={styles.vDiv} />
                    <Stat label="Dif. puntos" value={formatVp(leader.point_diff)} />
                  </View>
                </Pressable>
              ) : null}

              {rest.length > 0 ? <Text style={styles.listTitle}>TABLA COMPLETA</Text> : null}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const me = item.player_id === playerId;
          return (
            <Card
              style={[styles.row, me && { borderColor: colors.blue }]}
              onPress={() => navigation.navigate('PlayerProfile', { playerId: item.player_id })}
            >
              <Text style={[styles.pos, item.place <= 3 && { color: rankColor(item.place) }]}>
                {item.place}
              </Text>
              <Avatar uri={item.avatar_url} avatarKey={item.avatar_key} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.city ?? 'Sin ciudad'} · {item.matches_won}G–{item.matches_lost}P · dif{' '}
                  {formatVp(item.point_diff)}
                </Text>
              </View>
              <Text style={[styles.vp, { color: item.vp >= 0 ? colors.win : colors.loss }]}>
                {formatVp(item.vp)}
              </Text>
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading && !leader ? (
            <View style={styles.pad}>
              <Card>
                <Text style={type.soft}>
                  Todavía nadie ha sumado VP en este periodo. En cuanto se jueguen combates de
                  ranking con temporada, la tabla se llena sola.
                </Text>
              </Card>
            </View>
          ) : null
        }
        ListFooterComponent={
          isAdmin ? (
            <View style={[styles.pad, { marginTop: space.xl }]}>
              <Button
                label="REINICIAR PERIODO"
                variant="ghost"
                onPress={confirmReset}
                loading={busy}
              />
              <Text style={styles.hint}>
                Cierra el periodo actual y abre uno nuevo. Úsalo cada ~6 meses, según el reglamento.
              </Text>
            </View>
          ) : null
        }
      />
    </Screen>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.statVal, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.lg, gap: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.display, fontSize: 26 },
  sub: { ...type.soft, fontSize: 12.5 },
  periodPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.streak,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  periodText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, color: colors.streak },

  pad: { paddingHorizontal: space.xl },
  hint: { fontSize: 12, color: colors.inkSoft, lineHeight: 17 },
  listTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.inkSoft, marginBottom: space.sm },

  myBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginBottom: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.blueDeep,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.blue,
  },
  myLabel: { ...type.label, fontSize: 9, color: colors.blueHi, flex: 1 },
  myPos: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  myOf: { fontSize: 12, color: colors.inkSoft },
  myVp: { fontSize: 15, fontWeight: '800', fontStyle: 'italic', marginLeft: space.sm },

  leader: {
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.streak,
    borderRadius: radius.lg,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    marginBottom: space.lg,
  },
  crownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crown: { fontSize: 15 },
  leaderLabel: { ...type.label, fontSize: 9.5, color: colors.streak },
  leaderTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  leaderName: { ...type.display, fontSize: 22 },
  leaderMeta: { fontSize: 11.5, color: colors.inkSoft },
  leaderVp: { fontSize: 28, fontWeight: '800', color: colors.streak, marginTop: 4 },
  leaderVpLabel: { fontSize: 9, letterSpacing: 1.4, color: colors.inkDim, marginTop: -4 },
  leaderStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7, color: colors.inkDim },
  statVal: { fontSize: 16, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 26, backgroundColor: colors.line },

  list: { paddingBottom: space.xxxl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    marginHorizontal: space.xl,
    marginBottom: space.sm,
  },
  pos: { width: 26, fontSize: 15, fontWeight: '800', textAlign: 'center', color: colors.inkDim },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  vp: { fontSize: 16, fontWeight: '800', fontStyle: 'italic' },
});
