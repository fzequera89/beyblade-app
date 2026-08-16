import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import { IconChevron } from '../ui/icons';
import { colors, space, type } from '../theme';

type Person = {
  id: string;
  display_name: string;
  elo_rating: number;
  avatar_key: string | null;
  avatar_url: string | null;
} | null;

type Challenge = {
  id: string;
  status: string;
  match_id: string | null;
  challenger: Person;
  challenged: Person;
  match: { id: string; status: string } | null;
};

// Los dos embeds de `players` sí necesitan nombre de FK porque hay dos caminos
// (challenger y challenged). El de `matches` no: hay una sola relación, así que
// PostgREST la infiere sola y no hay que adivinar cómo nombró Postgres la llave.
const P = 'id, display_name, elo_rating, avatar_key, avatar_url';
const SELECT =
  `id, status, match_id, challenger:players!challenges_challenger_id_fkey(${P}), challenged:players!challenges_challenged_id_fkey(${P}), match:matches(id, status)`;

export default function ChallengesScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [received, setReceived] = useState<Challenge[]>([]);
  const [sent, setSent] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // Se traen TODOS los estados, no solo 'pending': un reto aceptado es la única
    // puerta de entrada a su match, porque un match de reto no tiene torneo ni
    // aparece en el historial del perfil hasta que se confirma.
    const [{ data: recv }, { data: snt }] = await Promise.all([
      supabase
        .from('challenges')
        .select(SELECT)
        .eq('challenged_id', playerId)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('challenges')
        .select(SELECT)
        .eq('challenger_id', playerId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    setLoading(false);
    setReceived((recv as any) ?? []);
    setSent((snt as any) ?? []);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function accept(challengeId: string) {
    setBusy(true);
    const { data, error } = await supabase.rpc('accept_challenge', { p_challenge_id: challengeId });
    setBusy(false);
    if (error) {
      alerta('Error', error.message);
      return;
    }
    alerta('Reto aceptado', 'Ya pueden jugar. Cuando terminen, reporten el resultado.', [
      { text: 'Ver match', onPress: () => navigation.navigate('MatchDetail', { matchId: data }) },
      { text: 'OK' },
    ]);
    load();
  }

  async function decline(challengeId: string) {
    setBusy(true);
    const { error } = await supabase.from('challenges').update({ status: 'declined' }).eq('id', challengeId);
    setBusy(false);
    if (error) {
      alerta('Error', error.message);
      return;
    }
    load();
  }

  async function cancelSent(challengeId: string) {
    setBusy(true);
    const { error } = await supabase.from('challenges').update({ status: 'cancelled' }).eq('id', challengeId);
    setBusy(false);
    if (error) {
      alerta('Error', error.message);
      return;
    }
    load();
  }

  const pendingReceived = received.filter((c) => c.status === 'pending');

  // Matches que ya se pueden jugar, vengan del lado que vengan. Un match de reto
  // solo es alcanzable desde aquí, así que se listan hasta que quedan confirmados.
  const toPlay = [...received, ...sent].filter(
    (c) => c.status === 'accepted' && c.match && c.match.status !== 'confirmed'
  );

  const sentPending = sent.filter((c) => c.status !== 'accepted');

  function opponentOf(c: Challenge): Person {
    return c.challenger?.id === playerId ? c.challenged : c.challenger;
  }

  function matchLabel(status: string | undefined) {
    if (status === 'reported') return 'Falta confirmar el resultado';
    if (status === 'disputed') return 'Resultado en disputa';
    return 'Sin jugar todavía';
  }

  function statusLabel(status: string) {
    if (status === 'pending') return 'Esperando respuesta';
    if (status === 'declined') return 'Rechazado';
    if (status === 'cancelled') return 'Cancelado';
    return status;
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={pendingReceived}
        keyExtractor={(c) => c.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Retos</Text>
            </View>

            {toPlay.length > 0 && (
              <View style={{ gap: space.sm }}>
                <SectionTitle>Batallas por jugar</SectionTitle>
                {toPlay.map((c, i) => {
                  const o = opponentOf(c);
                  const urgent = c.match?.status === 'reported' || c.match?.status === 'disputed';
                  // La primera se destaca: es la batalla que tienes que resolver ya.
                  if (i === 0) {
                    return (
                      <Card
                        key={c.id}
                        style={[styles.hero, urgent && { borderColor: colors.streak }]}
                        onPress={() => navigation.navigate('MatchDetail', { matchId: c.match_id })}
                      >
                        <Text style={[styles.heroTag, urgent && { color: colors.streak }]}>
                          {urgent ? matchLabel(c.match?.status).toUpperCase() : 'TE ESPERA UNA BATALLA'}
                        </Text>
                        <View style={styles.heroRow}>
                          <Avatar uri={o?.avatar_url} avatarKey={o?.avatar_key} size={58} ring={colors.blue} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.heroName} numberOfLines={1}>
                              {o?.display_name ?? '—'}
                            </Text>
                            <Text style={styles.meta}>{Math.round(o?.elo_rating ?? 1000)} ELO</Text>
                          </View>
                          <Text style={styles.heroCta}>Abrir ›</Text>
                        </View>
                      </Card>
                    );
                  }
                  return (
                    <Card
                      key={c.id}
                      style={styles.row}
                      onPress={() => navigation.navigate('MatchDetail', { matchId: c.match_id })}
                    >
                      <Avatar uri={o?.avatar_url} avatarKey={o?.avatar_key} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          vs {o?.display_name ?? '—'}
                        </Text>
                        <Text style={styles.meta}>{matchLabel(c.match?.status)}</Text>
                      </View>
                      <IconChevron />
                    </Card>
                  );
                })}
              </View>
            )}

            <SectionTitle>Retos recibidos</SectionTitle>
          </View>
        }
        renderItem={({ item }) => {
          const c = item.challenger;
          return (
            <Card style={styles.challenge}>
              <View style={styles.row}>
                <Avatar uri={c?.avatar_url} avatarKey={c?.avatar_key} size={44} ring={colors.streak} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {c?.display_name ?? '—'}
                  </Text>
                  <Text style={styles.meta}>{Math.round(c?.elo_rating ?? 1000)} ELO · te retó</Text>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.accept} onPress={() => accept(item.id)} disabled={busy}>
                  <Text style={styles.acceptText}>ACEPTAR</Text>
                </Pressable>
                <Pressable style={styles.decline} onPress={() => decline(item.id)} disabled={busy}>
                  <Text style={styles.declineText}>Rechazar</Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={50} color={colors.inkDim}>
                <Text style={{ fontSize: 19 }}>⚔️</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Nadie te ha retado</Text>
              <Text style={styles.meta}>Busca bladers cerca y manda tú el primer reto.</Text>
            </Card>
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: space.sm, marginTop: space.xl }}>
            <SectionTitle>Retos enviados</SectionTitle>
            {sentPending.length === 0 ? (
              <Card>
                <Text style={type.soft}>No tienes retos esperando respuesta.</Text>
              </Card>
            ) : (
              sentPending.map((c) => (
                <Card key={c.id} style={styles.row}>
                  <Avatar
                    uri={c.challenged?.avatar_url}
                    avatarKey={c.challenged?.avatar_key}
                    size={38}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {c.challenged?.display_name ?? '—'}
                    </Text>
                    <Text style={styles.meta}>{statusLabel(c.status)}</Text>
                  </View>
                  {c.status === 'pending' ? (
                    <Pressable style={styles.cancel} onPress={() => cancelSent(c.id)} disabled={busy}>
                      <Text style={styles.cancelText}>Cancelar</Text>
                    </Pressable>
                  ) : (
                    <Pill label={statusLabel(c.status)} color={colors.inkDim} />
                  )}
                </Card>
              ))
            )}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.md, paddingTop: space.md },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },

  hero: { gap: space.md, borderColor: colors.blue },
  heroTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: colors.blue },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroName: { ...type.display, fontSize: 19 },
  heroCta: { fontSize: 12, fontWeight: '800', color: colors.blue },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  challenge: { gap: space.md },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },

  actions: { flexDirection: 'row', gap: space.sm },
  accept: {
    flex: 1,
    backgroundColor: colors.win,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptText: { color: '#04160B', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  decline: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  declineText: { color: colors.inkSoft, fontSize: 12, fontWeight: '700' },
  cancel: { borderWidth: 1, borderColor: colors.line, borderRadius: 6, paddingVertical: 5, paddingHorizontal: 9 },
  cancelText: { color: colors.inkSoft, fontSize: 10.5, fontWeight: '700' },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
