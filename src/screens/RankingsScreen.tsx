import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Chip } from '../ui/primitives';
import { FINISH_TYPES, FINISH_COLORS as FINISH_COLOR } from '../lib/finishTypes';
import { colors, space, type, radius } from '../theme';

function ChampStat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.champStat}>
      <Text style={styles.champStatLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.champStatVal, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

// Rankings solo consulta posiciones. Nada que se juegue vive aquí — eso está en
// Batallas. La diferencia es de intención: aquí vienes a ver dónde vas.
//
// Antes esta pestaña abría en la pantalla del panel de administrador, que se
// estaba usando de relleno.

type Scope = 'global' | 'ciudad' | 'liga';

type Row = {
  id: string;
  display_name: string;
  city: string | null;
  elo_rating: number;
  matches_played: number;
  avatar_key: string | null;
  avatar_url: string | null;
};

// Solo se calcula para el líder. Es la única tarjeta que justifica consultas
// extra: es la que la gente mira.
type ChampStats = {
  wins: number;
  winRate: number;
  finishes: { code: string; label: string; pct: number; n: number }[];
  combo: string | null;
};

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'global', label: 'Global' },
  { key: 'ciudad', label: 'Mi ciudad' },
  { key: 'liga', label: 'Liga' },
];

// El podio se marca con color, no solo con el número: en una lista larga el
// primero tiene que reconocerse sin leer.
function rankColor(pos: number) {
  if (pos === 1) return colors.streak;
  if (pos === 2) return '#C3CDDD';
  if (pos === 3) return '#C77B45';
  return colors.inkDim;
}

