import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Pill, SectionTitle } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';

type Assignment = {
  id: string;
  player_id: string;
  role: 'support' | 'principal';
  players: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
};

type GlobalJudge = {
  id: string;
  display_name: string;
  judge_role: string | null;
  avatar_key: string | null;
  avatar_url: string | null;
};

type Candidate = {
  player_id: string;
  players: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
};

// Sirve para una liga o para un torneo — el ámbito llega por params. Un cuerpo
// arbitral se convoca para el evento, así que la pantalla es la misma y lo
// único que cambia es a qué se está nombrando.
export default function JudgesScreen({ route, navigation }: any) {
  const { leagueId, tournamentId, title } = route.params ?? {};
  const { playerId } = useAuth();

  const [rows, setRows] = useState<Assignment[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [leagueRows, setLeagueRows] = useState<Assignment[]>([]);
  const [globalJudges, setGlobalJudges] = useState<GlobalJudge[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [picking, setPicking] = useState(false);
  const [role, setRole] = useState<'support' | 'principal'>('support');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // `judge_assignments` apunta DOS veces a `players`: el juez (`player_id`) y
    // quien lo nombró (`assigned_by`). Sin decir cuál, PostgREST se niega con
    // PGRST201 y devuelve error en vez de datos — y esta pantalla lo ignoraba,
    // así que los nombramientos se guardaban y la lista salía vacía. Parecía
    // que el botón no servía.
    let q = supabase
      .from('judge_assignments')
      .select(
        'id, player_id, role, players!judge_assignments_player_id_fkey(display_name, avatar_key, avatar_url)'
      );
    q = tournamentId ? q.eq('tournament_id', tournamentId) : q.eq('league_id', leagueId);
    const { data: assigned, error: errAssigned } = await q.order('created_at');
    if (errAssigned) {
      // Callar el error fue justo lo que costó una sesión de QA.
      alerta('No se pudo leer el cuerpo de jueces', errAssigned.message);
    }
    const list = ((assigned as any) ?? []) as Assignment[];
    setRows(list);

    // Quién puede nombrar lo decide el servidor, con la misma función que
    // después acepta o rechaza el nombramiento.
    const { data: allowed } = await supabase.rpc('can_manage_judges', {
      p_caller: playerId,
      p_league_id: leagueId ?? null,
      p_tournament_id: tournamentId ?? null,
    });
    setCanManage(allowed === true);

    // Los candidatos salen de los miembros de la liga: la del torneo si el
    // ámbito es un torneo.
    let scopeLeague = leagueId ?? null;
    if (!scopeLeague && tournamentId) {
      const { data: t } = await supabase
        .from('tournaments')
        .select('league_id')
        .eq('id', tournamentId)
        .maybeSingle();
      scopeLeague = (t as any)?.league_id ?? null;
    }

    // Quien ya arbitra aquí SIN estar nombrado en este ámbito: los jueces
    // globales de la app, y —si esto es un torneo— los nombrados a su liga.
    // Estaban invisibles, y por eso parecía que un torneo no tenía jueces
    // cuando en realidad varios podían fallar en él.
    const { data: globales } = await supabase
      .from('players')
      .select('id, display_name, judge_role, avatar_key, avatar_url')
      // OJO: judge_role NUNCA es nulo — su valor por defecto es 'none'. Filtrar
      // por "no nulo" devolvía a TODOS los jugadores marcados como jueces
      // globales. Se piden los dos roles reales por nombre.
      .in('judge_role', ['support', 'principal']);
    setGlobalJudges(((globales as any) ?? []) as GlobalJudge[]);

    if (tournamentId && scopeLeague) {
      const { data: deLiga } = await supabase
        .from('judge_assignments')
        .select(
          'id, player_id, role, players!judge_assignments_player_id_fkey(display_name, avatar_key, avatar_url)'
        )
        .eq('league_id', scopeLeague);
      setLeagueRows(((deLiga as any) ?? []) as Assignment[]);
    } else {
      setLeagueRows([]);
    }

    if (scopeLeague) {
      // Los candidatos son los miembros de la liga MÁS los inscritos al torneo:
      // desde 0047 inscribirse mete a la liga, pero los torneos viejos pueden
      // tener inscritos que no son miembros, y esconderlos aquí es lo que
      // impedía nombrarlos juez.
      const [{ data: members }, { data: inscritos }] = await Promise.all([
        supabase
          .from('league_members')
          .select('player_id, players(display_name, avatar_key, avatar_url)')
          .eq('league_id', scopeLeague),
        tournamentId
          ? supabase
              .from('tournament_registrations')
              .select('player_id, players(display_name, avatar_key, avatar_url)')
              .eq('tournament_id', tournamentId)
          : Promise.resolve({ data: [] as any }),
      ]);

      const taken = new Set(list.map((r) => r.player_id));
      const porId = new Map<string, Candidate>();
      for (const c of [...(((members as any) ?? []) as Candidate[]), ...(((inscritos as any) ?? []) as Candidate[])]) {
        if (c?.player_id && !taken.has(c.player_id)) porId.set(c.player_id, c);
      }
      setCandidates([...porId.values()]);
    } else {
      setCandidates([]);
    }

    setLoading(false);
  }, [leagueId, tournamentId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function add(targetId: string) {
    setBusy(true);
    const { error } = await supabase.rpc('assign_judge', {
      p_player_id: targetId,
      p_league_id: leagueId ?? null,
      p_tournament_id: tournamentId ?? null,
      p_role: role,
    });
    setBusy(false);
    if (error) return alerta('No se pudo nombrar', error.message);
    setPicking(false);
    load();
  }

  async function remove(assignmentId: string, name?: string) {
    alerta('Quitar juez', `${name ?? 'Esta persona'} dejará de poder fallar aquí.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('unassign_judge', { p_assignment_id: assignmentId });
          if (error) return alerta('Error', error.message);
          load();
        },
      },
    ]);
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

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>Cuerpo de jueces</Text>
        <Text style={styles.sub}>{title ?? (tournamentId ? 'Este torneo' : 'Esta liga')}</Text>
      </View>

      <Card style={{ marginBottom: space.xl }}>
        <Text style={styles.hint}>
          Ningún resultado queda firme sin que un juez lo apruebe. Quien esté aquí puede aprobar y
          fallar los combates de este ámbito — menos los suyos propios.
        </Text>
      </Card>

      <View style={styles.block}>
        <SectionTitle>Nombrados</SectionTitle>
        {rows.length === 0 ? (
          <Card>
            <Text style={type.soft}>
              Nadie todavía. Sin jueces, los resultados se quedan esperando aprobación.
            </Text>
          </Card>
        ) : (
          rows.map((r) => (
            <Card key={r.id} style={styles.row}>
              <Avatar
                uri={r.players?.avatar_url}
                avatarKey={r.players?.avatar_key}
                size={38}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{r.players?.display_name ?? '—'}</Text>
                <Text style={styles.meta}>
                  {r.role === 'principal' ? 'Juez principal' : 'Juez de apoyo'}
                </Text>
              </View>
              <Pill
                label={r.role === 'principal' ? 'PRINCIPAL' : 'APOYO'}
                color={r.role === 'principal' ? colors.elite : colors.blue}
              />
              {canManage && (
                <Pressable onPress={() => remove(r.id, r.players?.display_name)} hitSlop={8}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              )}
            </Card>
          ))
        )}
      </View>

      {/* Quien ya puede fallar aquí sin estar nombrado en este ámbito. Se
          enseña porque su ausencia hacía creer que el torneo estaba sin jueces
          — y no lo estaba. No se quitan desde aquí: se quitan donde se
          nombraron. */}
      {(leagueRows.length > 0 || globalJudges.length > 0) && (
        <View style={styles.block}>
          <SectionTitle>También pueden fallar aquí</SectionTitle>

          {globalJudges.map((g) => (
            <Card key={`g-${g.id}`} style={[styles.row, { opacity: 0.85 }]}>
              <Avatar uri={g.avatar_url} avatarKey={g.avatar_key} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{g.display_name}</Text>
                <Text style={styles.meta}>
                  {g.judge_role === 'principal' ? 'Juez principal' : 'Juez de apoyo'} de la plataforma · arbitra en toda la app
                </Text>
              </View>
              <Pill label="GLOBAL" color={colors.streak} />
            </Card>
          ))}

          {leagueRows
            .filter((r) => !globalJudges.some((g) => g.id === r.player_id))
            .map((r) => (
              <Card key={`l-${r.id}`} style={[styles.row, { opacity: 0.85 }]}>
                <Avatar uri={r.players?.avatar_url} avatarKey={r.players?.avatar_key} size={38} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.players?.display_name ?? '—'}</Text>
                  <Text style={styles.meta}>Nombrado para la liga · vale en todos sus torneos</Text>
                </View>
                <Pill label="DE LIGA" color={colors.inkSoft} />
              </Card>
            ))}
        </View>
      )}

      {canManage && (
        <View style={styles.block}>
          {!picking ? (
            <Button label="＋  NOMBRAR JUEZ" variant="ghost" onPress={() => setPicking(true)} />
          ) : (
            <>
              <SectionTitle>¿Con qué rol?</SectionTitle>
              <View style={styles.roleRow}>
                {(['support', 'principal'] as const).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    style={[styles.choice, { flex: 1 }, role === r && styles.choiceOn]}
                  >
                    <Text style={[styles.choiceText, role === r && styles.choiceTextOn]}>
                      {r === 'principal' ? 'Principal' : 'De apoyo'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <SectionTitle>¿A quién?</SectionTitle>
              {candidates.length === 0 ? (
                <Card>
                  <Text style={type.soft}>
                    No quedan miembros por nombrar. Un juez tiene que ser miembro de la liga.
                  </Text>
                </Card>
              ) : (
                candidates.map((c) => (
                  <Card
                    key={c.player_id}
                    style={styles.row}
                    onPress={busy ? undefined : () => add(c.player_id)}
                  >
                    <Avatar
                      uri={c.players?.avatar_url}
                      avatarKey={c.players?.avatar_key}
                      size={34}
                    />
                    <Text style={[styles.name, { flex: 1 }]}>{c.players?.display_name ?? '—'}</Text>
                    <Text style={styles.pick}>Nombrar ›</Text>
                  </Card>
                ))
              )}

              <Button label="Cancelar" variant="ghost" onPress={() => setPicking(false)} />
            </>
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

  block: { gap: space.sm, marginBottom: space.xl },
  hint: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 17 },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  remove: { fontSize: 15, color: colors.loss, fontWeight: '800', paddingHorizontal: 4 },
  pick: { fontSize: 12, fontWeight: '700', color: colors.blue },

  roleRow: { flexDirection: 'row', gap: space.sm },
  choice: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: 'center',
  },
  choiceOn: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  choiceText: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  choiceTextOn: { color: colors.ink },
});
