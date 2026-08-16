import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card, Hex, SectionTitle } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';

type Combo = {
  id: string;
  name: string;
  parts: { blade?: string; ratchet?: string; bit?: string } | null;
};

const EMPTY_FORM = { name: '', blade: '', ratchet: '', bit: '' };

export default function CombosScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [combos, setCombos] = useState<Combo[]>([]);
  const [usage, setUsage] = useState<Record<string, { played: number; won: number }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: matches }] = await Promise.all([
      supabase
        .from('combos')
        .select('id, name, parts')
        .eq('player_id', playerId)
        .order('created_at', { ascending: false }),
      supabase
        .from('matches')
        .select('player_a_id, combo_a_id, combo_b_id, winner_id')
        .eq('status', 'confirmed')
        .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);

    setCombos((data as any) ?? []);

    // El rendimiento se calcula aquí para poder mostrarlo junto a cada combo:
    // un combo sin su récord es solo una lista de piezas.
    const u: Record<string, { played: number; won: number }> = {};
    for (const m of ((matches as any[]) ?? [])) {
      const mine = m.player_a_id === playerId ? m.combo_a_id : m.combo_b_id;
      if (!mine) continue;
      u[mine] = u[mine] ?? { played: 0, won: 0 };
      u[mine].played += 1;
      if (m.winner_id === playerId) u[mine].won += 1;
    }
    setUsage(u);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function startEdit(combo: Combo) {
    setEditingId(combo.id);
    setOpen(true);
    setForm({
      name: combo.name,
      blade: combo.parts?.blade ?? '',
      ratchet: combo.parts?.ratchet ?? '',
      bit: combo.parts?.bit ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setOpen(false);
    setForm(EMPTY_FORM);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) return Alert.alert('Falta el nombre', 'Ponle un nombre para reconocerlo después.');

    const parts = {
      blade: form.blade.trim() || null,
      ratchet: form.ratchet.trim() || null,
      bit: form.bit.trim() || null,
    };
    setBusy(true);
    const { error } = editingId
      ? await supabase.from('combos').update({ name, parts }).eq('id', editingId)
      : await supabase.from('combos').insert({ player_id: playerId, name, parts });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    cancelEdit();
    load();
  }

  function remove(combo: Combo) {
    Alert.alert('Borrar deck', `¿Borrar "${combo.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('combos').delete().eq('id', combo.id);
          if (error) {
            // La FK protege el historial: un combo usado en una batalla no se borra.
            Alert.alert('No se puede borrar', 'Este deck ya se usó en una batalla registrada.');
            return;
          }
          load();
        },
      },
    ]);
  }

  function parts(combo: Combo) {
    return [combo.parts?.blade, combo.parts?.ratchet, combo.parts?.bit].filter(Boolean);
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={combos}
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
              <Text style={styles.title}>Mis decks</Text>
            </View>
            <Text style={styles.sub}>
              Registra lo que usas para saber después cuál te da mejores resultados.
            </Text>

            {open ? (
              <Card style={{ gap: space.lg }}>
                <Text style={type.label}>{editingId ? 'Editar deck' : 'Nuevo deck'}</Text>
                <Field
                  label="Nombre"
                  placeholder="Deck Tormenta"
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                />
                <Field
                  label="Blade"
                  placeholder="Dran Sword"
                  value={form.blade}
                  onChangeText={(v) => setForm({ ...form, blade: v })}
                />
                <Field
                  label="Ratchet"
                  placeholder="3-60"
                  value={form.ratchet}
                  onChangeText={(v) => setForm({ ...form, ratchet: v })}
                />
                <Field
                  label="Bit"
                  placeholder="Rush"
                  value={form.bit}
                  onChangeText={(v) => setForm({ ...form, bit: v })}
                />
                <Button label={editingId ? 'GUARDAR CAMBIOS' : 'AGREGAR COMBO'} onPress={save} loading={busy} />
                <Button label="Cancelar" variant="ghost" onPress={cancelEdit} />
              </Card>
            ) : (
              <Button label="＋  NUEVO DECK" onPress={() => setOpen(true)} />
            )}

            {combos.length > 0 && <SectionTitle>{`Tus combos (${combos.length})`}</SectionTitle>}
          </View>
        }
        renderItem={({ item }) => {
          const u = usage[item.id];
          const rate = u && u.played > 0 ? Math.round((u.won / u.played) * 100) : null;
          const p = parts(item);

          return (
            <Card style={styles.combo}>
              <View style={styles.comboTop}>
                <Hex size={46} color={colors.blue}>
                  <Text style={{ fontSize: 17 }}>🌀</Text>
                </Hex>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {p.length > 0 ? (
                    <View style={styles.partsRow}>
                      {p.map((x, i) => (
                        <View key={i} style={styles.part}>
                          <Text style={styles.partText}>{x}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.meta}>Sin piezas anotadas</Text>
                  )}
                </View>
                {rate !== null && (
                  <View style={styles.rateBox}>
                    <Text style={[styles.rate, { color: rate >= 50 ? colors.win : colors.loss }]}>
                      {rate}%
                    </Text>
                    <Text style={styles.rateLabel}>
                      {u.won}–{u.played - u.won}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.actions}>
                <Pressable style={styles.action} onPress={() => startEdit(item)}>
                  <Text style={styles.actionText}>Editar</Text>
                </Pressable>
                <Pressable style={[styles.action, styles.danger]} onPress={() => remove(item)}>
                  <Text style={[styles.actionText, { color: colors.loss }]}>Borrar</Text>
                </Pressable>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>🌀</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Todavía no registras decks</Text>
              <Text style={styles.meta}>
                Al reportar una batalla podrás elegir con cuál jugaste, y con eso sabrás cuál rinde más.
              </Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.lg, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  sub: { ...type.soft, fontSize: 12.5, marginTop: -12 },

  combo: { gap: space.md },
  comboTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 15, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, lineHeight: 16 },
  partsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  part: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  partText: { fontSize: 10.5, color: colors.inkSoft, fontWeight: '600' },
  rateBox: { alignItems: 'flex-end' },
  rate: { fontSize: 18, fontWeight: '800' },
  rateLabel: { fontSize: 10, color: colors.inkDim },

  actions: {
    flexDirection: 'row',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.md,
  },
  action: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 8,
    alignItems: 'center',
  },
  danger: { borderColor: colors.loss + '55' },
  actionText: { fontSize: 12, fontWeight: '700', color: colors.inkSoft },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink, textAlign: 'center' },
});
