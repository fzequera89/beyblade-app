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

type Assignment = {
  id: string;
  player_id: string;
  role: 'support' | 'principal';
  players: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
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
  const [canManage, setCanManage] = useState(false);
  const [picking, setPicking] = useState(false);
  const [role, setRole] = useState<'support' | 'principal'>('support');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    let q = supabase
      .from('judge_assignments')
      .select(
        'id, player_id, role, players(display_name, avatar_key, avatar_url)'
      );
    q = tournamentId ? q.eq('tournament_id', tournamentId) : q.eq('league_id', leagueId);
    const { data: assigned } = await q.order('created_at');
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

    if (scopeLeague) {
      const { data: members } = await supabase
        .from('league_members')
        .select('player_id, players(display_name, avatar_key, avatar_url)')
        .eq('league_id', scopeLeague);
      const taken = new Set(list.map((r) => r.player_id));
      setCandidates((((members as any) ?? []) as Candidate[]).filter((m) => !taken.has(m.player_id)));
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
    if (error) return Alert.alert('No se pudo nombrar', error.message);
    setPicking(false);
    load();
  }

  async function remove(assignmentId: string, name?: string) {
    Alert.alert('Quitar juez', `${name ?? 'Esta persona'} dejará de poder fallar aquí.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.rpc('unassign_judge', { p_assignment_id: assignmentId });
          if (error) return Alert.alert('Error', error.message);
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
