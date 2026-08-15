import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { generateRound1Bracket } from '../lib/bracket';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import Cover from '../ui/Cover';
import { pickCoverPhoto, uploadCover } from '../lib/cover';
import { COMBAT_MODES } from '../lib/formats';
import { colors, space, type, radius } from '../theme';

// La modalidad solo se nombra cuando NO es la de siempre.
function combatLabel(mode?: string | null): string | null {
  if (!mode || mode === 'solo') return null;
  return COMBAT_MODES.find((m) => m.key === mode)?.label ?? null;
}

type Registration = {
  player_id: string;
  checked_in_at: string | null;
  players: {
    display_name: string;
    elo_rating: number;
    avatar_key: string | null;
    avatar_url: string | null;
  } | null;
};

export default function TournamentDetailScreen({ route, navigation }: any) {
  const { tournamentId, leagueId, isOrganizer } = route.params;
  const { playerId } = useAuth();
  const [name, setName] = useState('');
  const [status, setStatus] = useState('pending');
  const [mode, setMode] = useState<'ranking' | 'casual'>('ranking');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [combatMode, setCombatMode] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [hasBracket, setHasBracket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: tournament }, { data: regs }, { count: matchCount }] = await Promise.all([
      supabase
        .from('tournaments')
        .select('name, status, mode, photo_url, combat_mode')
        .eq('id', tournamentId)
        .single(),
      supabase
        .from('tournament_registrations')
        .select('player_id, checked_in_at, players(display_name, elo_rating, avatar_key, avatar_url)')
        .eq('tournament_id', tournamentId),
      supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('bracket_round', 1),
    ]);
    setLoading(false);
    setName((tournament as any)?.name ?? '');
    setStatus((tournament as any)?.status ?? 'pending');
    setMode((tournament as any)?.mode === 'casual' ? 'casual' : 'ranking');
    // Se ordena por ELO: es el orden con el que se va a sembrar el bracket
    // ranking. En casual el emparejamiento es al azar, pero mostrarlos por ELO
    // sigue siendo el orden más útil para leer la lista de inscritos.
    setRegistrations(
      ((regs as any as Registration[]) ?? []).sort(
        (a, b) => (b.players?.elo_rating ?? 0) - (a.players?.elo_rating ?? 0)
      )
    );
    setHasBracket((matchCount ?? 0) > 0);
  }, [tournamentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const mine = registrations.find((r) => r.player_id === playerId);
  const checkedIn = registrations.filter((r) => r.checked_in_at).length;

  // La portada se puede cambiar después: al crear el torneo casi nunca se
  // tiene la foto todavía, llega el día del evento.
  async function changePhoto() {
    const uri = await pickCoverPhoto();
    if (!uri) return;
    setUploading(true);
    const url = await uploadCover('tournament', tournamentId, uri);
    if (url) {
      const { error } = await supabase.from('tournaments').update({ photo_url: url }).eq('id', tournamentId);
      if (error) Alert.alert('No se pudo guardar', error.message);
    }
    setUploading(false);
    load();
  }

  // Por RPC y no por insert directo: el cupo se hace valer en el servidor, con
  // la fila del torneo bloqueada. Contando desde la app, dos personas que tocan
  // "Inscribirme" a la vez con un solo lugar libre entrarían las dos.
  async function register() {
    const { error } = await supabase.rpc('register_for_tournament', { p_tournament_id: tournamentId });
    if (error) return Alert.alert('No te pudimos inscribir', error.message);
    load();
  }

  async function checkIn() {
    const { error } = await supabase
      .from('tournament_registrations')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('tournament_id', tournamentId)
      .eq('player_id', playerId);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  async function toggleCheckIn(target: string, current: boolean) {
    const { error } = await supabase
      .from('tournament_registrations')
      .update({ checked_in_at: current ? null : new Date().toISOString() })
      .eq('tournament_id', tournamentId)
      .eq('player_id', target);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  async function generateBracket() {
    setBusy(true);
    try {
      const { pairsCreated, bye } = await generateRound1Bracket(tournamentId, leagueId);
      Alert.alert(
        'Bracket generado',
        `${pairsCreated} enfrentamiento(s) creados.${bye ? ` ${bye.display_name} pasa directo (bye).` : ''}`
      );
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'No se pudo generar el bracket');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={registrations}
        keyExtractor={(r) => r.player_id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
              <Text style={styles.back}>‹</Text>
            </Pressable>

            {/* La portada primero y a todo el ancho: entras al torneo, no a su
                ficha. Si nadie subió foto, se dibuja una. */}
            <View style={styles.cover}>
              <Cover
                id={tournamentId}
                photoUrl={photoUrl}
                live={status === 'pending'}
                height={168}
              />
              {isOrganizer && (
                <Pressable style={styles.photoBtn} onPress={changePhoto} disabled={uploading} hitSlop={6}>
                  <Text style={styles.photoBtnText}>
                    {uploading ? 'Subiendo…' : photoUrl ? '🖼️ Cambiar portada' : '🖼️ Poner portada'}
                  </Text>
                </Pressable>
              )}
            </View>

            <View style={styles.hero}>
              <Text style={styles.title}>{name}</Text>
              {combatLabel(combatMode) ? (
                <Text style={styles.combat}>{combatLabel(combatMode)}</Text>
              ) : null}
              <View style={styles.pills}>
                <Pill
                  label={status === 'pending' ? 'Registro abierto' : 'Terminado'}
                  color={status === 'pending' ? colors.win : colors.inkDim}
                />
                <Pill
                  label={mode === 'casual' ? 'Casual' : 'Ranking'}
                  color={mode === 'casual' ? colors.streak : colors.blue}
                />
              </View>
              {mode === 'casual' && (
                <Text style={styles.modeNote}>
                  Emparejamiento al azar · Aerial permitido · no mueve el ELO
                </Text>
              )}
            </View>

            <Card style={styles.stats}>
              <Stat label="Inscritos" value={String(registrations.length)} />
              <View style={styles.vDiv} />
              <Stat label="Con check-in" value={String(checkedIn)} tint={colors.win} />
            </Card>

            <View style={{ gap: space.sm }}>
              {!mine ? (
                <Button label="INSCRIBIRME" onPress={register} />
              ) : mine.checked_in_at ? (
                <Card style={styles.done}>
                  <Text style={styles.doneText}>✓ Ya hiciste check-in</Text>
                </Card>
              ) : (
                <Button label="HACER CHECK-IN" onPress={checkIn} />
              )}

              {hasBracket ? (
                <Button
                  label="VER BRACKET"
                  variant="ghost"
                  onPress={() => navigation.navigate('Bracket', { tournamentId, leagueId, isOrganizer })}
                />
              ) : isOrganizer ? (
                <>
                  <Button
                    label={`GENERAR BRACKET (${checkedIn} listos)`}
                    variant="ghost"
                    onPress={generateBracket}
                    disabled={busy || checkedIn < 2}
                    loading={busy}
                  />
                  {checkedIn < 2 && (
                    <Text style={styles.hint}>
                      Hacen falta al menos 2 jugadores con check-in para armar el bracket.
                    </Text>
                  )}
                </>
              ) : null}

              {/* Un cuerpo arbitral se convoca para el evento: sin jueces
                  nombrados, los resultados de este torneo se quedan esperando. */}
              <Button
                label="⚖️  CUERPO DE JUECES"
                variant="ghost"
                onPress={() => navigation.navigate('Judges', { tournamentId, title: 'Este torneo' })}
              />
            </View>

            <SectionTitle>
              {isOrganizer ? 'Jugadores · toca para dar check-in' : 'Jugadores inscritos'}
            </SectionTitle>
          </View>
        }
        renderItem={({ item, index }) => {
          const p = item.players;
          const here = !!item.checked_in_at;
          const me = item.player_id === playerId;
          const row = (
            <Card style={[styles.row, me && { borderColor: colors.blue }]}>
              <Text style={styles.seed}>{index + 1}</Text>
              <Avatar
                uri={p?.avatar_url}
                avatarKey={p?.avatar_key}
                size={40}
                ring={here ? colors.win : undefined}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {me ? 'Tú' : p?.display_name ?? '—'}
                </Text>
                <Text style={styles.meta}>{Math.round(p?.elo_rating ?? 1000)} ELO</Text>
              </View>
              {here ? <Pill label="Presente" color={colors.win} /> : <Text style={styles.waiting}>Falta</Text>}
            </Card>
          );

          return isOrganizer ? (
            <Pressable onPress={() => toggleCheckIn(item.player_id, here)}>{row}</Pressable>
          ) : (
            row
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card>
              <Text style={type.soft}>Nadie inscrito todavía. Sé el primero.</Text>
            </Card>
          ) : null
        }
      />
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
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  cover: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: space.md },
  combat: { fontSize: 12, color: colors.inkSoft },
  photoBtn: { paddingVertical: space.md, alignItems: 'center', backgroundColor: colors.card },
  photoBtnText: { color: colors.blue, fontSize: 12.5, fontWeight: '700' },
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  title: { ...type.display, fontSize: 22, textAlign: 'center' },
  pills: { flexDirection: 'row', gap: space.sm },
  modeNote: { fontSize: 11, color: colors.streak, textAlign: 'center' },

  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  statVal: { fontSize: 18, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 28, backgroundColor: colors.line },

  done: { alignItems: 'center', borderColor: colors.win },
  doneText: { color: colors.win, fontWeight: '700', fontSize: 13.5 },
  hint: { fontSize: 11, color: colors.inkDim, textAlign: 'center' },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  seed: { width: 20, fontSize: 12, fontWeight: '800', color: colors.inkDim, textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  waiting: { fontSize: 11, color: colors.inkDim },
});
