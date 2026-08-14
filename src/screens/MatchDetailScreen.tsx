import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Pill, SectionTitle } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';
import {
  finishesFor,
  finishLabel,
  finishPoints,
  FinishCode,
  MatchMode,
} from '../lib/finishTypes';

type Match = {
  id: string;
  league_id: string | null;
  tournament_id: string | null;
  player_a_id: string;
  player_b_id: string;
  score_a: number;
  score_b: number;
  winner_id: string | null;
  status: 'pending' | 'reported' | 'confirmed' | 'disputed';
  reported_by: string | null;
  elo_a_change: number | null;
  elo_b_change: number | null;
  points_to_win: number;
  mode: MatchMode;
  player_a: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
  player_b: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
};

type Round = { winner_id: string; finish_type: FinishCode };
type SavedRound = {
  id: string;
  round_number: number;
  winner_id: string | null;
  finish_type: string | null;
  points: number;
};

export default function MatchDetailScreen({ route, navigation }: any) {
  const { matchId } = route.params;
  const { playerId } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [savedRounds, setSavedRounds] = useState<SavedRound[]>([]);
  const [combos, setCombos] = useState<{ id: string; name: string }[]>([]);
  const [isOrganizer, setIsOrganizer] = useState(false);

  const [rounds, setRounds] = useState<Round[]>([]);
  const [pickedWinner, setPickedWinner] = useState<'a' | 'b' | null>(null);
  const [pickedFinish, setPickedFinish] = useState<FinishCode | null>(null);
  const [pickedCombo, setPickedCombo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(
        'id, league_id, tournament_id, player_a_id, player_b_id, score_a, score_b, winner_id, status, reported_by, elo_a_change, elo_b_change, points_to_win, mode, player_a:players!matches_player_a_id_fkey(display_name, avatar_key, avatar_url), player_b:players!matches_player_b_id_fkey(display_name, avatar_key, avatar_url)'
      )
      .eq('id', matchId)
      .single();
    if (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
      return;
    }
    setMatch(data as any);

    const [{ data: membership }, { data: roundRows }, { data: comboRows }] = await Promise.all([
      data.league_id
        ? supabase
            .from('league_members')
            .select('role')
            .eq('league_id', data.league_id)
            .eq('player_id', playerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('match_rounds')
        .select('id, round_number, winner_id, finish_type, points')
        .eq('match_id', matchId)
        .order('round_number'),
      supabase.from('combos').select('id, name').eq('player_id', playerId).order('created_at'),
    ]);

    setIsOrganizer((membership as any)?.role === 'organizer');
    setSavedRounds((roundRows as any) ?? []);
    setCombos((comboRows as any) ?? []);
    setLoading(false);
  }, [matchId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isParticipant = match && (match.player_a_id === playerId || match.player_b_id === playerId);
  const isReporter = match && match.reported_by === playerId;

  // El marcador se calcula sumando el valor de cada finish, NO contando rounds.
  const tallyA = match
    ? rounds.filter((r) => r.winner_id === match.player_a_id).reduce((s, r) => s + finishPoints(r.finish_type), 0)
    : 0;
  const tallyB = match
    ? rounds.filter((r) => r.winner_id === match.player_b_id).reduce((s, r) => s + finishPoints(r.finish_type), 0)
    : 0;
  const target = match?.points_to_win ?? 4;
  const decided = tallyA >= target || tallyB >= target;

  function addRound() {
    if (!match || pickedWinner === null || pickedFinish === null) return;
    const winnerId = pickedWinner === 'a' ? match.player_a_id : match.player_b_id;
    setRounds([...rounds, { winner_id: winnerId, finish_type: pickedFinish }]);
    setPickedWinner(null);
    setPickedFinish(null);
  }

  async function submitReport() {
    if (!match || !decided) return;
    setBusy(true);
    const { error } = await supabase.rpc('report_match_result', {
      p_match_id: match.id,
      p_rounds: rounds,
      p_combo_id: pickedCombo,
    });
    setBusy(false);
    if (error) return Alert.alert('No se pudo registrar', error.message);
    setRounds([]);
    setPickedCombo(null);
    load();
  }

  async function confirm() {
    setBusy(true);
    const { error } = await supabase.rpc('confirm_match_result', { p_match_id: matchId });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  async function dispute() {
    setBusy(true);
    const { error } = await supabase.from('matches').update({ status: 'disputed' }).eq('id', matchId);
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  async function reopen() {
    setBusy(true);
    const { error } = await supabase
      .from('matches')
      .update({ status: 'pending', score_a: 0, score_b: 0, winner_id: null, reported_by: null, reported_at: null })
      .eq('id', matchId);
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  function nameFor(id: string | null) {
    if (!match || !id) return '—';
    return id === match.player_a_id ? match.player_a?.display_name : match.player_b?.display_name;
  }

  if (loading || !match) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const finishes = finishesFor(match.mode);
  const liveA = match.status === 'pending' ? tallyA : match.score_a;
  const liveB = match.status === 'pending' ? tallyB : match.score_b;

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Pill
          label={match.mode === 'casual' ? 'Casual' : 'Ranking'}
          color={match.mode === 'casual' ? colors.streak : colors.blue}
        />
      </View>

      {/* Marcador */}
      <View style={styles.scoreboard}>
        <View style={styles.side}>
          <Avatar
            uri={match.player_a?.avatar_url}
            avatarKey={match.player_a?.avatar_key}
            size={58}
            ring={match.winner_id === match.player_a_id ? colors.win : colors.line}
          />
          <Text style={styles.sideName} numberOfLines={1}>
            {match.player_a?.display_name}
          </Text>
        </View>

        <View style={styles.scoreMid}>
          <View style={styles.scoreRow}>
            <Text style={[styles.score, liveA > liveB && styles.scoreLead]}>{liveA}</Text>
            <Text style={styles.dash}>–</Text>
            <Text style={[styles.score, liveB > liveA && styles.scoreLead]}>{liveB}</Text>
          </View>
          <Text style={styles.target}>a {target} puntos</Text>
        </View>

        <View style={styles.side}>
          <Avatar
            uri={match.player_b?.avatar_url}
            avatarKey={match.player_b?.avatar_key}
            size={58}
            ring={match.winner_id === match.player_b_id ? colors.win : colors.line}
          />
          <Text style={styles.sideName} numberOfLines={1}>
            {match.player_b?.display_name}
          </Text>
        </View>
      </View>

      {/* Registro round a round */}
      {match.status === 'pending' && isParticipant && (
        <View style={styles.block}>
          <SectionTitle>Registrar la batalla</SectionTitle>
          <Text style={styles.hint}>
            Cada round vale distinto según cómo terminó. Gana quien acumule {target} puntos.
          </Text>

          {rounds.length > 0 && (
            <Card style={{ gap: 8 }}>
              {rounds.map((r, i) => (
                <View key={i} style={styles.roundLine}>
                  <Text style={styles.roundNum}>R{i + 1}</Text>
                  <Text style={styles.roundText} numberOfLines={1}>
                    {nameFor(r.winner_id)} · {finishLabel(r.finish_type)}
                  </Text>
                  <Text style={styles.roundPts}>+{finishPoints(r.finish_type)}</Text>
                </View>
              ))}
              <Pressable onPress={() => setRounds(rounds.slice(0, -1))} hitSlop={6}>
                <Text style={styles.undo}>Deshacer último round</Text>
              </Pressable>
            </Card>
          )}

          {!decided && (
            <>
              <Text style={type.label}>¿Quién ganó el round?</Text>
              <View style={styles.row}>
                {(['a', 'b'] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setPickedWinner(s)}
                    style={[styles.choice, { flex: 1 }, pickedWinner === s && styles.choiceOn]}
                  >
                    <Text style={[styles.choiceText, pickedWinner === s && styles.choiceTextOn]} numberOfLines={1}>
                      {s === 'a' ? match.player_a?.display_name : match.player_b?.display_name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={type.label}>¿Cómo terminó?</Text>
              <View style={styles.finishGrid}>
                {finishes.map((f) => (
                  <Pressable
                    key={f.code}
                    onPress={() => setPickedFinish(f.code)}
                    style={[styles.finish, pickedFinish === f.code && styles.choiceOn]}
                  >
                    <View style={styles.finishTop}>
                      <Text style={[styles.finishName, pickedFinish === f.code && styles.choiceTextOn]}>
                        {f.label}
                      </Text>
                      <Text style={styles.finishPts}>{f.points} pt{f.points > 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={styles.finishDesc} numberOfLines={2}>
                      {f.description}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Button
                label="AGREGAR ROUND"
                variant="ghost"
                onPress={addRound}
                disabled={pickedWinner === null || pickedFinish === null}
              />
            </>
          )}

          {combos.length > 0 && (
            <>
              <Text style={type.label}>¿Con qué combo jugaste?</Text>
              <View style={styles.row}>
                {combos.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setPickedCombo(pickedCombo === c.id ? null : c.id)}
                    style={[styles.choice, pickedCombo === c.id && styles.choiceOn]}
                  >
                    <Text style={[styles.choiceText, pickedCombo === c.id && styles.choiceTextOn]}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Button
            label={decided ? 'ENVIAR RESULTADO' : `FALTAN PUNTOS PARA LLEGAR A ${target}`}
            onPress={submitReport}
            disabled={!decided}
            loading={busy}
          />
        </View>
      )}

      {match.status === 'pending' && !isParticipant && (
        <Card style={styles.block}>
          <Text style={type.soft}>Esperando a que jueguen.</Text>
        </Card>
      )}

      {/* Confirmación */}
      {match.status === 'reported' && (
        <View style={styles.block}>
          <Card>
            <Text style={styles.reported}>
              Reportado: ganó {nameFor(match.winner_id)} por {match.score_a}–{match.score_b}
            </Text>
          </Card>
          {isOrganizer || (isParticipant && !isReporter) ? (
            <>
              <Button label="CONFIRMAR RESULTADO" onPress={confirm} loading={busy} />
              <Button label="Disputar" variant="danger" onPress={dispute} disabled={busy} />
            </>
          ) : (
            <Text style={styles.hint}>Esperando que tu rival confirme el resultado.</Text>
          )}
        </View>
      )}

      {match.status === 'disputed' && (
        <View style={styles.block}>
          <Card style={{ borderColor: colors.loss }}>
            <Text style={styles.disputed}>Resultado en disputa</Text>
            <Text style={styles.hint}>Un moderador de la liga tiene que reabrirlo.</Text>
          </Card>
          {isOrganizer && <Button label="REABRIR PARA REPORTAR DE NUEVO" onPress={reopen} loading={busy} />}
        </View>
      )}

      {match.status === 'confirmed' && (
        <View style={styles.block}>
          <Card style={styles.eloCard}>
            <EloDelta name={match.player_a?.display_name} delta={match.elo_a_change} />
            <View style={styles.eloDiv} />
            <EloDelta name={match.player_b?.display_name} delta={match.elo_b_change} />
          </Card>
        </View>
      )}

      {/* Rounds guardados */}
      {savedRounds.length > 0 && (
        <View style={styles.block}>
          <SectionTitle>Rounds</SectionTitle>
          <Card style={{ gap: 8 }}>
            {savedRounds.map((r) => (
              <View key={r.id} style={styles.roundLine}>
                <Text style={styles.roundNum}>R{r.round_number}</Text>
                <Text style={styles.roundText} numberOfLines={1}>
                  {nameFor(r.winner_id)} · {finishLabel(r.finish_type)}
                </Text>
                <Text style={styles.roundPts}>+{r.points}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}

function EloDelta({ name, delta }: { name?: string; delta: number | null }) {
  const up = (delta ?? 0) >= 0;
  return (
    <View style={styles.eloSide}>
      <Text style={styles.eloName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.eloVal, { color: up ? colors.win : colors.loss }]}>
        {up ? '+' : ''}
        {delta}
      </Text>
      <Text style={styles.eloLabel}>ELO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },

  scoreboard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: space.xl,
  },
  side: { alignItems: 'center', gap: 8, width: 92 },
  sideName: { fontSize: 12.5, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  scoreMid: { alignItems: 'center', paddingTop: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  score: { fontSize: 40, fontWeight: '800', fontStyle: 'italic', color: colors.inkDim, letterSpacing: -1 },
  scoreLead: { color: colors.ink },
  dash: { fontSize: 24, color: colors.inkDim },
  target: { fontSize: 10.5, color: colors.inkDim, marginTop: 2, letterSpacing: 0.4 },

  block: { gap: space.md, marginBottom: space.xl },
  hint: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 17 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },

  choice: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  choiceOn: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  choiceText: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  choiceTextOn: { color: colors.ink },

  finishGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  finish: {
    flexGrow: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: space.md,
    gap: 3,
  },
  finishTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  finishName: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  finishPts: { fontSize: 11, fontWeight: '800', color: colors.blue },
  finishDesc: { fontSize: 11, color: colors.inkSoft, lineHeight: 15 },

  roundLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  roundNum: { fontSize: 11, fontWeight: '800', color: colors.inkDim, width: 24 },
  roundText: { flex: 1, fontSize: 13, color: colors.ink },
  roundPts: { fontSize: 12, fontWeight: '800', color: colors.blue },
  undo: { fontSize: 12, color: colors.loss, fontWeight: '600', marginTop: 2 },

  reported: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  disputed: { fontSize: 15, fontWeight: '800', color: colors.loss, marginBottom: 4 },

  eloCard: { flexDirection: 'row', alignItems: 'center' },
  eloSide: { flex: 1, alignItems: 'center', gap: 2 },
  eloDiv: { width: 1, height: 40, backgroundColor: colors.line },
  eloName: { fontSize: 12, color: colors.inkSoft },
  eloVal: { fontSize: 22, fontWeight: '800' },
  eloLabel: { fontSize: 9, color: colors.inkDim, letterSpacing: 1 },
});
