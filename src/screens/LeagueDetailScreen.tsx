import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Field } from '../ui/Field';
import { Card, Hex, SectionTitle } from '../ui/primitives';
import Cover, { coverAccent } from '../ui/Cover';
import { pickCoverPhoto, uploadCover } from '../lib/cover';
import { leagueEmblem, emblemFont } from '../lib/emblem';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius } from '../theme';

type Season = { id: string; name: string; start_date: string | null; end_date: string | null };
type League = { id: string; name: string; description: string | null; photo_url: string | null };
type TopPlayer = {
  id: string;
  display_name: string;
  elo_rating: number;
  avatar_key: string | null;
  avatar_url: string | null;
  wins: number;
};

export default function LeagueDetailScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const { playerId } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [role, setRole] = useState<'member' | 'organizer' | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [tournamentCount, setTournamentCount] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [top, setTop] = useState<TopPlayer[]>([]);
  const [newSeason, setNewSeason] = useState('');
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);


  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: leagueData }, { data: membership }, { data: seasonRows }, { data: roster }, { count: tCount }] =
      await Promise.all([
        supabase.from('leagues').select('id, name, description, photo_url').eq('id', leagueId).single(),
        supabase
          .from('league_members')
          .select('role')
          .eq('league_id', leagueId)
          .eq('player_id', playerId)
          .maybeSingle(),
        supabase
          .from('seasons')
          .select('id, name, start_date, end_date')
          .eq('league_id', leagueId)
          .order('created_at', { ascending: false }),
        supabase
          .from('league_members')
          .select('player_id, players(id, display_name, elo_rating, avatar_key, avatar_url)')
          .eq('league_id', leagueId),
        supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('league_id', leagueId),
      ]);

    setLeague(leagueData ?? null);
    setRole((membership?.role as any) ?? null);
    setSeasons(seasonRows ?? []);
    setTournamentCount(tCount ?? 0);

    const list = ((roster as any[]) ?? [])
      .map((r) => r.players)
      .filter(Boolean)
      .sort((a: any, b: any) => (b.elo_rating ?? 0) - (a.elo_rating ?? 0));

    setMemberCount(list.length);
    const idx = list.findIndex((p: any) => p.id === playerId);
    setMyRank(idx >= 0 ? idx + 1 : null);

    // Las victorias se cuentan SOLO para los tres del podio. Contarlas para
    // todos serían tantas consultas como miembros, y solo se muestran tres.
    const podium = list.slice(0, 3);
    const wins = await Promise.all(
      podium.map((p: any) =>
        supabase
          .from('matches')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'confirmed')
          .eq('winner_id', p.id)
      )
    );
    setTop(podium.map((p: any, i: number) => ({ ...p, wins: wins[i].count ?? 0 })));
    setLoading(false);
  }, [leagueId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // La portada se puede cambiar después: al crear la liga casi nunca se tiene
  // la foto todavía.
  async function changeCover() {
    const uri = await pickCoverPhoto();
    if (!uri) return;
    setUploading(true);
    const url = await uploadCover('league', leagueId, uri);
    if (url) {
      const { error } = await supabase.from('leagues').update({ photo_url: url }).eq('id', leagueId);
      if (error) Alert.alert('No se pudo guardar', error.message);
    }
    setUploading(false);
    load();
  }

  async function join() {
    const { error } = await supabase
      .from('league_members')
      .insert({ league_id: leagueId, player_id: playerId, role: 'member' });
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  async function createSeason() {
    if (!newSeason.trim()) return;
    const { error } = await supabase.from('seasons').insert({ league_id: leagueId, name: newSeason.trim() });
    if (error) return Alert.alert('Error', error.message);
    setNewSeason('');
    setCreating(false);
    load();
  }

  if (loading || !league) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  // Cada liga tiene su color, el mismo de su portada. Dos ligas no se sienten
  // la misma pantalla con otro nombre.
  const accent = coverAccent(league.id);

  // Ojo con las fechas SIN hora ("2026-05-14"): new Date() las interpreta como
  // medianoche UTC, y en México eso cae el día anterior. Una temporada que
  // empieza el 14 se mostraba como 13. Se arman a mano en hora local.
  function fmt(d: string | null) {
    if (!d) return null;
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    if (!y || !m || !day) return new Date(d).toLocaleDateString();
    return new Date(y, m - 1, day).toLocaleDateString();
  }

  return (
    <Screen scroll padded={false}>
      {/* Portada a sangre: entras a la liga, no a su ficha. */}
      <View>
        <Cover id={league.id} photoUrl={league.photo_url} height={210} />

        <Pressable style={styles.backOverCover} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>

        {role === 'organizer' && (
          <Pressable
            style={styles.coverEdit}
            onPress={changeCover}
            disabled={uploading}
            hitSlop={8}
          >
            <Text style={styles.coverEditText}>{uploading ? '…' : '🖼️'}</Text>
          </Pressable>
        )}

        {/* El emblema monta sobre la portada, como un escudo. */}
        <View style={styles.emblemWrap} pointerEvents="none">
          <Hex size={78} color={accent.neon} solid>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={[styles.emblemText, { fontSize: emblemFont(leagueEmblem(league.name).top, 17) }]}
                numberOfLines={1}
              >
                {leagueEmblem(league.name).top}
              </Text>
              {leagueEmblem(league.name).bottom ? (
                <Text
                  style={[styles.emblemSub, { fontSize: emblemFont(leagueEmblem(league.name).bottom!, 9) }]}
                  numberOfLines={1}
                >
                  {leagueEmblem(league.name).bottom}
                </Text>
              ) : null}
            </View>
          </Hex>
        </View>
      </View>

      <View style={styles.pad}>
        <View style={styles.hero}>
          <Text style={styles.title}>{league.name}</Text>
          {league.description ? <Text style={styles.desc}>{league.description}</Text> : null}
          {role && (
            <View style={[styles.rolePill, { borderColor: accent.neon }]}>
              <Text style={[styles.rolePillText, { color: accent.warm }]}>
                {role === 'organizer' ? 'ERES MODERADOR' : 'ERES MIEMBRO'}
              </Text>
            </View>
          )}
        </View>

        {/* Podio: la liga es su gente, no sus números. */}
        {top.length >= 3 && (
          <View style={styles.block}>
            <SectionTitle
              right={
                <Pressable onPress={() => navigation.navigate('LeagueStandings', { leagueId })} hitSlop={6}>
                  <Text style={[styles.topLink, { color: accent.warm }]}>Ver ranking completo ›</Text>
                </Pressable>
              }
            >
              ★ Top 3 jugadores
            </SectionTitle>

            <View style={styles.podium}>
              <PodiumSlot player={top[1]} place={2} accent={accent} navigation={navigation} />
              <PodiumSlot player={top[0]} place={1} accent={accent} navigation={navigation} />
              <PodiumSlot player={top[2]} place={3} accent={accent} navigation={navigation} />
            </View>
          </View>
        )}

        <Card style={styles.stats}>
          <Stat glyph="👥" label="Miembros" value={String(memberCount)} tint={accent.neon} />
          <View style={styles.vDiv} />
          <Stat glyph="🏆" label="Torneos" value={String(tournamentCount)} tint={accent.neon} />
          <View style={styles.vDiv} />
          <Stat
            glyph="📊"
            label="Tu posición"
            value={myRank ? `#${myRank}` : '—'}
            tint={accent.neon}
            strong={!!myRank}
          />
        </Card>

        {!role && (
          <View style={{ marginTop: space.lg }}>
            <Button label="UNIRME A ESTA LIGA" onPress={join} />
          </View>
        )}

        <View style={styles.block}>
          <LinkCard
            glyph="🏆"
            accent={accent.neon}
            title="Torneos"
            sub={`${tournamentCount} torneo${tournamentCount === 1 ? '' : 's'} en esta liga`}
            onPress={() => navigation.navigate('Tournaments', { leagueId, isOrganizer: role === 'organizer' })}
          />
          <LinkCard
            glyph="📊"
            accent={accent.neon}
            title="Ranking de la liga"
            sub="Posiciones y reporte"
            onPress={() => navigation.navigate('LeagueStandings', { leagueId })}
          />
          <LinkCard
            glyph="⚖️"
            accent={accent.neon}
            title="Cuerpo de jueces"
            sub="Quién aprueba los resultados de esta liga"
            onPress={() => navigation.navigate('Judges', { leagueId, title: league.name })}
          />
        </View>

        <View style={styles.block}>
          <SectionTitle>Temporadas</SectionTitle>
          {seasons.length === 0 ? (
            <Card>
              <Text style={type.soft}>Sin temporadas todavía.</Text>
            </Card>
          ) : (
            seasons.map((s) => {
              const from = fmt(s.start_date);
              const to = fmt(s.end_date);
              return (
                <Card
                  key={s.id}
                  style={styles.season}
                  onPress={() =>
                    navigation.navigate('Ladder', { seasonId: s.id, leagueId, seasonName: s.name })
                  }
                >
                  <View style={[styles.tile, { borderColor: accent.neon }]}>
                    <Text style={styles.tileGlyph}>📅</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{s.name}</Text>
                    <Text style={styles.meta}>
                      {from ? `${from}${to ? ` – ${to}` : ''} · ` : ''}Ver escalafón
                    </Text>
                  </View>
                  <IconChevron />
                </Card>
              );
            })
          )}

          {role === 'organizer' &&
            (creating ? (
              <Card style={{ gap: space.md }}>
                <Field
                  label="Nombre de la temporada"
                  placeholder="Temporada 2026"
                  value={newSeason}
                  onChangeText={setNewSeason}
                />
                <Button label="CREAR TEMPORADA" onPress={createSeason} />
                <Button label="Cancelar" variant="ghost" onPress={() => setCreating(false)} />
              </Card>
            ) : (
              <Button label="＋  NUEVA TEMPORADA" variant="ghost" onPress={() => setCreating(true)} />
            ))}
        </View>
      </View>
    </Screen>
  );
}

const MEDAL: Record<number, string> = { 1: colors.streak, 2: '#C3CDDD', 3: '#C77B45' };

function PodiumSlot({
  player,
  place,
  accent,
  navigation,
}: {
  player?: TopPlayer;
  place: number;
  accent: { neon: string; warm: string };
  navigation: any;
}) {
  if (!player) return <View style={{ flex: 1 }} />;
  const first = place === 1;

  return (
    <Pressable
      style={[styles.slot, first && styles.slotFirst, first && { borderColor: MEDAL[1] }]}
      onPress={() => navigation.navigate('PlayerProfile', { playerId: player.id })}
    >
      {first && <Text style={styles.crown}>👑</Text>}

      <View style={styles.slotAvatar}>
        <Avatar
          uri={player.avatar_url}
          avatarKey={player.avatar_key}
          size={first ? 68 : 54}
          ring={MEDAL[place]}
        />
        <View style={[styles.place, { borderColor: MEDAL[place] }]}>
          <Text style={[styles.placeText, { color: MEDAL[place] }]}>{place}</Text>
        </View>
      </View>

      <Text style={[styles.slotName, first && styles.slotNameFirst]} numberOfLines={1}>
        {player.display_name}
      </Text>
      <Text style={[styles.slotElo, { color: first ? MEDAL[1] : accent.warm }]}>
        {Math.round(player.elo_rating).toLocaleString()} <Text style={styles.slotEloUnit}>ELO</Text>
      </Text>
      <Text style={styles.slotWins}>{player.wins} victorias</Text>
    </Pressable>
  );
}

function LinkCard({
  glyph,
  title,
  sub,
  accent,
  onPress,
}: {
  glyph: string;
  title: string;
  sub: string;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Card style={styles.link} onPress={onPress}>
      <View style={[styles.tile, { borderColor: accent }]}>
        <Text style={styles.tileGlyph}>{glyph}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkLabel}>{title}</Text>
        <Text style={styles.meta}>{sub}</Text>
      </View>
      <IconChevron />
    </Card>
  );
}

