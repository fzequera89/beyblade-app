import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import { Card, Hex } from '../ui/primitives';
import { badgeIcon } from '../lib/badges';
import { colors, space, type, radius } from '../theme';

type Badge = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  earned_at: string | null;
};

export default function BadgesScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: catalog, error }, { data: mine }] = await Promise.all([
      supabase.from('badges').select('id, code, name, description'),
      supabase.from('player_badges').select('badge_id, earned_at').eq('player_id', playerId),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);

    const earnedAt = new Map<string, string>();
    for (const row of ((mine as any[]) ?? [])) earnedAt.set(row.badge_id, row.earned_at);

    // Los obtenidos primero: la vitrina es lo que el jugador quiere ver.
    const merged = ((catalog as any[]) ?? [])
      .map((b) => ({ ...b, earned_at: earnedAt.get(b.id) ?? null }))
      .sort((a, b) => {
        if (!!a.earned_at === !!b.earned_at) return a.name.localeCompare(b.name);
        return a.earned_at ? -1 : 1;
      });
    setBadges(merged);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const earned = badges.filter((b) => b.earned_at);
  const locked = badges.filter((b) => !b.earned_at);
  const pct = badges.length > 0 ? Math.round((earned.length / badges.length) * 100) : 0;

  return (
    <Screen padded={false}>
      <FlatList
        data={badges}
        keyExtractor={(b) => b.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Mis logros</Text>
            </View>

            <Card style={styles.progress}>
              <View style={styles.progressTop}>
                <Text style={styles.progressVal}>
                  {earned.length}
                  <Text style={styles.progressOf}> / {badges.length}</Text>
                </Text>
                <Text style={styles.progressPct}>{pct}%</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.note}>
                Se otorgan solos al confirmar una batalla. No hay que reclamarlos.
              </Text>
            </Card>

            {locked.length > 0 && earned.length > 0 && (
              <Text style={styles.divider}>
                {earned.length} desbloqueado{earned.length === 1 ? '' : 's'} · {locked.length} por conseguir
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const on = !!item.earned_at;
          return (
            <Card style={[styles.badge, !on && styles.locked]}>
              <Hex size={52} color={on ? colors.streak : colors.inkDim}>
                <Text style={[styles.glyph, !on && { opacity: 0.35 }]}>{badgeIcon(item.code)}</Text>
              </Hex>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.name, !on && { color: colors.inkSoft }]}>{item.name}</Text>
                <Text style={styles.desc}>{item.description}</Text>
              </View>
              {on ? (
                <View style={styles.dateBox}>
                  <Text style={styles.check}>✓</Text>
                  <Text style={styles.date}>{new Date(item.earned_at!).toLocaleDateString()}</Text>
                </View>
              ) : (
                <Text style={styles.lock}>🔒</Text>
              )}
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card>
              <Text style={type.soft}>
                El catálogo de logros está vacío. Falta correr la migración 0015 en Supabase.
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
  header: { gap: space.lg, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },

  progress: { gap: space.md },
  progressTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  progressVal: { fontSize: 28, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  progressOf: { fontSize: 16, color: colors.inkDim, fontStyle: 'normal' },
  progressPct: { fontSize: 18, fontWeight: '800', color: colors.streak },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.line, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.streak },
  note: { fontSize: 11, color: colors.inkDim },
  divider: { ...type.label, fontSize: 9.5 },

  badge: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  locked: { opacity: 0.55 },
  glyph: { fontSize: 22 },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  desc: { fontSize: 11.5, color: colors.inkSoft, lineHeight: 16 },
  dateBox: { alignItems: 'center', gap: 1 },
  check: { color: colors.win, fontSize: 15, fontWeight: '800' },
  date: { fontSize: 9.5, color: colors.inkDim },
  lock: { fontSize: 14, opacity: 0.5 },
});
