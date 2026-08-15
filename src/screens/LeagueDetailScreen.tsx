import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import Cover from '../ui/Cover';
import { pickCoverPhoto, uploadCover } from '../lib/cover';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius } from '../theme';

type Season = { id: string; name: string; start_date: string | null; end_date: string | null };
type League = { id: string; name: string; description: string | null; photo_url: string | null };

export default function LeagueDetailScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const { playerId } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [role, setRole] = useState<'member' | 'organizer' | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [tournamentCount, setTournamentCount] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
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
        supabase.from('league_members').select('player_id, players(elo_rating)').eq('league_id', leagueId),
        supabase.from('tournaments').select('*', { count: 'exact', head: true }).eq('league_id', leagueId),
      ]);

    setLoading(false);
    setLeague(leagueData ?? null);
    setRole((membership?.role as any) ?? null);
    setSeasons(seasonRows ?? []);
    setTournamentCount(tCount ?? 0);

    const list = ((roster as any[]) ?? []).map((r) => ({
      id: r.player_id,
      elo: r.players?.elo_rating ?? 1000,
    }));
    setMemberCount(list.length);
    list.sort((a, b) => b.elo - a.elo);
    const idx = list.findIndex((p) => p.id === playerId);
    setMyRank(idx >= 0 ? idx + 1 : null);
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

  return (
    <Screen scroll padded={false}>
      <View style={styles.headRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.pad}>
        {/* La portada primero: entras a la liga, no a su ficha. */}
        <View style={styles.cover}>
          <Cover id={league.id} photoUrl={league.photo_url} height={160} />
          {role === 'organizer' && (
            <Pressable style={styles.coverBtn} onPress={changeCover} disabled={uploading} hitSlop={6}>
              <Text style={styles.coverBtnText}>
                {uploading ? 'Subiendo…' : league.photo_url ? '🖼️ Cambiar portada' : '🖼️ Poner portada'}
              </Text>
            </Pressable>
          )}
        </View>

        <View style={styles.hero}>
          <Text style={styles.title}>{league.name}</Text>
          {league.description ? <Text style={styles.desc}>{league.description}</Text> : null}
          {role && (
            <Pill
              label={role === 'organizer' ? 'Eres moderador' : 'Eres miembro'}
              color={role === 'organizer' ? colors.streak : colors.blue}
              align="center"
            />
          )}
        </View>

        <Card style={styles.stats}>
          <Stat label="Miembros" value={String(memberCount)} />
          <View style={styles.vDiv} />
          <Stat label="Torneos" value={String(tournamentCount)} />
          <View style={styles.vDiv} />
          <Stat
            label="Tu posición"
            value={myRank ? `#${myRank}` : '—'}
            tint={myRank ? colors.blue : undefined}
          />
        </Card>

        {!role && (
          <View style={{ marginTop: space.lg }}>
            <Button label="UNIRME A ESTA LIGA" onPress={join} />
          </View>
        )}

        <View style={styles.block}>
          <Card
            style={styles.link}
            onPress={() => navigation.navigate('Tournaments', { leagueId, isOrganizer: role === 'organizer' })}
          >
            <Text style={styles.linkGlyph}>🏆</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLabel}>Torneos</Text>
              <Text style={styles.meta}>
                {tournamentCount} torneo{tournamentCount === 1 ? '' : 's'} en esta liga
              </Text>
            </View>
            <IconChevron />
          </Card>

          <Card style={styles.link} onPress={() => navigation.navigate('LeagueStandings', { leagueId })}>
            <Text style={styles.linkGlyph}>📊</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLabel}>Ranking de la liga</Text>
              <Text style={styles.meta}>Posiciones y reporte</Text>
            </View>
            <IconChevron />
          </Card>

          <Card
            style={styles.link}
            onPress={() => navigation.navigate('Judges', { leagueId, title: league.name })}
          >
            <Text style={styles.linkGlyph}>⚖️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkLabel}>Cuerpo de jueces</Text>
              <Text style={styles.meta}>Quién aprueba los resultados de esta liga</Text>
            </View>
            <IconChevron />
          </Card>
        </View>

        <View style={styles.block}>
          <SectionTitle>Temporadas</SectionTitle>
          {seasons.length === 0 ? (
            <Card>
              <Text style={type.soft}>Sin temporadas todavía.</Text>
            </Card>
          ) : (
            seasons.map((s) => (
              <Card
                key={s.id}
                style={styles.season}
                onPress={() =>
                  navigation.navigate('Ladder', { seasonId: s.id, leagueId, seasonName: s.name })
                }
              >
                <Hex size={38} color={colors.blue}>
                  <Text style={{ fontSize: 14 }}>📅</Text>
                </Hex>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{s.name}</Text>
                  <Text style={styles.meta}>
                    {s.start_date
                      ? `${new Date(s.start_date).toLocaleDateString()}${
                          s.end_date ? ` – ${new Date(s.end_date).toLocaleDateString()}` : ''
                        } · `
                      : ''}
                    Ver escalafón
                  </Text>
                </View>
                <IconChevron />
              </Card>
            ))
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
  headRow: { paddingHorizontal: space.xl, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  pad: { paddingHorizontal: space.xl },

  cover: { borderRadius: radius.lg, overflow: 'hidden', marginTop: space.md },
  coverBtn: { paddingVertical: space.md, alignItems: 'center', backgroundColor: colors.card },
  coverBtnText: { color: colors.blue, fontSize: 12.5, fontWeight: '700' },
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  title: { ...type.display, fontSize: 24, textAlign: 'center' },
  desc: { fontSize: 12.5, color: colors.inkSoft, textAlign: 'center', lineHeight: 18 },

  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 28, backgroundColor: colors.line },

  block: { marginTop: space.xxl, gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  linkGlyph: { fontSize: 19, width: 26, textAlign: 'center' },
  linkLabel: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  season: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
});
