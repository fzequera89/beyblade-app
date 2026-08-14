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
import { categoryLabel, categoryColor, VP_BY_CATEGORY, formatVp } from '../lib/categories';

type Row = {
  player_id: string;
  display_name: string;
  category_code: string;
  division: string | null;
  vp: number;
  point_diff: number;
  matches_won: number;
  matches_lost: number;
  active: boolean;
  tier: number;
  place: number;
};

// El escalafón del reglamento DML: categorías, VP y posición dentro de cada
// una. NO es el ranking de ELO — son dos sistemas a propósito. El ELO mide
// habilidad personal y cruza ligas; esto mide la posición oficial de esta
// temporada y se resetea cada 3 meses.
export default function LadderScreen({ route, navigation }: any) {
  const { seasonId, leagueId, seasonName } = route.params ?? {};
  const { playerId } = useAuth();

  const [rows, setRows] = useState<Row[]>([]);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data, error }, { data: membership }, { data: admin }] = await Promise.all([
      supabase.rpc('season_standings_ordered', { p_season_id: seasonId, p_category: null }),
      leagueId
        ? supabase
            .from('league_members')
            .select('role')
            .eq('league_id', leagueId)
            .eq('player_id', playerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('players').select('is_admin').eq('id', playerId).maybeSingle(),
    ]);

    if (error) {
      setLoading(false);
      return Alert.alert('Error', error.message);
    }

    setRows(((data as any) ?? []) as Row[]);
    setIsOrganizer((membership as any)?.role === 'organizer' || (admin as any)?.is_admin === true);
    setLoading(false);
  }, [seasonId, leagueId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const mine = rows.find((r) => r.player_id === playerId);

  async function enroll() {
    setBusy(true);
    const { error } = await supabase.rpc('enroll_in_season', {
      p_season_id: seasonId,
      p_player_id: playerId,
      p_category_code: null,
    });
    setBusy(false);
    if (error) return Alert.alert('No se pudo inscribir', error.message);
    load();
  }

  async function openChallenge(challengerId: string, name: string) {
    Alert.alert(
      'Reto de ascenso',
      `${name} va 1º de su categoría y puede retar al último de la superior. Se crea un combate normal; si gana, intercambian posiciones.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abrir reto',
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase.rpc('open_promotion_challenge', {
              p_season_id: seasonId,
              p_challenger_id: challengerId,
              p_tournament_id: null,
            });
            setBusy(false);
            if (error) return Alert.alert('No se pudo abrir', error.message);
            Alert.alert('Reto abierto', 'El combate ya aparece en Batallas.');
            load();
          },
        },
      ]
    );
  }

  async function rebalance() {
    setBusy(true);
    const { error } = await supabase.rpc('rebalance_divisions', { p_season_id: seasonId });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    Alert.alert('Listo', 'Las categorías que pasaban de cupo quedaron partidas en divisiones.');
    load();
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  // Agrupadas de la más alta a la más baja, que es como se lee una tabla.
  const groups: { key: string; code: string; division: string | null; rows: Row[] }[] = [];
  for (const r of rows) {
    const key = `${r.category_code}::${r.division ?? ''}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, code: r.category_code, division: r.division, rows: [] };
      groups.push(g);
    }
    g.rows.push(r);
  }

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>Escalafón</Text>
        <Text style={styles.sub}>{seasonName ?? 'Temporada'}</Text>
      </View>

      <Card style={{ marginBottom: space.lg }}>
        <Text style={styles.hint}>
          Esta es la tabla oficial de la liga: categoría, posición y VP de la temporada. Es un
          sistema aparte del ELO — el ELO mide tu habilidad y no se resetea nunca; esto se
          reinicia cada temporada.
        </Text>
      </Card>

      {mine ? (
        <Card style={[styles.mine, { borderColor: categoryColor(mine.category_code) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.mineTag}>TU POSICIÓN</Text>
            <Text style={styles.mineCat}>
              {categoryLabel(mine.category_code)}
              {mine.division ? ` ${mine.division}` : ''} · #{mine.place}
            </Text>
            <Text style={styles.meta}>
              {formatVp(mine.vp)} VP · diferencia {formatVp(mine.point_diff)} · arriesgas{' '}
              {VP_BY_CATEGORY[mine.category_code] ?? 1} por combate
            </Text>
          </View>
        </Card>
      ) : (
        <Card style={{ gap: space.md, marginBottom: space.lg }}>
          <Text style={type.soft}>No estás inscrito en esta temporada.</Text>
          <Text style={styles.hint}>Los jugadores nuevos entran en Porcelana.</Text>
          <Button label="INSCRIBIRME" onPress={enroll} loading={busy} />
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <Text style={type.soft}>Todavía no hay nadie inscrito en esta temporada.</Text>
        </Card>
      ) : (
        groups.map((g) => {
          const tint = categoryColor(g.code);
          return (
            <View key={g.key} style={styles.block}>
              <View style={styles.groupHead}>
                <View style={[styles.dot, { backgroundColor: tint }]} />
                <Text style={[styles.groupName, { color: tint }]}>
                  {categoryLabel(g.code)}
                  {g.division ? ` · División ${g.division}` : ''}
                </Text>
                <Text style={styles.groupVp}>±{VP_BY_CATEGORY[g.code] ?? 1} VP</Text>
              </View>

              {g.rows.map((r) => (
                <Card
                  key={r.player_id}
                  style={[
                    styles.row,
                    r.player_id === playerId && { borderColor: tint },
                    !r.active && styles.inactive,
                  ]}
                >
                  <Text style={[styles.place, r.place === 1 && { color: tint }]}>{r.place}</Text>
                  <Avatar size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {r.display_name}
                      {!r.active ? ' · inactivo' : ''}
                    </Text>
                    <Text style={styles.meta}>
                      {r.matches_won}G · {r.matches_lost}P · dif {formatVp(r.point_diff)}
                    </Text>
                  </View>
                  <Text style={[styles.vp, { color: r.vp >= 0 ? colors.win : colors.loss }]}>
                    {formatVp(r.vp)}
                  </Text>
                </Card>
              ))}

              {/* El derecho de reto es del 1º de cada categoría. Lo ejerce la
                  organización: hace falta que el round robin haya terminado. */}
              {isOrganizer && g.rows.length > 0 && g.rows[0].active && (
                <Pressable
                  onPress={() => openChallenge(g.rows[0].player_id, g.rows[0].display_name)}
                  disabled={busy}
                  hitSlop={6}
                >
                  <Text style={[styles.challenge, { color: tint }]}>
                    Abrir reto de ascenso para {g.rows[0].display_name} ›
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}

      {isOrganizer && (
        <View style={styles.block}>
          <SectionTitle>Organización</SectionTitle>
          <Button label="REORGANIZAR DIVISIONES" variant="ghost" onPress={rebalance} loading={busy} />
          <Text style={styles.hint}>
            Parte en A/B las categorías que pasaron de cupo, repartiendo en zigzag por posición
            para que queden parejas.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },

  hero: { paddingVertical: space.lg, gap: 3 },
  title: { ...type.display, fontSize: 22 },
  sub: { fontSize: 12.5, color: colors.inkSoft },

  hint: { fontSize: 12, color: colors.inkSoft, lineHeight: 17 },
  block: { gap: space.sm, marginBottom: space.xl },

  mine: { flexDirection: 'row', alignItems: 'center', marginBottom: space.lg },
  mineTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.inkDim },
  mineCat: { fontSize: 17, fontWeight: '800', color: colors.ink, marginTop: 2 },

  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  groupName: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5, flex: 1 },
  groupVp: { fontSize: 10.5, fontWeight: '800', color: colors.inkDim },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  inactive: { opacity: 0.45 },
  place: { fontSize: 13, fontWeight: '800', color: colors.inkDim, width: 20, textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  vp: { fontSize: 16, fontWeight: '800', fontStyle: 'italic' },

  challenge: {
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
});
