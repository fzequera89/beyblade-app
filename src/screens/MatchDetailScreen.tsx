import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

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

const MARGIN_OPTIONS = [
  { winnerScore: 3, loserScore: 0, label: '3 – 0' },
  { winnerScore: 3, loserScore: 1, label: '3 – 1' },
  { winnerScore: 3, loserScore: 2, label: '3 – 2' },
];

export default function MatchDetailScreen({ route, navigation }: any) {
  const { matchId } = route.params;
  const { playerId } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [pickedWinner, setPickedWinner] = useState<'a' | 'b' | null>(null);
  const [pickedMargin, setPickedMargin] = useState<number | null>(null);
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
    const { data: membership } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', data.league_id)
      .eq('player_id', playerId)
      .maybeSingle();
    setIsOrganizer(membership?.role === 'organizer');
    setLoading(false);
  }, [matchId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isParticipant = match && (match.player_a_id === playerId || match.player_b_id === playerId);
  const isReporter = match && match.reported_by === playerId;

  async function submitReport() {
    if (!match || pickedWinner === null || pickedMargin === null) return;
    const winnerId = pickedWinner === 'a' ? match.player_a_id : match.player_b_id;
    const scoreA = pickedWinner === 'a' ? pickedMargin : MARGIN_OPTIONS.find((o) => o.winnerScore === pickedMargin)!.loserScore;
    const scoreB = pickedWinner === 'a' ? MARGIN_OPTIONS.find((o) => o.winnerScore === pickedMargin)!.loserScore : pickedMargin;
    setBusy(true);
    const { error } = await supabase
      .from('matches')
      .update({
        score_a: scoreA,
        score_b: scoreB,
        winner_id: winnerId,
        status: 'reported',
        reported_by: playerId,
        reported_at: new Date().toISOString(),
      })
      .eq('id', match.id);
    setBusy(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
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

  if (loading || !match) {
    return (
      <View style={styles.container}>
        <Text>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.vsRow}>
        <Text style={styles.playerName}>{match.player_a?.display_name}</Text>
        <Text style={styles.vs}>vs</Text>
        <Text style={styles.playerName}>{match.player_b?.display_name}</Text>
      </View>

      {match.status === 'pending' && isParticipant && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reportar resultado</Text>
          <View style={styles.rowGap}>
            <Pressable
              style={[styles.choice, pickedWinner === 'a' && styles.choiceSelected]}
              onPress={() => setPickedWinner('a')}
            >
              <Text>Ganó {match.player_a?.display_name}</Text>
            </Pressable>
            <Pressable
              style={[styles.choice, pickedWinner === 'b' && styles.choiceSelected]}
              onPress={() => setPickedWinner('b')}
            >
              <Text>Ganó {match.player_b?.display_name}</Text>
            </Pressable>
          </View>
          <View style={styles.rowGap}>
            {MARGIN_OPTIONS.map((o) => (
              <Pressable
                key={o.label}
                style={[styles.choice, pickedMargin === o.winnerScore && styles.choiceSelected]}
                onPress={() => setPickedMargin(o.winnerScore)}
              >
                <Text>{o.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.button}
            onPress={submitReport}
            disabled={busy || pickedWinner === null || pickedMargin === null}
          >
            <Text style={styles.buttonText}>Enviar resultado</Text>
          </Pressable>
        </View>
      )}

      {match.status === 'pending' && !isParticipant && <Text style={styles.meta}>Esperando a que jueguen.</Text>}

      {match.status === 'reported' && (
        <View style={styles.section}>
          <Text style={styles.meta}>
            Reportado: {match.score_a} – {match.score_b}, ganó{' '}
            {match.winner_id === match.player_a_id ? match.player_a?.display_name : match.player_b?.display_name}
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

      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Volver al bracket</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 },
  playerName: { fontSize: 18, fontWeight: '700' },
  vs: { color: '#6b6b64' },
  section: { gap: 10, marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
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
