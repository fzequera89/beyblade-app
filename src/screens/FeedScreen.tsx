import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import { badgeIcon } from '../lib/badges';

// El feed se arma con tres consultas filtradas por la gente que sigues y se
// mezcla en el cliente. No hay tabla de feed denormalizada a propósito: para el
// tamaño de una liga regional no se justifica el costo de mantenerla al día, y
// una tabla así se desincroniza en cuanto algo se borra o se disputa.
type FeedItem = {
  key: string;
  at: string;
  kind: 'match' | 'badge' | 'checkin';
  text: string;
  icon: string;
  playerId: string;
  matchId?: string;
};

const FEED_LIMIT = 30;

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
          'id, winner_id, score_a, score_b, confirmed_at, player_a_id, player_b_id, player_a:players!matches_player_a_id_fkey(display_name), player_b:players!matches_player_b_id_fkey(display_name)'
        )
        .eq('status', 'confirmed')
        .or(`player_a_id.in.(${list}),player_b_id.in.(${list})`)
        .order('confirmed_at', { ascending: false })
        .limit(FEED_LIMIT),
      supabase
        .from('player_badges')
        .select('player_id, earned_at, badges(code, name), players(display_name)')
        .in('player_id', ids)
        .order('earned_at', { ascending: false })
        .limit(FEED_LIMIT),
      supabase
        .from('check_ins')
        .select('id, player_id, checked_in_at, players(display_name), venues(name)')
        .in('player_id', ids)
        .order('checked_in_at', { ascending: false })
        .limit(FEED_LIMIT),
    ]);

    const merged: FeedItem[] = [];

    for (const m of ((matches as any[]) ?? [])) {
      if (!m.confirmed_at) continue;
      const winnerIsA = m.winner_id === m.player_a_id;
      const winner = winnerIsA ? m.player_a?.display_name : m.player_b?.display_name;
      const loser = winnerIsA ? m.player_b?.display_name : m.player_a?.display_name;
      const high = Math.max(m.score_a, m.score_b);
      const low = Math.min(m.score_a, m.score_b);
      merged.push({
        key: `match-${m.id}`,
        at: m.confirmed_at,
        kind: 'match',
        icon: '⚔️',
        text: `${winner ?? '—'} le ganó ${high}–${low} a ${loser ?? '—'}`,
        playerId: m.winner_id,
        matchId: m.id,
      });
    }

    for (const b of ((badges as any[]) ?? [])) {
      merged.push({
        key: `badge-${b.player_id}-${b.badges?.code}`,
        at: b.earned_at,
        kind: 'badge',
        icon: badgeIcon(b.badges?.code ?? ''),
        text: `${b.players?.display_name ?? '—'} desbloqueó "${b.badges?.name ?? 'un logro'}"`,
        playerId: b.player_id,
      });
    }

    for (const c of ((checkIns as any[]) ?? [])) {
      merged.push({
        key: `checkin-${c.id}`,
        at: c.checked_in_at,
        kind: 'checkin',
        icon: '📍',
        text: `${c.players?.display_name ?? '—'} hizo check-in en ${c.venues?.name ?? 'un venue'}`,
        playerId: c.player_id,
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
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={items}
        keyExtractor={(i) => i.key}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>Actividad</Text>
            <Text style={styles.meta}>
              Lo que hacen los {followingCount} jugador{followingCount === 1 ? '' : 'es'} que sigues.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() =>
              item.matchId
                ? navigation.navigate('MatchDetail', { matchId: item.matchId })
                : navigation.navigate('PlayerProfile', { playerId: item.playerId })
            }
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.text}>{item.text}</Text>
            <Text style={styles.time}>{timeAgo(item.at)}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              {followingCount === 0
                ? 'Sigue a otros jugadores para ver aquí lo que hacen.'
                : 'Todavía no hay actividad de la gente que sigues.'}
            </Text>
          ) : null
        }
        ListFooterComponent={
          <>
            <Pressable style={styles.button} onPress={() => navigation.navigate('Follows')}>
              <Text style={styles.buttonText}>Mi gente</Text>
            </Pressable>
            <Pressable style={styles.back} onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>‹ Volver</Text>
            </Pressable>
          </>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 12,
  },
  icon: { fontSize: 20 },
  text: { flex: 1, fontSize: 13 },
  time: { fontSize: 10, color: '#6b6b64' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
