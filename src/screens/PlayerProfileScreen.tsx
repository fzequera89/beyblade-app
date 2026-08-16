import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import { IconChevron } from '../ui/icons';
import { badgeIcon } from '../lib/badges';
import { colors, space, type } from '../theme';

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  country: string | null;
  main_beyblade: string | null;
  play_style: string | null;
  elo_rating: number;
  matches_played: number;
  avatar_key: string | null;
  avatar_url: string | null;
  experience_level: string | null;
};

type Badge = { code: string; name: string };

const EXPERIENCE_LABEL: Record<string, string> = {
  rookie: 'Rookie Blader',
  blader: 'Blader',
  pro: 'Pro Blader',
  elite: 'Elite Blader',
};

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
        .select(
          'id, display_name, city, country, main_beyblade, play_style, elo_rating, matches_played, avatar_key, avatar_url, experience_level'
        )
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
      alerta('Error', error.message);
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
      alerta('Error', error.message);
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
      alerta('Error', error.message);
      return;
    }
    alerta('Reto enviado', `${player?.display_name} tiene que aceptarlo para crear el match.`);
  }

  if (loading || !player) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const leads = record ? record.mine - record.theirs : 0;

  return (
    <Screen scroll padded={false}>
      <View style={styles.headRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Hex size={108} color={colors.blue}>
          <Avatar uri={player.avatar_url} avatarKey={player.avatar_key} size={74} />
        </Hex>
        <Text style={styles.name}>{player.display_name}</Text>
        <Pill label={EXPERIENCE_LABEL[player.experience_level ?? ''] ?? 'Blader'} align="center" />
        <Text style={styles.city}>
          {[player.city, player.country].filter(Boolean).join(', ') || 'Sin ubicación'}
        </Text>
      </View>

      <View style={styles.pad}>
        <Card style={styles.stats}>
          <Stat label="ELO" value={Math.round(player.elo_rating).toLocaleString()} tint={colors.blue} />
          <View style={styles.div} />
          <Stat label="Batallas" value={String(player.matches_played)} />
          <View style={styles.div} />
          <Stat label="Seguidores" value={String(followers)} />
          <View style={styles.div} />
          <Stat label="Siguiendo" value={String(following)} />
        </Card>

        {/* El cara a cara es lo que de verdad te interesa de OTRO jugador, así
            que va antes que su equipo y sus logros. */}
        {record && !isMe && (
          <Card
            style={[
              styles.record,
              { borderColor: leads > 0 ? colors.win : leads < 0 ? colors.loss : colors.lineHi },
            ]}
          >
            <Text style={styles.recordLabel}>TU RÉCORD CONTRA ÉL</Text>
            <View style={styles.recordRow}>
              <Text style={[styles.recordNum, { color: colors.win }]}>{record.mine}</Text>
              <Text style={styles.recordDash}>–</Text>
              <Text style={[styles.recordNum, { color: colors.loss }]}>{record.theirs}</Text>
            </View>
            <Text style={styles.recordHint}>
              {leads > 0
                ? `Vas arriba por ${leads}`
                : leads < 0
                ? `Vas abajo por ${-leads}`
                : 'Están empatados'}
            </Text>
          </Card>
        )}

        {(player.main_beyblade || player.play_style) && (
          <Card style={styles.gear}>
            {player.main_beyblade ? <GearRow label="Beyblade principal" value={player.main_beyblade} /> : null}
            {player.play_style ? <GearRow label="Estilo" value={player.play_style} /> : null}
          </Card>
        )}

        {badges.length > 0 && (
          <View style={styles.block}>
            <SectionTitle>Logros</SectionTitle>
            <Card style={styles.badgeStrip}>
              {badges.slice(0, 10).map((b) => (
                <View key={b.code} style={styles.badge}>
                  <Text style={styles.badgeGlyph}>{badgeIcon(b.code)}</Text>
                </View>
              ))}
              {badges.length > 10 && <Text style={styles.more}>+{badges.length - 10}</Text>}
            </Card>
          </View>
        )}

        <View style={styles.actions}>
          {!isMe && (
            <>
              <Button label="RETAR" onPress={challenge} disabled={busy} />
              <Button
                label={iFollow ? 'DEJAR DE SEGUIR' : 'SEGUIR'}
                variant="ghost"
                onPress={toggleFollow}
                disabled={busy}
              />
            </>
          )}

          <Card
            style={styles.link}
            onPress={() => navigation.navigate('Passport', { playerId: targetId })}
          >
            <Text style={styles.linkGlyph}>🛂</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLabel}>League Passport</Text>
              <Text style={styles.meta}>Toda su trayectoria</Text>
            </View>
            <IconChevron />
          </Card>
        </View>
      </View>
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

function GearRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.gearRow}>
      <Text style={styles.gearLabel}>{label}</Text>
      <Text style={styles.gearValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headRow: { paddingHorizontal: space.xl, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  pad: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },

  hero: { alignItems: 'center', gap: space.sm, paddingTop: space.sm, paddingBottom: space.lg, paddingHorizontal: space.xl },
  name: { ...type.display, fontSize: 25, marginTop: space.sm, textAlign: 'center' },
  city: { fontSize: 13, color: colors.inkSoft },

  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  div: { width: 1, height: 32, backgroundColor: colors.line },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7, color: colors.inkDim },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.ink },

  record: { alignItems: 'center', gap: 2, marginTop: space.md },
  recordLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.inkSoft },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  recordNum: { fontSize: 30, fontWeight: '800', fontStyle: 'italic' },
  recordDash: { fontSize: 20, color: colors.inkDim },
  recordHint: { fontSize: 11.5, color: colors.inkSoft },

  gear: { marginTop: space.md, gap: space.sm },
  gearRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  gearLabel: { fontSize: 12, color: colors.inkSoft },
  gearValue: { fontSize: 13, color: colors.ink, fontWeight: '600', flexShrink: 1 },

  block: { marginTop: space.xl, gap: space.sm },
  badgeStrip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGlyph: { fontSize: 19 },
  more: { fontSize: 12, color: colors.inkSoft, fontWeight: '700' },

  actions: { marginTop: space.xl, gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  linkGlyph: { fontSize: 19, width: 26, textAlign: 'center' },
  linkLabel: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
});
