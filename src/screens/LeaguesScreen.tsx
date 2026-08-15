import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Card, Hex, Pill } from '../ui/primitives';
import Cover from '../ui/Cover';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius } from '../theme';

type LeagueRow = {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
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
    const [{ data: allLeagues, error }, { data: memberships }] = await Promise.all([
      supabase.from('leagues').select('id, name, description, photo_url').order('created_at', { ascending: false }),
      supabase.from('league_members').select('league_id, role').eq('player_id', playerId),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);

    const roleByLeague = new Map((memberships ?? []).map((m: any) => [m.league_id, m.role]));

    // La posición en cada liga se calcula ordenando a sus miembros por el rating
    // GLOBAL. No hay un ELO por liga — la vista por liga es un filtro de lectura
    // sobre el mismo rating (decisión 7 de PROGRESS.md).
    const myLeagueIds = [...roleByLeague.keys()];
    const rankByLeague = new Map<string, number>();
    const countByLeague = new Map<string, number>();

    // Los conteos se piden para TODAS las ligas, no solo las mías: la lista
    // muestra cuánta gente tiene cada una aunque no pertenezcas.
    const { data: rosters } = await supabase
      .from('league_members')
      .select('league_id, player_id, players(elo_rating)');

    const byLeague = new Map<string, { player_id: string; elo: number }[]>();
    for (const row of ((rosters as any[]) ?? [])) {
      const list = byLeague.get(row.league_id) ?? [];
      list.push({ player_id: row.player_id, elo: row.players?.elo_rating ?? 1000 });
      byLeague.set(row.league_id, list);
    }
    for (const [leagueId, list] of byLeague) {
      countByLeague.set(leagueId, list.length);
      if (!myLeagueIds.includes(leagueId)) continue;
      list.sort((a, b) => b.elo - a.elo);
      const index = list.findIndex((p) => p.player_id === playerId);
      if (index >= 0) rankByLeague.set(leagueId, index + 1);
    }

    const list = ((allLeagues as any[]) ?? []).map((l) => ({
      ...l,
      role: roleByLeague.get(l.id) ?? null,
      myRank: rankByLeague.get(l.id) ?? null,
      memberCount: countByLeague.get(l.id) ?? 0,
    }));
    // Las tuyas primero: son las que vienes a consultar.
    list.sort((a, b) => (b.role ? 1 : 0) - (a.role ? 1 : 0));
    setLeagues(list);
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
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={leagues}
        keyExtractor={(l) => l.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Ligas</Text>
            </View>
            <Text style={styles.sub}>Compite en una temporada con ranking oficial.</Text>
            {isAdmin && (
              <Button
                label="＋  CREAR LIGA"
                variant="ghost"
                onPress={() => navigation.navigate('CreateLeague')}
              />
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const mine = !!item.role;
          // Solo se destaca si es TUYA: en una lista de ligas ajenas, la
          // primera no vale más que las demás.
          const hero = index === 0 && mine;

          return (
            <Pressable
              onPress={() => navigation.navigate('LeagueDetail', { leagueId: item.id })}
              style={({ pressed }) => pressed && { opacity: 0.85 }}
            >
              <View style={[styles.card, mine && { borderColor: colors.blue }]}>
                <Cover id={item.id} photoUrl={item.photo_url} height={hero ? 140 : 92} />

                <View style={styles.overlay}>
                  {mine && <Text style={styles.mineTag}>TU LIGA</Text>}
                  <Text style={[styles.name, hero && styles.nameHero]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={2}>
                    {item.description ?? 'Sin descripción'}
                  </Text>
                </View>

                <View style={styles.foot}>
                  <Text style={styles.footText}>
                    {item.memberCount} miembro{item.memberCount === 1 ? '' : 's'}
                    {item.myRank ? ` · vas #${item.myRank}` : ''}
                  </Text>
                  {mine ? (
                    <>
                      {item.role === 'organizer' && <Pill label="Moderador" />}
                      <Text style={styles.cta}>Ver liga ›</Text>
                    </>
                  ) : (
                    <Pressable style={styles.join} onPress={() => join(item.id)}>
                      <Text style={styles.joinText}>UNIRME</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>🏅</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Todavía no hay ligas</Text>
              <Text style={styles.meta}>
                {isAdmin ? 'Crea la primera.' : 'Las crea el administrador de la plataforma.'}
              </Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  sub: { ...type.soft, fontSize: 12.5 },

  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  overlay: { paddingHorizontal: space.lg, paddingTop: space.md, gap: 3 },
  mineTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.blue },
  nameHero: { fontSize: 20 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    marginTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  footText: { flex: 1, fontSize: 11, color: colors.inkDim },
  cta: { fontSize: 12, fontWeight: '800', color: colors.blue },


  name: { fontSize: 15.5, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.2 },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  join: {
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  joinText: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
