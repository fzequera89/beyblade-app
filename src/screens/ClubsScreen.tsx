import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card, Hex, Pill } from '../ui/primitives';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius } from '../theme';

type Club = {
  id: string;
  name: string;
  city: string | null;
  description: string | null;
  club_members: { count: number }[];
};

export default function ClubsScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [myClubIds, setMyClubIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', description: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: mine }] = await Promise.all([
      supabase.from('clubs').select('id, name, city, description, club_members(count)'),
      supabase.from('club_members').select('club_id').eq('player_id', playerId),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);

    const ids = ((mine as any[]) ?? []).map((m) => m.club_id);
    setMyClubIds(ids);

    // Tus clubes primero, luego por tamaño: el club al que perteneces es el que
    // te importa, y entre los demás pesa más el que tiene comunidad.
    const list = ((data as any as Club[]) ?? []).sort((a, b) => {
      const mineA = ids.includes(a.id) ? 1 : 0;
      const mineB = ids.includes(b.id) ? 1 : 0;
      if (mineA !== mineB) return mineB - mineA;
      return (b.club_members?.[0]?.count ?? 0) - (a.club_members?.[0]?.count ?? 0);
    });
    setClubs(list);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function create() {
    const name = form.name.trim();
    if (!name) return Alert.alert('Falta el nombre', 'Ponle nombre al club.');

    setBusy(true);
    const { error } = await supabase.from('clubs').insert({
      name,
      city: form.city.trim() || null,
      description: form.description.trim() || null,
      owner_player_id: playerId,
    });
    setBusy(false);
    if (error) return Alert.alert('No se pudo fundar', error.message);
    setForm({ name: '', city: '', description: '' });
    setCreating(false);
    load();
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={clubs}
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
              <Text style={styles.title}>Clubes</Text>
            </View>
            <Text style={styles.sub}>El equipo con el que compites. Cualquiera puede fundar uno.</Text>

            {creating ? (
              <Card style={{ gap: space.lg }}>
                <Text style={type.label}>Fundar un club</Text>
                <Field
                  label="Nombre"
                  placeholder="Dragones de Acero"
                  value={form.name}
                  onChangeText={(v) => setForm({ ...form, name: v })}
                />
                <Field
                  label="Ciudad"
                  placeholder="Monterrey"
                  value={form.city}
                  onChangeText={(v) => setForm({ ...form, city: v })}
                />
                <Field
                  label="Descripción"
                  placeholder="Club de ataque puro. Entrenamos los martes."
                  value={form.description}
                  onChangeText={(v) => setForm({ ...form, description: v })}
                  multiline
                  style={styles.textarea}
                />
                <Button label="FUNDAR CLUB" onPress={create} loading={busy} />
                <Button label="Cancelar" variant="ghost" onPress={() => setCreating(false)} />
              </Card>
            ) : (
              <Button label="＋  FUNDAR UN CLUB" variant="ghost" onPress={() => setCreating(true)} />
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const count = item.club_members?.[0]?.count ?? 0;
          const isMine = myClubIds.includes(item.id);
          // Solo se destaca si es TU club: en una lista de clubes ajenos, el
          // primero no es más importante que el resto.
          const hero = index === 0 && isMine;

          if (hero) {
            return (
              <Card
                style={styles.hero}
                onPress={() => navigation.navigate('ClubDetail', { clubId: item.id })}
              >
                <Text style={styles.heroTag}>TU CLUB</Text>
                <View style={styles.heroTop}>
                  <Hex size={62} color={colors.elite}>
                    <Text style={{ fontSize: 24 }}>🛡️</Text>
                  </Hex>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.heroName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.meta}>
                      {item.city ?? 'Sin ciudad'} · {count} miembro{count === 1 ? '' : 's'}
                    </Text>
                  </View>
                </View>
                {item.description ? (
                  <Text style={styles.heroDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <Text style={styles.heroCta}>Ver el roster ›</Text>
              </Card>
            );
          }

          return (
            <Card style={styles.row} onPress={() => navigation.navigate('ClubDetail', { clubId: item.id })}>
              <Hex size={44} color={isMine ? colors.elite : colors.inkDim}>
                <Text style={{ fontSize: 17 }}>🛡️</Text>
              </Hex>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.city ?? 'Sin ciudad'} · {count} miembro{count === 1 ? '' : 's'}
                </Text>
              </View>
              {isMine ? <Pill label="Miembro" color={colors.elite} /> : <IconChevron />}
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>🛡️</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Todavía no hay clubes</Text>
              <Text style={styles.meta}>Funda el primero y arma tu equipo.</Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.md, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  sub: { ...type.soft, fontSize: 12.5 },
  textarea: { minHeight: 70, textAlignVertical: 'top' },

  hero: { gap: space.md, borderColor: colors.elite },
  heroTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.elite },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  heroName: { ...type.display, fontSize: 20 },
  heroDesc: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },
  heroCta: { fontSize: 12, fontWeight: '800', color: colors.elite },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
