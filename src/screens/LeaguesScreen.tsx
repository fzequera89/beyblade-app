import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Card, Hex, Pill } from '../ui/primitives';
import Cover, { coverAccent } from '../ui/Cover';
import { leagueEmblem } from '../lib/emblem';
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
  tournamentCount: number;
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

    // Torneos por liga: una sola consulta y se agrupa aquí. Una por liga
    // serían tantas consultas como ligas existan.
    const { data: tourneys } = await supabase.from('tournaments').select('league_id');
    const tournamentsByLeague = new Map<string, number>();
    for (const t of ((tourneys as any[]) ?? [])) {
      tournamentsByLeague.set(t.league_id, (tournamentsByLeague.get(t.league_id) ?? 0) + 1);
    }

    const list = ((allLeagues as any[]) ?? []).map((l) => ({
      ...l,
      role: roleByLeague.get(l.id) ?? null,
      myRank: rankByLeague.get(l.id) ?? null,
      memberCount: countByLeague.get(l.id) ?? 0,
      tournamentCount: tournamentsByLeague.get(l.id) ?? 0,
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
        renderItem={({ item }) => {
          const mine = !!item.role;
          const accent = coverAccent(item.id);

          return (
            <Pressable
              onPress={() => navigation.navigate('LeagueDetail', { leagueId: item.id })}
              style={({ pressed }) => pressed && { opacity: 0.85 }}
            >
              <View style={[styles.card, { borderColor: mine ? accent.neon : colors.line }]}>
                {/* La portada va de fondo, atenuada: acompaña sin tapar el dato. */}
                <View style={styles.bg} pointerEvents="none">
                  <Cover id={item.id} photoUrl={item.photo_url} height={132} />
                </View>
                <View style={styles.scrim} pointerEvents="none" />

                <View style={styles.cardRow}>
                  <Hex size={72} color={accent.neon} solid>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.emblem} numberOfLines={1}>
                        {leagueEmblem(item.name).top}
                      </Text>
                      {leagueEmblem(item.name).bottom ? (
                        <Text style={styles.emblemSub} numberOfLines={1}>
                          {leagueEmblem(item.name).bottom}
                        </Text>
                      ) : null}
                    </View>
                  </Hex>

                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.role === 'organizer' && (
                        <View style={[styles.roleTag, { borderColor: accent.neon }]}>
                          <Text style={[styles.roleTagText, { color: accent.warm }]}>MODERADOR</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.desc} numberOfLines={2}>
                      {item.description ?? 'Sin descripción'}
                    </Text>

                    <View style={styles.statsRow}>
                      <MiniStat glyph="👥" value={String(item.memberCount)} label="Miembros" tint={accent.neon} />
                      <MiniStat glyph="🏆" value={String(item.tournamentCount ?? 0)} label="Torneos" tint={accent.neon} />
                      <MiniStat
                        glyph="📊"
                        value={item.myRank ? `#${item.myRank}` : '—'}
                        label="Tu posición"
                        tint={accent.neon}
                      />
                    </View>
                  </View>

                  {mine ? (
                    <IconChevron />
                  ) : (
                    <Pressable style={[styles.join, { borderColor: accent.neon }]} onPress={() => join(item.id)}>
                      <Text style={[styles.joinText, { color: accent.warm }]}>UNIRME</Text>
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

function MiniStat({
  glyph,
  value,
  label,
  tint,
}: {
  glyph: string;
  value: string;
  label: string;
  tint: string;
}) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniGlyph}>{glyph}</Text>
      <View>
        <Text style={[styles.miniValue, { color: tint }]}>{value}</Text>
        <Text style={styles.miniLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.md },

  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  bg: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.5 },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,6,12,0.62)',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
  },
  emblem: { fontSize: 15, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.5 },
  emblemSub: { fontSize: 7.5, fontWeight: '800', letterSpacing: 0.5, color: colors.inkSoft, marginTop: -1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  roleTag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  roleTagText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.6 },
  desc: { fontSize: 11.5, color: colors.inkSoft, lineHeight: 16 },
  statsRow: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miniGlyph: { fontSize: 13 },
  miniValue: { fontSize: 14, fontWeight: '800' },
  miniLabel: { fontSize: 9, color: colors.inkDim },
  join: { borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  joinText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  sub: { ...type.soft, fontSize: 12.5 },



  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
