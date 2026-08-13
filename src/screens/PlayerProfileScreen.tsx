import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import { badgeIcon } from '../lib/badges';

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  country: string | null;
  main_beyblade: string | null;
  play_style: string | null;
  elo_rating: number;
  matches_played: number;
};

type Badge = { code: string; name: string };

export default function PlayerProfileScreen({ route, navigation }: any) {
  const { playerId: targetId } = route.params;
  const { playerId: myId } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [iFollow, setIFollow] = useState(false);
  const [record, setRecord] = useState<{ mine: number; theirs: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const isMe = targetId === myId;

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data, error },
      { data: badgeRows },
      { count: followerCount },
      { count: followingCount },
      { data: myFollow },
      { data: rivalry },
    ] = await Promise.all([
      supabase
        .from('players')
        .select('id, display_name, city, country, main_beyblade, play_style, elo_rating, matches_played')
        .eq('id', targetId)
        .single(),
      supabase.from('player_badges').select('badges(code, name)').eq('player_id', targetId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('followee_id', targetId),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', targetId),
      supabase.from('follows').select('followee_id').eq('follower_id', myId).eq('followee_id', targetId).maybeSingle(),
      // La pareja de rivalries se guarda normalizada (uuid menor primero).
      supabase
        .from('rivalries')
        .select('player_a_id, wins_a, wins_b')
        .or(
          `and(player_a_id.eq.${myId},player_b_id.eq.${targetId}),and(player_a_id.eq.${targetId},player_b_id.eq.${myId})`
        )
        .maybeSingle(),
    ]);

    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setPlayer(data as any);
    setBadges(((badgeRows as any[]) ?? []).map((r) => r.badges).filter(Boolean));
    setFollowers(followerCount ?? 0);
    setFollowing(followingCount ?? 0);
    setIFollow(!!myFollow);

    if (rivalry) {
      const iAmA = (rivalry as any).player_a_id === myId;
      setRecord({
        mine: iAmA ? (rivalry as any).wins_a : (rivalry as any).wins_b,
        theirs: iAmA ? (rivalry as any).wins_b : (rivalry as any).wins_a,
      });
    } else {
      setRecord(null);
    }
  }, [targetId, myId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function toggleFollow() {
    setBusy(true);
    const { error } = iFollow
      ? await supabase.from('follows').delete().eq('follower_id', myId).eq('followee_id', targetId)
      : await supabase.from('follows').insert({ follower_id: myId, followee_id: targetId });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function challenge() {
    setBusy(true);
    const { error } = await supabase
      .from('challenges')
      .insert({ challenger_id: myId, challenged_id: targetId, status: 'pending' });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    Alert.alert('Reto enviado', `${player?.display_name} tiene que aceptarlo para crear el match.`);
  }

  if (loading || !player) {
    return (
      <Screen style={styles.container}>
        <Text>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.avatar} />
        <Text style={styles.name}>{player.display_name}</Text>
        <Text style={styles.sub}>
          {[player.city, player.country].filter(Boolean).join(', ') || 'Ubicación no definida'}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{Math.round(player.elo_rating)}</Text>
            <Text style={styles.statLabel}>ELO</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{player.matches_played}</Text>
            <Text style={styles.statLabel}>Matches</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{followers}</Text>
            <Text style={styles.statLabel}>Seguidores</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{following}</Text>
            <Text style={styles.statLabel}>Siguiendo</Text>
          </View>
        </View>

        {player.main_beyblade ? <Text style={styles.field}>Main: {player.main_beyblade}</Text> : null}
        {player.play_style ? <Text style={styles.field}>Estilo: {player.play_style}</Text> : null}

        {record && (
          <View style={styles.recordBox}>
            <Text style={styles.recordLabel}>Tu récord contra {player.display_name}</Text>
            <Text style={styles.recordValue}>
              {record.mine} – {record.theirs}
            </Text>
          </View>
        )}

        {badges.length > 0 && (
          <View style={styles.badgeStrip}>
            {badges.map((b) => (
              <Text key={b.code} style={styles.badgeIcon}>
                {badgeIcon(b.code)}
              </Text>
            ))}
          </View>
        )}

        {!isMe && (
          <>
            <Pressable style={[styles.button, iFollow && styles.secondaryButton]} onPress={toggleFollow} disabled={busy}>
              <Text style={styles.buttonText}>{iFollow ? 'Dejar de seguir' : 'Seguir'}</Text>
            </Pressable>
            <Pressable style={[styles.button, styles.secondaryButton]} onPress={challenge} disabled={busy}>
              <Text style={styles.buttonText}>Retar</Text>
            </Pressable>
          </>
        )}

        <Pressable
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate('Passport', { playerId: targetId })}
        >
          <Text style={styles.buttonText}>Ver League Passport</Text>
        </Pressable>

        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Volver</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: 'center', padding: 24, gap: 6, backgroundColor: '#fff' },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e8edfd', marginBottom: 8 },
  name: { fontSize: 22, fontWeight: '700' },
  sub: { color: '#6b6b64' },
  statsRow: { flexDirection: 'row', gap: 20, marginVertical: 12 },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 11, color: '#6b6b64' },
  field: { fontSize: 14, color: '#333' },
  recordBox: { backgroundColor: '#f6f7fb', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 12, width: '100%' },
  recordLabel: { fontSize: 12, color: '#6b6b64' },
  recordValue: { fontSize: 20, fontWeight: '700', color: '#2f5ad6', marginTop: 2 },
  badgeStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 12 },
  badgeIcon: { fontSize: 22 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12, width: '100%' },
  secondaryButton: { backgroundColor: '#444' },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
