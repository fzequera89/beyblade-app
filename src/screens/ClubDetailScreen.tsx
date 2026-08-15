import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import Cover from '../ui/Cover';
import { changeCover } from '../lib/cover';
import { colors, space, type, radius } from '../theme';

type Club = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  photo_url: string | null;
  owner_player_id: string | null;
};

type Member = {
  player_id: string;
  players: {
    display_name: string;
    elo_rating: number;
    matches_played: number;
    avatar_key: string | null;
    avatar_url: string | null;
  } | null;
};

export default function ClubDetailScreen({ route, navigation }: any) {
  const { clubId } = route.params;
  const { playerId, isAdmin } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: roster }] = await Promise.all([
      supabase.from('clubs').select('id, name, city, description, photo_url, owner_player_id').eq('id', clubId).single(),
      supabase
        .from('club_members')
        .select('player_id, players(display_name, elo_rating, matches_played, avatar_key, avatar_url)')
        .eq('club_id', clubId),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    setClub(data as any);
    // El roster se ordena por ELO: es el ranking interno del club.
    setMembers(
      ((roster as any as Member[]) ?? []).sort(
        (a, b) => (b.players?.elo_rating ?? 0) - (a.players?.elo_rating ?? 0)
      )
    );
  }, [clubId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !club) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const isMember = members.some((m) => m.player_id === playerId);
  const isOwner = club.owner_player_id === playerId;
  const avgElo =
    members.length > 0
      ? Math.round(members.reduce((s, m) => s + (m.players?.elo_rating ?? 1000), 0) / members.length)
      : 1000;
  const totalMatches = members.reduce((s, m) => s + (m.players?.matches_played ?? 0), 0);

  async function toggle() {
    if (isOwner) {
      Alert.alert('Eres el fundador', 'Para salir tendrías que borrar el club o pasarlo a otra persona.');
      return;
    }
    setBusy(true);
    const { error } = isMember
      ? await supabase.from('club_members').delete().eq('club_id', clubId).eq('player_id', playerId)
      : await supabase.from('club_members').insert({ club_id: clubId, player_id: playerId });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  async function onChangeCover() {
    setUploading(true);
    const ok = await changeCover('club', 'clubs', clubId);
    setUploading(false);
    if (ok) load();
  }

  function remove() {
    Alert.alert('Borrar club', `¿Seguro que quieres borrar "${club?.name}"?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('clubs').delete().eq('id', clubId);
          if (error) return Alert.alert('Error', error.message);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {(isOwner || isAdmin) && (
          <Pressable style={styles.iconBtn} onPress={onChangeCover} disabled={uploading} hitSlop={6}>
            <Text style={styles.iconBtnText}>{uploading ? '…' : '🖼️'}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.pad}>
        {/* Portada del club: la foto real del equipo si la subieron; si no, una
            arena dibujada del id, para no dejar un hueco. */}
        <View style={styles.banner}>
          <Cover id={clubId} photoUrl={club.photo_url} height={150} />
        </View>

        <View style={styles.hero}>
          <Hex size={84} color={colors.elite}>
            <Text style={{ fontSize: 32 }}>🛡️</Text>
          </Hex>
          <Text style={styles.title}>{club.name}</Text>
          <Text style={styles.city}>{club.city ?? 'Sin ciudad'}</Text>
          {isMember && <Pill label="Eres miembro" color={colors.elite} align="center" />}
        </View>

        {club.description ? (
          <Card>
            <Text style={styles.description}>{club.description}</Text>
          </Card>
        ) : null}

        <Card style={styles.stats}>
          <Stat label="Miembros" value={String(members.length)} />
          <View style={styles.vDiv} />
          <Stat label="ELO promedio" value={String(avgElo)} tint={colors.elite} />
          <View style={styles.vDiv} />
          <Stat label="Batallas" value={String(totalMatches)} />
        </Card>

        <View style={{ marginTop: space.lg }}>
          <Button
            label={isMember ? 'SALIR DEL CLUB' : 'UNIRME AL CLUB'}
            variant={isMember ? 'ghost' : 'primary'}
            onPress={toggle}
            loading={busy}
          />
        </View>

        <View style={styles.block}>
          <SectionTitle>Roster</SectionTitle>
          <Text style={styles.note}>Ordenado por ELO — es el ranking interno del club.</Text>

          {members.map((m, i) => {
            const me = m.player_id === playerId;
            const owner = m.player_id === club.owner_player_id;
            return (
              <Card
                key={m.player_id}
                style={[styles.row, me && { borderColor: colors.blue }]}
                onPress={() => navigation.navigate('PlayerProfile', { playerId: m.player_id })}
              >
                <Text style={styles.pos}>{i + 1}</Text>
                <Avatar
                  uri={m.players?.avatar_url}
                  avatarKey={m.players?.avatar_key}
                  size={42}
                  ring={owner ? colors.elite : undefined}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {me ? 'Tú' : m.players?.display_name ?? '—'}
                  </Text>
                  <Text style={styles.meta}>{m.players?.matches_played ?? 0} batallas</Text>
                </View>
                {owner && <Pill label="Fundador" color={colors.elite} />}
                <Text style={styles.elo}>{Math.round(m.players?.elo_rating ?? 1000)}</Text>
              </Card>
            );
          })}
        </View>

        {(isOwner || isAdmin) && (
          <View style={{ marginTop: space.xxl }}>
            <Button label="Borrar club" variant="danger" onPress={remove} />
          </View>
        )}
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingTop: space.md,
  },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 15 },
  pad: { paddingHorizontal: space.xl },
  banner: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: space.sm },

  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  title: { ...type.display, fontSize: 24, textAlign: 'center' },
  city: { fontSize: 12.5, color: colors.inkSoft },
  description: { fontSize: 13.5, color: colors.ink, lineHeight: 20 },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 28, backgroundColor: colors.line },

  block: { marginTop: space.xxl, gap: space.sm },
  note: { fontSize: 11.5, color: colors.inkDim },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pos: { width: 20, fontSize: 13, fontWeight: '800', color: colors.inkDim, textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  elo: { fontSize: 14.5, fontWeight: '800', color: colors.elite },
});
