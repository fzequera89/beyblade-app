import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import { FINISH_TYPES, FinishCode, finishLabel } from '../lib/finishTypes';

type Match = {
  id: string;
  league_id: string;
  tournament_id: string;
  player_a_id: string;
  player_b_id: string;
  score_a: number;
  score_b: number;
  winner_id: string | null;
  status: 'pending' | 'reported' | 'confirmed' | 'disputed';
  reported_by: string | null;
  elo_a_change: number | null;
  elo_b_change: number | null;
  player_a: { display_name: string } | null;
  player_b: { display_name: string } | null;
};

type Round = { winner_id: string; finish_type: FinishCode };

type SavedRound = { id: string; round_number: number; winner_id: string | null; finish_type: string | null };

type Combo = { id: string; name: string };

// Al mejor de 5: el primero que llega a 3 rounds gana el match.
const ROUNDS_TO_WIN = 3;

export default function MatchDetailScreen({ route, navigation }: any) {
  const { matchId } = route.params;
  const { playerId } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [savedRounds, setSavedRounds] = useState<SavedRound[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
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
        'id, league_id, tournament_id, player_a_id, player_b_id, score_a, score_b, winner_id, status, reported_by, elo_a_change, elo_b_change, player_a:players!matches_player_a_id_fkey(display_name), player_b:players!matches_player_b_id_fkey(display_name)'
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
      supabase
        .from('league_members')
        .select('role')
        .eq('league_id', data.league_id)
        .eq('player_id', playerId)
        .maybeSingle(),
      supabase
        .from('match_rounds')
        .select('id, round_number, winner_id, finish_type')
        .eq('match_id', matchId)
        .order('round_number'),
      supabase.from('combos').select('id, name').eq('player_id', playerId).order('created_at'),
    ]);
    setIsOrganizer(membership?.role === 'organizer');
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

  const tallyA = match ? rounds.filter((r) => r.winner_id === match.player_a_id).length : 0;
  const tallyB = match ? rounds.filter((r) => r.winner_id === match.player_b_id).length : 0;
  const matchDecided = tallyA >= ROUNDS_TO_WIN || tallyB >= ROUNDS_TO_WIN;

  function addRound() {
    if (!match || pickedWinner === null || pickedFinish === null) return;
    const winnerId = pickedWinner === 'a' ? match.player_a_id : match.player_b_id;
    setRounds([...rounds, { winner_id: winnerId, finish_type: pickedFinish }]);
    setPickedWinner(null);
    setPickedFinish(null);
  }

  function undoRound() {
    setRounds(rounds.slice(0, -1));
  }

  async function submitReport() {
    if (!match || !matchDecided) return;
    setBusy(true);
    const { error } = await supabase.rpc('report_match_result', {
      p_match_id: match.id,
      p_rounds: rounds,
      p_combo_id: pickedCombo,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setRounds([]);
    setPickedCombo(null);
    load();
  }

  async function confirm() {
    setBusy(true);
    const { error } = await supabase.rpc('confirm_match_result', { p_match_id: matchId });
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function dispute() {
    setBusy(true);
    const { error } = await supabase.from('matches').update({ status: 'disputed' }).eq('id', matchId);
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function resolveDispute() {
    setBusy(true);
    const { error } = await supabase
      .from('matches')
      .update({ status: 'pending', score_a: 0, score_b: 0, winner_id: null, reported_by: null, reported_at: null })
      .eq('id', matchId);
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  function nameFor(id: string | null) {
    if (!match || !id) return '—';
    return id === match.player_a_id ? match.player_a?.display_name : match.player_b?.display_name;
  }

  if (loading || !match) {
    return (
      <Screen style={styles.container}>
        <Text>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.vsRow}>
        <Text style={styles.playerName}>{match.player_a?.display_name}</Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={styles.playerName}>{match.player_b?.display_name}</Text>
      </View>

      {match.status === 'pending' && isParticipant && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reportar resultado</Text>
          <Text style={styles.meta}>
            Registra los rounds uno por uno. El match se cierra cuando alguien llega a {ROUNDS_TO_WIN}.
          </Text>

          <View style={styles.tallyRow}>
            <Text style={styles.tally}>{tallyA}</Text>
            <Text style={styles.vs}>–</Text>
            <Text style={styles.tally}>{tallyB}</Text>
          </View>

          {rounds.length > 0 && (
            <View style={styles.roundList}>
              {rounds.map((r, i) => (
                <Text key={i} style={styles.roundLine}>
                  Round {i + 1}: ganó {nameFor(r.winner_id)} · {finishLabel(r.finish_type)}
                </Text>
              ))}
              <Pressable onPress={undoRound}>
                <Text style={styles.undo}>Deshacer último round</Text>
              </Pressable>
            </View>
          )}

          {!matchDecided && (
            <>
              <Text style={styles.label}>¿Quién ganó el round?</Text>
              <View style={styles.rowGap}>
                <Pressable
                  style={[styles.choice, pickedWinner === 'a' && styles.choiceSelected]}
                  onPress={() => setPickedWinner('a')}
                >
                  <Text>{match.player_a?.display_name}</Text>
                </Pressable>
                <Pressable
                  style={[styles.choice, pickedWinner === 'b' && styles.choiceSelected]}
                  onPress={() => setPickedWinner('b')}
                >
                  <Text>{match.player_b?.display_name}</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>¿Cómo terminó?</Text>
              <View style={styles.rowGap}>
                {FINISH_TYPES.map((f) => (
                  <Pressable
                    key={f.code}
                    style={[styles.choice, pickedFinish === f.code && styles.choiceSelected]}
                    onPress={() => setPickedFinish(f.code)}
                  >
                    <Text>{f.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={styles.button}
                onPress={addRound}
                disabled={pickedWinner === null || pickedFinish === null}
              >
                <Text style={styles.buttonText}>Agregar round</Text>
              </Pressable>
            </>
          )}

          {combos.length > 0 && (
            <>
              <Text style={styles.label}>¿Con qué combo jugaste? (opcional)</Text>
              <View style={styles.rowGap}>
                {combos.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[styles.choice, pickedCombo === c.id && styles.choiceSelected]}
                    onPress={() => setPickedCombo(pickedCombo === c.id ? null : c.id)}
                  >
                    <Text>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {combos.length === 0 && (
            <Pressable onPress={() => navigation.navigate('Combos')}>
              <Text style={styles.link}>Registra tus combos para medir cuál te funciona mejor →</Text>
            </Pressable>
          )}

          <Pressable style={styles.button} onPress={submitReport} disabled={busy || !matchDecided}>
            <Text style={styles.buttonText}>
              {matchDecided ? 'Enviar resultado' : `Faltan rounds para llegar a ${ROUNDS_TO_WIN}`}
            </Text>
          </Pressable>
        </View>
      )}

      {match.status === 'pending' && !isParticipant && <Text style={styles.meta}>Esperando a que jueguen.</Text>}

      {match.status === 'reported' && (
        <View style={styles.section}>
          <Text style={styles.meta}>
            Reportado: {match.score_a} – {match.score_b}, ganó {nameFor(match.winner_id)}
          </Text>
          {(isOrganizer || (isParticipant && !isReporter)) && (
            <View style={styles.rowGap}>
              <Pressable style={styles.button} onPress={confirm} disabled={busy}>
                <Text style={styles.buttonText}>Confirmar</Text>
              </Pressable>
              <Pressable style={[styles.button, styles.dangerButton]} onPress={dispute} disabled={busy}>
                <Text style={styles.buttonText}>Disputar</Text>
              </Pressable>
            </View>
          )}
          {isReporter && !isOrganizer && <Text style={styles.meta}>Esperando confirmación del rival.</Text>}
        </View>
      )}

      {match.status === 'disputed' && (
        <View style={styles.section}>
          <Text style={styles.metaDanger}>Resultado en disputa.</Text>
          {isOrganizer && (
            <Pressable style={styles.button} onPress={resolveDispute} disabled={busy}>
              <Text style={styles.buttonText}>Reabrir para reportar de nuevo</Text>
            </Pressable>
          )}
        </View>
      )}

      {match.status === 'confirmed' && (
        <View style={styles.section}>
          <Text style={styles.meta}>
            Resultado final: {match.score_a} – {match.score_b}
          </Text>
          <View style={styles.rowGap}>
            <Text style={styles.eloChange}>
              {match.player_a?.display_name}: {(match.elo_a_change ?? 0) >= 0 ? '+' : ''}
              {match.elo_a_change}
            </Text>
            <Text style={styles.eloChange}>
              {match.player_b?.display_name}: {(match.elo_b_change ?? 0) >= 0 ? '+' : ''}
              {match.elo_b_change}
            </Text>
          </View>
        </View>
      )}

      {savedRounds.length > 0 && match.status !== 'pending' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rounds</Text>
          {savedRounds.map((r) => (
            <Text key={r.id} style={styles.roundLine}>
              Round {r.round_number}: ganó {nameFor(r.winner_id)} · {finishLabel(r.finish_type)}
            </Text>
          ))}
        </View>
      )}

      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Volver al bracket</Text>
      </Pressable>
    </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#fff' },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 },
  playerName: { fontSize: 18, fontWeight: '700' },
  vs: { color: '#6b6b64' },
  section: { gap: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  tallyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  tally: { fontSize: 32, fontWeight: '700', color: '#2f5ad6' },
  roundList: { gap: 4, backgroundColor: '#f6f7fb', borderRadius: 8, padding: 10 },
  roundLine: { fontSize: 12, color: '#333' },
  undo: { fontSize: 12, color: '#b00020', marginTop: 4 },
  link: { fontSize: 12, color: '#2f5ad6', fontWeight: '600' },
  rowGap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  choice: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  choiceSelected: { borderColor: '#2f5ad6', backgroundColor: '#e8edfd' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1 },
  dangerButton: { backgroundColor: '#b00020' },
  buttonText: { color: '#fff', fontWeight: '600' },
  meta: { color: '#6b6b64' },
  metaDanger: { color: '#b00020', fontWeight: '600' },
  eloChange: { fontWeight: '600' },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
