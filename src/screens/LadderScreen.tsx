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
import { createSeasonTournament as createSeasonTournamentInDb } from '../lib/formatsRepo';

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
  const [otherSeasons, setOtherSeasons] = useState<{ id: string; name: string }[]>([]);
  const [closing, setClosing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data, error }, { data: membership }, { data: admin }, { data: seasonRows }] =
      await Promise.all([
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
        // Las OTRAS temporadas de la liga: son los destinos posibles al cerrar
        // esta. `close_season` exige que la siguiente ya exista y sea de la
        // misma liga (se crean desde el detalle de la liga).
        leagueId
          ? supabase
              .from('seasons')
              .select('id, name')
              .eq('league_id', leagueId)
              .neq('id', seasonId)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [] }),
      ]);

    if (error) {
      setLoading(false);
      return Alert.alert('Error', error.message);
    }

    setRows(((data as any) ?? []) as Row[]);
    setIsOrganizer((membership as any)?.role === 'organizer' || (admin as any)?.is_admin === true);
    setOtherSeasons(((seasonRows as any) ?? []) as { id: string; name: string }[]);
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

  // El torneo de ranking del reglamento: fase 1 round robin DENTRO de cada
  // categoría. Nace atado a la temporada y con la temporada entera inscrita —
  // un torneo de ranking no es un evento suelto al que la gente se apunta, es
  // la temporada jugándose.
  async function createSeasonTournament(kind: 'category_rr' | 'single_elim') {
    const label = kind === 'category_rr' ? 'Torneo de ranking' : 'Torneo inicial (G3)';
    setBusy(true);
    try {
      const { tournamentId, enrolled } = await createSeasonTournamentInDb({
        leagueId,
        seasonId,
        name: `${label} · ${seasonName ?? 'temporada'}`,
        kind,
        pointsToWin: 4,
      });
      Alert.alert(
        `${label} creado`,
        `Quedaron ${enrolled} jugador(es) inscritos. Da check-in a quienes lleguen y genera la primera ronda desde la pestaña BRACKET.`
      );
      navigation.navigate('TournamentDetail', { tournamentId, leagueId, isOrganizer: true });
    } catch (e: any) {
      Alert.alert('No se pudo crear', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // La asistencia no es un detalle administrativo: sin ella no existe la
  // eliminación por inasistencia ni el reingreso a Porcelana que pide el
  // reglamento. La función está desde 0031 y no la llamaba ninguna pantalla.
  function toggleAttendance(row: Row) {
    const off = row.active;
    Alert.alert(
      off ? 'Marcar inasistencia' : 'Reactivar jugador',
      off
        ? `${row.display_name} deja de contar para esta temporada: no entra al torneo de ranking y al cerrar reingresa al último puesto de Porcelana.`
        : `${row.display_name} vuelve a contar en esta temporada, en el puesto donde estaba.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: off ? 'Marcar inasistencia' : 'Reactivar',
          style: off ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase.rpc('set_season_attendance', {
              p_season_id: seasonId,
              p_player_id: row.player_id,
              p_active: !off,
            });
            setBusy(false);
            if (error) return Alert.alert('No se pudo', error.message);
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

  function closeSeason(nextId: string, nextName: string) {
    Alert.alert(
      'Cerrar temporada',
      `Se cierra "${seasonName ?? 'esta temporada'}" y se siembra "${nextName}": cada quien conserva su categoría; se reinician posiciones, VP y marcadores. Quien llegó 1º suma un título (5 = Challenger). Los inactivos reingresan al final de Porcelana. ¿Seguro?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Cerrar y sembrar',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const { error } = await supabase.rpc('close_season', {
              p_season_id: seasonId,
              p_next_season_id: nextId,
            });
            setBusy(false);
            if (error) return Alert.alert('No se pudo cerrar', error.message);
            setClosing(false);
            navigation.replace('Ladder', { seasonId: nextId, leagueId, seasonName: nextName });
          },
        },
      ]
    );
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
          Tabla oficial de la liga: se ordena por VICTORIAS, con la diferencia de puntos como
          desempate. Los VP son de otro ranking —el interclubes, que cruza ligas— y no mueven esta
          tabla. Y nada de esto es el ELO: el ELO mide tu habilidad y no se resetea; esto se
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
              {mine.matches_won}G – {mine.matches_lost}P · diferencia {formatVp(mine.point_diff)}
            </Text>
            <Text style={styles.metaDim}>
              {formatVp(mine.vp)} VP interclubes · aportas {VP_BY_CATEGORY[mine.category_code] ?? 1} por combate
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
                  onPress={isOrganizer ? () => toggleAttendance(r) : undefined}
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
                      dif {formatVp(r.point_diff)} · {formatVp(r.vp)} VP interclubes
                    </Text>
                  </View>
                  {/* La tabla se ordena por victorias, así que el récord es lo
                      que manda a la vista; el VP quedó en la meta. */}
                  <View style={styles.recordBox}>
                    <Text style={styles.record}>
                      {r.matches_won}<Text style={styles.recordDash}>–</Text>{r.matches_lost}
                    </Text>
                    <Text style={styles.recordLabel}>G – P</Text>
                  </View>
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
          <SectionTitle>Jugar esta temporada</SectionTitle>
          <Text style={styles.hint}>
            El torneo de ranking del reglamento: cada quien enfrenta a los de SU categoría. Se crea
            con la temporada entera inscrita y atado a ella, así que sus combates sí mueven el
            escalafón y el VP.
          </Text>
          <Button
            label="＋  TORNEO DE RANKING (POR CATEGORÍA)"
            onPress={() => createSeasonTournament('category_rr')}
            loading={busy}
          />
          <Text style={styles.hint}>
            El torneo INICIAL es distinto: eliminación directa (G3) que sirve para fijar la posición
            de arranque. Al terminarlo, desde el torneo se siembran las posiciones de la temporada.
          </Text>
          <Button
            label="＋  TORNEO INICIAL (G3)"
            variant="ghost"
            onPress={() => createSeasonTournament('single_elim')}
            loading={busy}
          />

          <SectionTitle>Organización</SectionTitle>
          <Text style={styles.hint}>
            Toca a un jugador de la tabla para marcar su inasistencia o reactivarlo.
          </Text>
          <Button label="REORGANIZAR DIVISIONES" variant="ghost" onPress={rebalance} loading={busy} />
          <Text style={styles.hint}>
            Parte en A/B las categorías que pasaron de cupo, repartiendo en zigzag por posición
            para que queden parejas.
          </Text>

          {/* Cerrar la temporada es manual (como el reglamento: "al finalizar se
              realiza un reinicio", un acto de la administración). Necesita una
              temporada destino ya creada, para no reiniciar sobre la misma. */}
          {closing ? (
            <Card style={{ gap: space.md, marginTop: space.md }}>
              <Text style={styles.closeTitle}>¿A qué temporada se siembra?</Text>
              {otherSeasons.length === 0 ? (
                <Text style={styles.hint}>
                  Primero crea la temporada siguiente desde el detalle de la liga. Al cerrar, esta
                  se siembra en esa: cada quien conserva su categoría.
                </Text>
              ) : (
                otherSeasons.map((s) => (
                  <Pressable
                    key={s.id}
                    style={styles.destRow}
                    onPress={() => closeSeason(s.id, s.name)}
                    disabled={busy}
                  >
                    <Text style={styles.destName}>{s.name}</Text>
                    <Text style={styles.destGo}>Sembrar aquí ›</Text>
                  </Pressable>
                ))
              )}
              <Button label="Cancelar" variant="ghost" onPress={() => setClosing(false)} />
            </Card>
          ) : (
            <Button
              label="CERRAR TEMPORADA"
              variant="ghost"
              onPress={() => setClosing(true)}
              loading={busy}
            />
          )}
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
  metaDim: { fontSize: 10.5, color: colors.inkDim, marginTop: 1 },
  recordBox: { alignItems: 'center', minWidth: 42 },
  record: { fontSize: 16, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  recordDash: { color: colors.inkDim, fontWeight: '600' },
  recordLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6, color: colors.inkDim },

  challenge: {
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },

  closeTitle: { fontSize: 13, fontWeight: '800', color: colors.ink },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  destName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  destGo: { fontSize: 12, fontWeight: '800', color: colors.streak },
});