export default function RankingsScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [scope, setScope] = useState<Scope>('global');
  const [rows, setRows] = useState<Row[]>([]);
  const [myCity, setMyCity] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<{ id: string; name: string }[]>([]);
  const [leagueId, setLeagueId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [champ, setChamp] = useState<ChampStats | null>(null);

  // Se cargan una vez: definen qué puede consultar este jugador.
  useEffect(() => {
    (async () => {
      const [{ data: me }, { data: mem }] = await Promise.all([
        supabase.from('players').select('city').eq('id', playerId).maybeSingle(),
        supabase.from('league_members').select('league_id, leagues(id, name)').eq('player_id', playerId),
      ]);
      setMyCity((me as any)?.city ?? null);
      const ls = ((mem as any[]) ?? []).map((m) => m.leagues).filter(Boolean);
      setLeagues(ls);
      if (ls.length > 0) setLeagueId(ls[0].id);
    })();
  }, [playerId]);

  const load = useCallback(async () => {
    setLoading(true);
    const cols = 'id, display_name, city, elo_rating, matches_played, avatar_key, avatar_url';

    if (scope === 'liga') {
      if (!leagueId) {
        setRows([]);
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from('league_members')
        .select(`player_id, players(${cols})`)
        .eq('league_id', leagueId);
      const list = ((data as any[]) ?? []).map((m) => m.players).filter(Boolean) as Row[];
      list.sort((a, b) => b.elo_rating - a.elo_rating);
      setRows(list);
      setLoading(false);
      return;
    }

    let q = supabase.from('players').select(cols).order('elo_rating', { ascending: false }).limit(100);
    if (scope === 'ciudad' && myCity) q = q.eq('city', myCity);
    const { data } = await q;
    setRows((data as any) ?? []);
    setLoading(false);
  }, [scope, myCity, leagueId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Estadísticas del líder. Va aparte de `load` porque depende de quién quedó
  // primero, y solo se pide para ese jugador: hacerlo para los 100 sería
  // absurdo cuando solo se muestra uno.
  const loadChampion = useCallback(async (id: string, matchesPlayed: number) => {
    const [{ count: wins }, { data: roundRows }, { data: played }] = await Promise.all([
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'confirmed').eq('winner_id', id),
      supabase
        .from('match_rounds')
        .select('finish_type, matches!inner(status)')
        .eq('winner_id', id)
        .eq('matches.status', 'confirmed'),
      supabase
        .from('matches')
        .select('player_a_id, combo_a_id, combo_b_id')
        .eq('status', 'confirmed')
        .or(`player_a_id.eq.${id},player_b_id.eq.${id}`),
    ]);

    // Cómo gana sus rounds
    const counts: Record<string, number> = {};
    for (const r of ((roundRows as any[]) ?? [])) {
      counts[r.finish_type] = (counts[r.finish_type] ?? 0) + 1;
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const finishes = FINISH_TYPES.map((f) => ({
      code: f.code,
      label: f.label,
      n: counts[f.code] ?? 0,
      pct: total > 0 ? Math.round(((counts[f.code] ?? 0) / total) * 100) : 0,
    }))
      .filter((f) => f.n > 0)
      .sort((a, b) => b.n - a.n);

    // Combo más usado
    const usage: Record<string, number> = {};
    for (const m of ((played as any[]) ?? [])) {
      const c = m.player_a_id === id ? m.combo_a_id : m.combo_b_id;
      if (c) usage[c] = (usage[c] ?? 0) + 1;
    }
    const topComboId = Object.entries(usage).sort((a, b) => b[1] - a[1])[0]?.[0];
    let combo: string | null = null;
    if (topComboId) {
      const { data: c } = await supabase.from('combos').select('name').eq('id', topComboId).maybeSingle();
      combo = (c as any)?.name ?? null;
    }

    setChamp({
      wins: wins ?? 0,
      winRate: matchesPlayed > 0 ? Math.round(((wins ?? 0) / matchesPlayed) * 100) : 0,
      finishes,
      combo,
    });
  }, []);

  useEffect(() => {
    if (rows.length > 0) loadChampion(rows[0].id, rows[0].matches_played);
    else setChamp(null);
  }, [rows, loadChampion]);

  const myPos = rows.findIndex((r) => r.id === playerId) + 1;
  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <Screen padded={false}>
      <View style={styles.head}>
        <Text style={styles.title}>Rankings</Text>
        <Text style={styles.sub}>Un solo ELO global. Las vistas son filtros sobre él.</Text>
      </View>

      <View style={styles.scopes}>
        {SCOPES.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setScope(s.key)}
            style={[styles.scope, scope === s.key && styles.scopeOn]}
          >
            <Text style={[styles.scopeText, scope === s.key && styles.scopeTextOn]}>{s.label}</Text>
          </Pressable>
        ))}
      </View>

      {scope === 'liga' && leagues.length > 1 && (
        <View style={styles.leagueRow}>
          {leagues.map((l) => (
            <Chip key={l.id} label={l.name} selected={leagueId === l.id} onPress={() => setLeagueId(l.id)} />
          ))}
        </View>
      )}

      {myPos > 0 && (
        <View style={styles.myBox}>
          <Text style={styles.myLabel}>TU POSICIÓN</Text>
          <Text style={styles.myPos}>#{myPos}</Text>
          <Text style={styles.myOf}>de {rows.length}</Text>
        </View>
      )}

      <FlatList
        data={rest}
        keyExtractor={(r) => r.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          podium.length > 0 ? <Podium rows={podium} champ={champ} navigation={navigation} /> : null
        }
        renderItem={({ item, index }) => {
          // El índice arranca en 0 para el cuarto lugar, porque los tres
          // primeros salieron de la lista hacia el podio.
          const pos = index + 4;
          const me = item.id === playerId;
          return (
            <Card
              style={[styles.row, me && styles.rowMe]}
              onPress={() => navigation.navigate('PlayerProfile', { playerId: item.id })}
            >
              <Text style={styles.pos}>{pos}</Text>
              <Avatar uri={item.avatar_url} avatarKey={item.avatar_key} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text style={styles.meta}>
                  {item.city ?? 'Sin ciudad'} · {item.matches_played} PJ
                </Text>
              </View>
              <Text style={styles.elo}>{Math.round(item.elo_rating).toLocaleString()}</Text>
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              {scope === 'ciudad' && !myCity
                ? 'Define tu ciudad en tu perfil para ver este ranking.'
                : scope === 'liga' && leagues.length === 0
                ? 'No perteneces a ninguna liga todavía.'
                : 'Sin jugadores todavía.'}
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

// El podio se separa de la lista porque el 1º no compite con el 2º y 3º por
// atención: es el que hay que reconocer de un vistazo. Por eso va en tarjeta
// propia, a lo ancho y con el avatar grande, mientras que 2º y 3º comparten
// una fila con tratamiento intermedio.
function Podium({
  rows,
  champ,
  navigation,
}: {
  rows: Row[];
  champ: ChampStats | null;
  navigation: any;
}) {
  const [first, second, third] = rows;

  return (
    <View style={styles.podium}>
      {first && (
        <Pressable
          style={styles.champion}
          onPress={() => navigation.navigate('PlayerProfile', { playerId: first.id })}
        >
          <View style={styles.crownRow}>
            <Text style={styles.crown}>👑</Text>
            <Text style={styles.championLabel}>LÍDER DEL RANKING</Text>
          </View>

          <View style={styles.championTop}>
            <Avatar uri={first.avatar_url} avatarKey={first.avatar_key} size={86} ring={colors.streak} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.championName} numberOfLines={1}>
                {first.display_name}
              </Text>
              <Text style={styles.championMeta}>{first.city ?? 'Sin ciudad'}</Text>
              <Text style={styles.championElo}>{Math.round(first.elo_rating).toLocaleString()}</Text>
              <Text style={styles.championEloLabel}>ELO</Text>
            </View>
          </View>

          <View style={styles.championStats}>
            <ChampStat label="Jugados" value={String(first.matches_played)} />
            <View style={styles.vDiv} />
            <ChampStat label="Ganados" value={champ ? String(champ.wins) : '—'} />
            <View style={styles.vDiv} />
            <ChampStat
              label="Win rate"
              value={champ ? `${champ.winRate}%` : '—'}
              tint={colors.streak}
            />
          </View>

          {champ && champ.finishes.length > 0 && (
            <View style={styles.finishBlock}>
              <Text style={styles.blockLabel}>CÓMO GANA SUS ROUNDS</Text>
              {/* Barra apilada: se lee la mezcla de un vistazo, sin contar. */}
              <View style={styles.stack}>
                {champ.finishes.map((f) => (
                  <View
                    key={f.code}
                    style={{ width: `${f.pct}%`, backgroundColor: FINISH_COLOR[f.code] ?? colors.blue }}
                  />
                ))}
              </View>
              <View style={styles.legend}>
                {champ.finishes.map((f) => (
                  <View key={f.code} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: FINISH_COLOR[f.code] ?? colors.blue }]} />
                    <Text style={styles.legendText}>
                      {f.label} {f.pct}%
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {champ?.combo && (
            <View style={styles.comboRow}>
              <Text style={styles.blockLabel}>COMBO MÁS USADO</Text>
              <Text style={styles.comboName} numberOfLines={1}>
                {champ.combo}
              </Text>
            </View>
          )}
        </Pressable>
      )}

      <View style={styles.runners}>
        {[second, third].map((p, i) =>
          p ? (
            <Pressable
              key={p.id}
              style={[styles.runner, { borderColor: rankColor(i + 2) + '77' }]}
              onPress={() => navigation.navigate('PlayerProfile', { playerId: p.id })}
            >
              <Text style={[styles.runnerPos, { color: rankColor(i + 2) }]}>{i + 2}</Text>
              <Avatar uri={p.avatar_url} avatarKey={p.avatar_key} size={54} ring={rankColor(i + 2)} />
              <Text style={styles.runnerName} numberOfLines={1}>
                {p.display_name}
              </Text>
              <Text style={styles.runnerElo}>{Math.round(p.elo_rating).toLocaleString()}</Text>
            </Pressable>
          ) : (
            <View key={i} style={{ flex: 1 }} />
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.lg },

  podium: { gap: space.md, marginBottom: space.lg },
  champion: {
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.streak,
    borderRadius: radius.lg,
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
  },
  crownRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  crown: { fontSize: 15 },
  championLabel: { ...type.label, fontSize: 9.5, color: colors.streak },
  championTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg, alignSelf: 'stretch' },
  championName: { ...type.display, fontSize: 22 },
  championMeta: { fontSize: 11.5, color: colors.inkSoft },
  championElo: { fontSize: 28, fontWeight: '800', color: colors.streak, marginTop: 4 },
  championEloLabel: { fontSize: 9, letterSpacing: 1.4, color: colors.inkDim, marginTop: -4 },

  championStats: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  champStat: { flex: 1, alignItems: 'center', gap: 2 },
  champStatLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7, color: colors.inkDim },
  champStatVal: { fontSize: 16, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 26, backgroundColor: colors.line },

  finishBlock: { alignSelf: 'stretch', gap: 8, marginTop: space.xs },
  blockLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9, color: colors.inkDim },
  stack: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.line },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 10.5, color: colors.inkSoft, fontWeight: '600' },

  comboRow: { alignSelf: 'stretch', gap: 3 },
  comboName: { fontSize: 13.5, fontWeight: '700', color: colors.ink },

  runners: { flexDirection: 'row', gap: space.md },
  runner: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
  },
  runnerPos: { fontSize: 13, fontWeight: '800' },
  runnerName: { fontSize: 13, fontWeight: '700', color: colors.ink, marginTop: 2 },
  runnerElo: { fontSize: 15, fontWeight: '800', color: colors.ink },
  title: { ...type.display, fontSize: 28 },
  sub: { ...type.soft, marginTop: 4, fontSize: 12.5 },

  scopes: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.xl, marginBottom: space.md },
  scope: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  scopeOn: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  scopeText: { fontSize: 12.5, fontWeight: '700', color: colors.inkSoft },
  scopeTextOn: { color: colors.ink },

  leagueRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.xl,
    marginBottom: space.md,
  },

  myBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    marginHorizontal: space.xl,
    marginBottom: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    backgroundColor: colors.blueDeep,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.blue,
  },
  myLabel: { ...type.label, fontSize: 9, color: colors.blueHi, flex: 1 },
  myPos: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  myOf: { fontSize: 12, color: colors.inkSoft },

  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowMe: { borderColor: colors.blue },
  pos: { width: 26, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  elo: { fontSize: 15, fontWeight: '800', color: colors.blue },
  empty: { textAlign: 'center', color: colors.inkSoft, marginTop: space.xxl, paddingHorizontal: space.xl },
});