function Stat({
  glyph,
  label,
  value,
  tint,
  strong,
}: {
  glyph: string;
  label: string;
  value: string;
  tint: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statGlyph}>{glyph}</Text>
      <View>
        <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
        <Text style={[styles.statVal, strong ? { color: tint } : null]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32 },
  backOverCover: {
    position: 'absolute',
    top: space.md,
    left: space.xl,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(4,6,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEdit: {
    position: 'absolute',
    top: space.md,
    right: space.xl,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(4,6,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditText: { fontSize: 15 },
  emblemWrap: { position: 'absolute', bottom: -22, left: 0, right: 0, alignItems: 'center' },
  emblemText: { fontSize: 17, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.5 },
  emblemSub: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6, color: colors.inkSoft, marginTop: -1 },

  pad: { paddingHorizontal: space.xl },
  hero: { alignItems: 'center', gap: space.sm, paddingTop: space.xxl, paddingBottom: space.lg },
  title: { ...type.display, fontSize: 26, textAlign: 'center' },
  desc: { fontSize: 12.5, color: colors.inkSoft, textAlign: 'center', lineHeight: 18 },
  rolePill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: 7,
    marginTop: 2,
  },
  rolePillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },

  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  slot: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
  },
  slotFirst: { paddingVertical: space.xl, backgroundColor: colors.surface },
  crown: { fontSize: 18, marginTop: -space.lg, marginBottom: 2 },
  slotAvatar: { alignItems: 'center' },
  place: {
    position: 'absolute',
    top: -4,
    left: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeText: { fontSize: 11, fontWeight: '800' },
  slotName: { fontSize: 12.5, fontWeight: '800', fontStyle: 'italic', color: colors.ink, marginTop: 5 },
  slotNameFirst: { fontSize: 14.5 },
  slotElo: { fontSize: 13, fontWeight: '800' },
  slotEloUnit: { fontSize: 9.5, fontWeight: '700', color: colors.inkSoft },
  slotWins: { fontSize: 10.5, color: colors.inkSoft },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: space.md },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: 'center' },
  statGlyph: { fontSize: 17 },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 30, backgroundColor: colors.line },

  block: { marginTop: space.xxl, gap: space.sm },
  topLink: { fontSize: 12, fontWeight: '700' },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tile: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileGlyph: { fontSize: 17 },
  linkLabel: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  season: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
});
