import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Field } from '../ui/Field';
import { Card, Hex, Pill } from '../ui/primitives';
import { colors, space, type } from '../theme';

type PlayerRow = {
  id: string;
  display_name: string;
  city: string | null;
  elo_rating: number;
  auth_user_id: string | null;
  is_admin: boolean;
  avatar_key: string | null;
  avatar_url: string | null;
  judge_role: 'none' | 'support' | 'principal';
};

// Rotación al tocar el sello: nadie → apoyo → principal → nadie.
const NEXT_JUDGE: Record<string, 'none' | 'support' | 'principal'> = {
  none: 'support',
  support: 'principal',
  principal: 'none',
};

const JUDGE_LABEL: Record<string, string> = {
  support: 'Juez de apoyo',
  principal: 'Juez principal',
};

export default function AdminPlayersScreen({ navigation }: any) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [mainBeyblade, setMainBeyblade] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('players')
      .select('id, display_name, city, elo_rating, auth_user_id, is_admin, avatar_key, avatar_url, judge_role')
      .order('display_name', { ascending: true });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setPlayers(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function registerPlayer() {
    if (!name.trim()) {
      Alert.alert('Falta el nombre');
      return;
    }
    const { error } = await supabase.from('players').insert({
      display_name: name.trim(),
      city: city.trim() || null,
      main_beyblade: mainBeyblade.trim() || null,
      auth_user_id: null,
    });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setName('');
    setCity('');
    setMainBeyblade('');
    setShowNew(false);
    load();
  }

  async function cycleJudge(p: PlayerRow) {
    const next = NEXT_JUDGE[p.judge_role ?? 'none'];
    // Por RPC y no por update directo: la política de `players` solo deja
    // editar tu propia fila, así que un update aquí no afectaría nada.
    const { error } = await supabase.rpc('set_judge_role', { p_player_id: p.id, p_role: next });
    if (error) return Alert.alert('No se pudo cambiar', error.message);
    load();
  }

  // Con la liga llena, la lista completa deja de ser navegable: el buscador es
  // la forma real de llegar a un jugador concreto.
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return players;
    return players.filter(
      (p) => p.display_name.toLowerCase().includes(q) || (p.city ?? '').toLowerCase().includes(q)
    );
  }, [players, query]);

  const withAccount = players.filter((p) => p.auth_user_id).length;

  return (
    <Screen padded={false}>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Jugadores</Text>
            </View>

            <Card style={styles.stats}>
              <Stat label="Registrados" value={String(players.length)} />
              <View style={styles.vDiv} />
              <Stat label="Con cuenta" value={String(withAccount)} tint={colors.blue} />
              <View style={styles.vDiv} />
              <Stat label="Sin cuenta" value={String(players.length - withAccount)} />
            </Card>

            <Field
              placeholder="Buscar por nombre o ciudad"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
            />

            {showNew ? (
              <Card style={{ gap: space.md }}>
                <Field label="Nombre de jugador" placeholder="Nombre visible" value={name} onChangeText={setName} />
                <Field label="Ciudad (opcional)" placeholder="Ciudad" value={city} onChangeText={setCity} />
                <Field
                  label="Main Beyblade (opcional)"
                  placeholder="Ej. Dran Sword"
                  value={mainBeyblade}
                  onChangeText={setMainBeyblade}
                />
                <Button label="REGISTRAR JUGADOR" onPress={registerPlayer} />
                <Button label="Cancelar" variant="ghost" onPress={() => setShowNew(false)} />
              </Card>
            ) : (
              <Button label="＋  REGISTRAR JUGADOR" variant="ghost" onPress={() => setShowNew(true)} />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Card
            style={styles.row}
            onPress={() => navigation.navigate('PlayerProfile', { playerId: item.id })}
          >
            <Avatar
              uri={item.avatar_url}
              avatarKey={item.avatar_key}
              size={40}
              ring={item.is_admin ? colors.elite : undefined}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.display_name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {item.city ?? 'Sin ciudad'} · {item.auth_user_id ? 'con cuenta' : 'sin cuenta'}
              </Text>
              {item.judge_role && item.judge_role !== 'none' ? (
                <Text style={styles.judge}>{JUDGE_LABEL[item.judge_role]}</Text>
              ) : null}
            </View>
            {item.is_admin && <Pill label="Admin" color={colors.elite} />}
            <Pressable style={styles.gavel} onPress={() => cycleJudge(item)} hitSlop={6}>
              <Text style={[styles.gavelGlyph, item.judge_role === 'none' && { opacity: 0.25 }]}>⚖️</Text>
            </Pressable>
            <Text style={styles.elo}>{Math.round(item.elo_rating)}</Text>
          </Card>
        )}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={50} color={colors.inkDim}>
                <Text style={{ fontSize: 19 }}>🧑‍🚀</Text>
              </Hex>
              <Text style={styles.emptyTitle}>
                {query ? 'Ningún jugador coincide' : 'Sin jugadores todavía'}
              </Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.statVal, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },

  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  statVal: { fontSize: 18, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 28, backgroundColor: colors.line },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  elo: { fontSize: 14, fontWeight: '800', color: colors.blue },
  judge: { fontSize: 10, fontWeight: '700', color: colors.elite, marginTop: 2 },
  gavel: { padding: 4 },
  gavelGlyph: { fontSize: 16 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
