import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Hex } from '../ui/primitives';
import { badgeIcon } from '../lib/badges';
import { colors, space, type } from '../theme';

// El feed se arma con tres consultas filtradas por la gente que sigues y se
// mezcla en el cliente. No hay tabla de feed denormalizada a propósito: para el
// tamaño de una liga regional no se justifica el costo de mantenerla al día, y
// una tabla así se desincroniza en cuanto algo se borra o se disputa.
type FeedItem = {
  key: string;
  at: string;
  kind: 'match' | 'badge' | 'checkin';
  icon: string;
  actor: string;
  text: string;
  playerId: string;
  matchId?: string;
  avatarKey?: string | null;
  avatarUrl?: string | null;
};

const FEED_LIMIT = 30;

const KIND_COLOR: Record<FeedItem['kind'], string> = {
  match: colors.blue,
  badge: colors.streak,
  checkin: colors.elite,
};

export default function FeedScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: follows } = await supabase.from('follows').select('followee_id').eq('follower_id', playerId);
    const ids = ((follows as any[]) ?? []).map((f) => f.followee_id);
    setFollowingCount(ids.length);

    if (ids.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const list = ids.join(',');
    const [{ data: matches }, { data: badges }, { data: checkIns }] = await Promise.all([
      supabase
        .from('matches')
        .select(
          'id, winner_id, score_a, score_b, confirmed_at, player_a_id, player_b_id, player_a:players!matches_player_a_id_fkey(display_name, avatar_key, avatar_url), player_b:players!matches_player_b_id_fkey(display_name, avatar_key, avatar_url)'
        )
        .eq('status', 'confirmed')
        .or(`player_a_id.in.(${list}),player_b_id.in.(${list})`)
        .order('confirmed_at', { ascending: false })
        .limit(FEED_LIMIT),
      supabase
        .from('player_badges')
        .select('player_id, earned_at, badges(code, name), players(display_name, avatar_key, avatar_url)')
        .in('player_id', ids)
        .order('earned_at', { ascending: false })
        .limit(FEED_LIMIT),
      supabase
        .from('check_ins')
        .select('id, player_id, checked_in_at, players(display_name, avatar_key, avatar_url), venues(name)')
        .in('player_id', ids)
        .order('checked_in_at', { ascending: false })
        .limit(FEED_LIMIT),
    ]);

    const merged: FeedItem[] = [];

    for (const m of ((matches as any[]) ?? [])) {
      if (!m.confirmed_at) continue;
      const winnerIsA = m.winner_id === m.player_a_id;
      const winner = winnerIsA ? m.player_a : m.player_b;
      const loser = winnerIsA ? m.player_b : m.player_a;
      const high = Math.max(m.score_a, m.score_b);
      const low = Math.min(m.score_a, m.score_b);
      merged.push({
        key: `match-${m.id}`,
        at: m.confirmed_at,
        kind: 'match',
        icon: '⚔️',
        actor: winner?.display_name ?? '—',
        text: `ganó ${high}–${low} a ${loser?.display_name ?? '—'}`,
        playerId: m.winner_id,
        matchId: m.id,
        avatarKey: winner?.avatar_key,
        avatarUrl: winner?.avatar_url,
      });
    }

    for (const b of ((badges as any[]) ?? [])) {
      merged.push({
        key: `badge-${b.player_id}-${b.badges?.code}`,
        at: b.earned_at,
        kind: 'badge',
        icon: badgeIcon(b.badges?.code ?? ''),
        actor: b.players?.display_name ?? '—',
        text: `desbloqueó «${b.badges?.name ?? 'un logro'}»`,
        playerId: b.player_id,
        avatarKey: b.players?.avatar_key,
        avatarUrl: b.players?.avatar_url,
      });
    }

    for (const c of ((checkIns as any[]) ?? [])) {
      merged.push({
        key: `checkin-${c.id}`,
        at: c.checked_in_at,
        kind: 'checkin',
        icon: '📍',
        actor: c.players?.display_name ?? '—',
        text: `hizo check-in en ${c.venues?.name ?? 'una locación'}`,
        playerId: c.player_id,
        avatarKey: c.players?.avatar_key,
        avatarUrl: c.players?.avatar_url,
      });
    }

    merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    setItems(merged.slice(0, FEED_LIMIT));
    setLoading(false);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function timeAgo(iso: string) {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    return `hace ${days} d`;
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Actividad</Text>
            </View>
            <Text style={styles.sub}>
              Lo que hacen los {followingCount} blader{followingCount === 1 ? '' : 's'} que sigues.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card
            style={styles.row}
            onPress={() =>
              item.matchId
                ? navigation.navigate('MatchDetail', { matchId: item.matchId })
                : navigation.navigate('PlayerProfile', { playerId: item.playerId })
            }
          >
            <View>
              <Avatar uri={item.avatarUrl} avatarKey={item.avatarKey} size={42} />
              <View style={[styles.kind, { borderColor: KIND_COLOR[item.kind] }]}>
                <Text style={styles.kindGlyph}>{item.icon}</Text>
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.text}>
                <Text style={styles.actor}>{item.actor}</Text> {item.text}
              </Text>
              <Text style={styles.time}>{timeAgo(item.at)}</Text>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={50} color={colors.inkDim}>
                <Text style={{ fontSize: 19 }}>📡</Text>
              </Hex>
              <Text style={styles.emptyTitle}>
                {followingCount === 0 ? 'Tu feed está en silencio' : 'Sin actividad todavía'}
              </Text>
              <Text style={styles.emptyText}>
                {followingCount === 0
                  ? 'Sigue a otros bladers para ver aquí sus batallas, logros y check-ins.'
                  : 'Cuando la gente que sigues juegue, aparecerá aquí.'}
              </Text>
            </Card>
          ) : null
        }
        ListFooterComponent={
          <View style={{ marginTop: space.xl }}>
            <Button label="MI GENTE" variant="ghost" onPress={() => navigation.navigate('Follows')} />
          </View>
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

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  kind: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindGlyph: { fontSize: 10 },
  text: { fontSize: 13, color: colors.inkSoft, lineHeight: 18 },
  actor: { color: colors.ink, fontWeight: '700' },
  time: { fontSize: 10.5, color: colors.inkDim, marginTop: 3 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  emptyText: { ...type.soft, fontSize: 12, textAlign: 'center' },
});
