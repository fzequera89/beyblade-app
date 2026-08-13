import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import EloChart from '../components/EloChart';
import { FINISH_TYPES } from '../lib/finishTypes';

type MatchRow = {
  id: string;
  player_a_id: string;
  player_b_id: string;
  winner_id: string | null;
  score_a: number;
  score_b: number;
  combo_a_id: string | null;
  combo_b_id: string | null;
  confirmed_at: string | null;
};

type ComboStat = { id: string; name: string; played: number; won: number };

export default function StatsScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [finishCounts, setFinishCounts] = useState<Record<string, number>>({});
  const [roundsLost, setRoundsLost] = useState(0);
  const [comboStats, setComboStats] = useState<ComboStat[]>([]);
  const [eloPoints, setEloPoints] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Los matches van primero porque sus ids acotan la consulta de rounds:
    // sin ese filtro se traería todos los rounds de toda la liga.
    const { data: matchRows, error } = await supabase
      .from('matches')
      .select('id, player_a_id, player_b_id, winner_id, score_a, score_b, combo_a_id, combo_b_id, confirmed_at')
      .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: true });

    if (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
      return;
    }

    const confirmed = (matchRows as any as MatchRow[]) ?? [];
    setMatches(confirmed);
    const confirmedIds = confirmed.map((m) => m.id);

    const [{ data: roundRows }, { data: comboRows }, { data: snapshots }] = await Promise.all([
      confirmedIds.length
        ? supabase.from('match_rounds').select('winner_id, finish_type, match_id').in('match_id', confirmedIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('combos').select('id, name').eq('player_id', playerId),
      supabase
        .from('ranking_snapshots')
        .select('rating, snapshot_at')
        .eq('player_id', playerId)
        .eq('scope', 'global')
        .order('snapshot_at', { ascending: true }),
    ]);
    setLoading(false);

    // Solo cuentan los rounds de matches confirmados: un match reportado y aún
    // sin confirmar no debe mover las estadísticas (misma regla que el ELO).
    const myRounds = ((roundRows as any[]) ?? []);

    const counts: Record<string, number> = {};
    let lost = 0;
    for (const r of myRounds) {
      if (r.winner_id === playerId) {
        counts[r.finish_type] = (counts[r.finish_type] ?? 0) + 1;
      } else {
        lost += 1;
      }
    }
    setFinishCounts(counts);
    setRoundsLost(lost);

    const byCombo = new Map<string, ComboStat>();
    for (const c of ((comboRows as any[]) ?? [])) {
      byCombo.set(c.id, { id: c.id, name: c.name, played: 0, won: 0 });
    }
    for (const m of confirmed) {
      const myCombo = m.player_a_id === playerId ? m.combo_a_id : m.combo_b_id;
      if (!myCombo) continue;
      const stat = byCombo.get(myCombo);
      if (!stat) continue;
      stat.played += 1;
      if (m.winner_id === playerId) stat.won += 1;
    }
    setComboStats([...byCombo.values()].filter((c) => c.played > 0).sort((a, b) => b.played - a.played));

    setEloPoints(((snapshots as any[]) ?? []).map((s) => Number(s.rating)));
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const played = matches.length;
  const won = matches.filter((m) => m.winner_id === playerId).length;
  const winRate = played > 0 ? Math.round((won / played) * 100) : 0;

  // Racha actual: se cuenta desde el match más reciente hacia atrás.
  let currentStreak = 0;
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].winner_id === playerId) currentStreak += 1;
    else break;
  }

  let bestStreak = 0;
  let running = 0;
  for (const m of matches) {
    if (m.winner_id === playerId) {
      running += 1;
      bestStreak = Math.max(bestStreak, running);
    } else {
      running = 0;
    }
  }

  const roundsWon = Object.values(finishCounts).reduce((a, b) => a + b, 0);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Mis estadísticas</Text>
        <Text style={styles.meta}>Solo cuentan los matches ya confirmados.</Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{played}</Text>
            <Text style={styles.statLabel}>Jugados</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{won}</Text>
            <Text style={styles.statLabel}>Ganados</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{winRate}%</Text>
            <Text style={styles.statLabel}>Win rate</Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{currentStreak}</Text>
            <Text style={styles.statLabel}>Racha actual</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{bestStreak}</Text>
            <Text style={styles.statLabel}>Mejor racha</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Evolución de ELO</Text>
        <EloChart points={eloPoints} />

        <Text style={styles.sectionTitle}>Cómo ganas tus rounds</Text>
        {roundsWon === 0 ? (
          <Text style={styles.empty}>
            Todavía no hay rounds registrados. Se empiezan a llenar con los matches que reportes round a round.
          </Text>
        ) : (
          <>
            {FINISH_TYPES.map((f) => {
              const n = finishCounts[f.code] ?? 0;
              const pct = roundsWon > 0 ? (n / roundsWon) * 100 : 0;
              return (
                <View key={f.code} style={styles.finishRow}>
                  <Text style={styles.finishLabel}>{f.label}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.finishCount}>{n}</Text>
                </View>
              );
            })}
            <Text style={styles.meta}>
              {roundsWon} round{roundsWon === 1 ? '' : 's'} ganado{roundsWon === 1 ? '' : 's'} · {roundsLost} perdido
              {roundsLost === 1 ? '' : 's'}
            </Text>
          </>
        )}

        <Text style={styles.sectionTitle}>Rendimiento por combo</Text>
        {comboStats.length === 0 ? (
          <Text style={styles.empty}>
            Registra tus combos y elígelos al reportar un match para ver cuál te da mejores resultados.
          </Text>
        ) : (
          comboStats.map((c) => (
            <View key={c.id} style={styles.comboRow}>
              <Text style={styles.comboName}>{c.name}</Text>
              <Text style={styles.comboRecord}>
                {c.won}–{c.played - c.won}
              </Text>
              <Text style={styles.comboRate}>{Math.round((c.won / c.played) * 100)}%</Text>
            </View>
          ))
        )}

        <Pressable style={styles.button} onPress={() => navigation.navigate('Combos')}>
          <Text style={styles.buttonText}>Mis combos</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => navigation.navigate('Rivalries')}>
          <Text style={styles.buttonText}>Rivalidades</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => navigation.navigate('Badges')}>
          <Text style={styles.buttonText}>Mis logros</Text>
        </Pressable>

        <Pressable style={styles.back} onPress={() => navigation.goBack()} disabled={loading}>
          <Text style={styles.backText}>‹ Volver al perfil</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6 },
  statsRow: { flexDirection: 'row', gap: 24, marginVertical: 12, justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 12, color: '#6b6b64' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24, marginBottom: 8 },
  finishRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  finishLabel: { width: 60, fontSize: 13 },
  barTrack: { flex: 1, height: 8, backgroundColor: '#eee', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: '#2f5ad6' },
  finishCount: { width: 28, textAlign: 'right', fontSize: 12, fontWeight: '600' },
  comboRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  comboName: { flex: 1, fontSize: 14, fontWeight: '600' },
  comboRecord: { fontSize: 12, color: '#6b6b64' },
  comboRate: { width: 44, textAlign: 'right', fontWeight: '700', color: '#2f5ad6' },
  empty: { color: '#6b6b64', fontSize: 12 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  secondaryButton: { backgroundColor: '#444' },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
