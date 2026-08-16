import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import EloChart from '../components/EloChart';
import { Card, SectionTitle } from '../ui/primitives';
import { IconChevron, IconFlame } from '../ui/icons';
import { FINISH_TYPES, FINISH_COLORS } from '../lib/finishTypes';
import { colors, space, type, radius } from '../theme';

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
      alerta('Error', error.message);
      return;
    }

    const confirmed = (matchRows as any as MatchRow[]) ?? [];
    setMatches(confirmed);
    const ids = confirmed.map((m) => m.id);

    const [{ data: roundRows }, { data: comboRows }, { data: snapshots }] = await Promise.all([
      ids.length
        ? supabase.from('match_rounds').select('winner_id, finish_type, points').in('match_id', ids)
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

    const counts: Record<string, number> = {};
    let lost = 0;
    for (const r of ((roundRows as any[]) ?? [])) {
      if (r.winner_id === playerId) counts[r.finish_type] = (counts[r.finish_type] ?? 0) + 1;
      else lost += 1;
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
    } else running = 0;
  }

  const roundsWon = Object.values(finishCounts).reduce((a, b) => a + b, 0);
  const finishes = FINISH_TYPES.map((f) => ({
    ...f,
    n: finishCounts[f.code] ?? 0,
    pct: roundsWon > 0 ? Math.round(((finishCounts[f.code] ?? 0) / roundsWon) * 100) : 0,
  })).filter((f) => f.n > 0);

  return (
    <Screen scroll padded={false}>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Mis estadísticas</Text>
      </View>

      <View style={styles.pad}>
        {/* Resumen */}
        <Card style={styles.summary}>
          <View style={styles.bigRow}>
            <View style={styles.big}>
              <Text style={styles.bigVal}>{winRate}%</Text>
              <Text style={styles.bigLabel}>WIN RATE</Text>
            </View>
            <View style={styles.vDiv} />
            <View style={styles.big}>
              <Text style={styles.bigVal}>
                {won}<Text style={styles.bigDim}>–{played - won}</Text>
              </Text>
              <Text style={styles.bigLabel}>RÉCORD</Text>
            </View>
          </View>

          <View style={styles.streaks}>
            <View style={styles.streak}>
              {currentStreak > 0 && <IconFlame size={14} />}
              <Text style={[styles.streakVal, currentStreak > 0 && { color: colors.streak }]}>
                {currentStreak}
              </Text>
              <Text style={styles.streakLabel}>racha actual</Text>
            </View>
            <View style={styles.streak}>
              <Text style={styles.streakVal}>{bestStreak}</Text>
              <Text style={styles.streakLabel}>mejor racha</Text>
            </View>
            <View style={styles.streak}>
              <Text style={styles.streakVal}>{played}</Text>
              <Text style={styles.streakLabel}>jugadas</Text>
            </View>
          </View>
          <Text style={styles.note}>Solo cuentan las batallas confirmadas.</Text>
        </Card>

        {/* ELO */}
        <View style={styles.block}>
          <SectionTitle>Evolución de ELO</SectionTitle>
          <Card>
            <EloChart points={eloPoints} />
          </Card>
        </View>

        {/* Finishes */}
        <View style={styles.block}>
          <SectionTitle>Cómo ganas tus rounds</SectionTitle>
          {roundsWon === 0 ? (
            <Card>
              <Text style={type.soft}>
                Todavía no hay rounds registrados. Se llenan con las batallas que reportes.
              </Text>
            </Card>
          ) : (
            <Card style={{ gap: space.md }}>
              <View style={styles.stack}>
                {finishes.map((f) => (
                  <View
                    key={f.code}
                    style={{ width: `${f.pct}%`, backgroundColor: FINISH_COLORS[f.code] }}
                  />
                ))}
              </View>

              {finishes.map((f) => (
                <View key={f.code} style={styles.finishRow}>
                  <View style={[styles.dot, { backgroundColor: FINISH_COLORS[f.code] }]} />
                  <Text style={styles.finishName}>{f.label}</Text>
                  <Text style={styles.finishPts}>{f.points} pt{f.points > 1 ? 's' : ''}</Text>
                  <Text style={styles.finishPct}>{f.pct}%</Text>
                  <Text style={styles.finishN}>{f.n}</Text>
                </View>
              ))}

              <Text style={styles.note}>
                {roundsWon} round{roundsWon === 1 ? '' : 's'} ganado{roundsWon === 1 ? '' : 's'} ·{' '}
                {roundsLost} perdido{roundsLost === 1 ? '' : 's'}
              </Text>
            </Card>
          )}
        </View>

        {/* Combos */}
        <View style={styles.block}>
          <SectionTitle
            right={
              <Pressable onPress={() => navigation.navigate('Combos')} hitSlop={6}>
                <Text style={styles.link}>Mis combos</Text>
              </Pressable>
            }
          >
            Rendimiento por combo
          </SectionTitle>

          {comboStats.length === 0 ? (
            <Card>
              <Text style={type.soft}>
                Registra tus combos y elígelos al reportar una batalla para ver cuál te funciona.
              </Text>
            </Card>
          ) : (
            comboStats.map((c, i) => {
              const rate = Math.round((c.won / c.played) * 100);
              // El combo más usado va destacado: es el que define tu estilo.
              const hero = i === 0;
              return (
                <Card key={c.id} style={[styles.combo, hero && { borderColor: colors.blue }]}>
                  <View style={styles.comboTop}>
                    <View style={{ flex: 1 }}>
                      {hero && <Text style={styles.comboTag}>TU COMBO PRINCIPAL</Text>}
                      <Text style={[styles.comboName, hero && { fontSize: 16 }]} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={styles.note}>
                        {c.played} batalla{c.played === 1 ? '' : 's'} · {c.won}–{c.played - c.won}
                      </Text>
                    </View>
                    <Text style={[styles.comboRate, rate >= 50 ? { color: colors.win } : { color: colors.loss }]}>
                      {rate}%
                    </Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${rate}%`, backgroundColor: rate >= 50 ? colors.win : colors.loss },
                      ]}
                    />
                  </View>
                </Card>
              );
            })
          )}
        </View>

        {/* Accesos */}
        <View style={styles.block}>
          <Card style={styles.linkRow} onPress={() => navigation.navigate('Rivalries')}>
            <Text style={styles.linkGlyph}>⚔️</Text>
            <Text style={styles.linkLabel}>Rivalidades</Text>
            <IconChevron />
          </Card>
          <Card style={styles.linkRow} onPress={() => navigation.navigate('Badges')}>
            <Text style={styles.linkGlyph}>🏅</Text>
            <Text style={styles.linkLabel}>Mis logros</Text>
            <IconChevron />
          </Card>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  pad: { paddingHorizontal: space.xl },

  summary: { gap: space.lg },
  bigRow: { flexDirection: 'row', alignItems: 'center' },
  big: { flex: 1, alignItems: 'center', gap: 2 },
  bigVal: { fontSize: 32, fontWeight: '800', fontStyle: 'italic', color: colors.blue },
  bigDim: { color: colors.inkDim },
  bigLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9, color: colors.inkDim },
  vDiv: { width: 1, height: 40, backgroundColor: colors.line },
  streaks: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  streak: { flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  streakVal: { fontSize: 15, fontWeight: '800', color: colors.ink },
  streakLabel: { fontSize: 10.5, color: colors.inkSoft },
  note: { fontSize: 11, color: colors.inkDim },

  block: { marginTop: space.xxl, gap: space.sm },
  link: { color: colors.blue, fontSize: 12, fontWeight: '700' },

  stack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.line },
  finishRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  finishName: { flex: 1, fontSize: 13, color: colors.ink, fontWeight: '600' },
  finishPts: { fontSize: 10.5, color: colors.inkDim, width: 42 },
  finishPct: { fontSize: 13, fontWeight: '800', color: colors.ink, width: 40, textAlign: 'right' },
  finishN: { fontSize: 11, color: colors.inkSoft, width: 26, textAlign: 'right' },

  combo: { gap: space.md },
  comboTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  comboTag: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9, color: colors.blue, marginBottom: 2 },
  comboName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  comboRate: { fontSize: 20, fontWeight: '800' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  linkGlyph: { fontSize: 18, width: 24, textAlign: 'center' },
  linkLabel: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.ink },
});
