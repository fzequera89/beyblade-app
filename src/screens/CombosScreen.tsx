import { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type Combo = {
  id: string;
  name: string;
  parts: { blade?: string; ratchet?: string; bit?: string } | null;
};

const EMPTY_FORM = { name: '', blade: '', ratchet: '', bit: '' };

export default function CombosScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [combos, setCombos] = useState<Combo[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('combos')
      .select('id, name, parts')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setCombos((data as any) ?? []);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function startEdit(combo: Combo) {
    setEditingId(combo.id);
    setForm({
      name: combo.name,
      blade: combo.parts?.blade ?? '',
      ratchet: combo.parts?.ratchet ?? '',
      bit: combo.parts?.bit ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) {
      Alert.alert('Falta el nombre', 'Ponle un nombre al combo para reconocerlo después.');
      return;
    }
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
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    cancelEdit();
    load();
  }

  async function remove(combo: Combo) {
    Alert.alert('Borrar combo', `¿Borrar "${combo.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('combos').delete().eq('id', combo.id);
          if (error) {
            // Un combo ya usado en un match no se puede borrar: la FK lo protege
            // para no perder el historial de con qué se ganó.
            Alert.alert('No se puede borrar', 'Este combo ya se usó en un match registrado.');
            return;
          }
          load();
        },
      },
    ]);
  }

  function describe(combo: Combo) {
    const parts = [combo.parts?.blade, combo.parts?.ratchet, combo.parts?.bit].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Sin piezas anotadas';
  }

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={combos}
        keyExtractor={(c) => c.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>Mis combos</Text>
            <Text style={styles.meta}>
              Registra los combos que usas para saber después cuál te da mejores resultados.
            </Text>

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder="Nombre del combo"
                placeholderTextColor="#8a8a8a"
              />
              <TextInput
                style={styles.input}
                value={form.blade}
                onChangeText={(v) => setForm({ ...form, blade: v })}
                placeholder="Blade"
                placeholderTextColor="#8a8a8a"
              />
              <TextInput
                style={styles.input}
                value={form.ratchet}
                onChangeText={(v) => setForm({ ...form, ratchet: v })}
                placeholder="Ratchet"
                placeholderTextColor="#8a8a8a"
              />
              <TextInput
                style={styles.input}
                value={form.bit}
                onChangeText={(v) => setForm({ ...form, bit: v })}
                placeholder="Bit"
                placeholderTextColor="#8a8a8a"
              />
              <View style={styles.rowGap}>
                <Pressable style={styles.button} onPress={save} disabled={busy}>
                  <Text style={styles.buttonText}>{editingId ? 'Guardar cambios' : 'Agregar combo'}</Text>
                </Pressable>
                {editingId && (
                  <Pressable style={[styles.button, styles.secondaryButton]} onPress={cancelEdit}>
                    <Text style={styles.buttonText}>Cancelar</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.parts}>{describe(item)}</Text>
            </View>
            <Pressable style={styles.smallButton} onPress={() => startEdit(item)}>
              <Text style={styles.smallButtonText}>Editar</Text>
            </Pressable>
            <Pressable style={[styles.smallButton, styles.dangerButton]} onPress={() => remove(item)}>
              <Text style={styles.smallButtonText}>Borrar</Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>Todavía no registras ningún combo.</Text> : null
        }
        ListFooterComponent={
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Volver al perfil</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6, marginBottom: 16 },
  form: { gap: 8 },
  input: { color: '#1a1a20', borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, width: '100%' },
  rowGap: { flexDirection: 'row', gap: 8 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1 },
  secondaryButton: { backgroundColor: '#444' },
  buttonText: { color: '#fff', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 10,
  },
  name: { fontSize: 14, fontWeight: '600' },
  parts: { fontSize: 12, color: '#6b6b64', marginTop: 2 },
  smallButton: { backgroundColor: '#444', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  dangerButton: { backgroundColor: '#b00020' },
  smallButtonText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
