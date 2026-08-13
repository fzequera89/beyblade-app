import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';
import { badgeIcon } from '../lib/badges';

type Badge = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  earned_at: string | null;
};

export default function BadgesScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [badges, setBadges] = useState<Badge[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: catalog, error }, { data: mine }] = await Promise.all([
      supabase.from('badges').select('id, code, name, description'),
      supabase.from('player_badges').select('badge_id, earned_at').eq('player_id', playerId),
    ]);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }

    const earnedAt = new Map<string, string>();
    for (const row of ((mine as any[]) ?? [])) {
      earnedAt.set(row.badge_id, row.earned_at);
    }

    // Los obtenidos primero, para que el jugador vea lo suyo sin scrollear.
    const merged = ((catalog as any[]) ?? [])
      .map((b) => ({ ...b, earned_at: earnedAt.get(b.id) ?? null }))
      .sort((a, b) => {
        if (!!a.earned_at === !!b.earned_at) return a.name.localeCompare(b.name);
        return a.earned_at ? -1 : 1;
      });
    setBadges(merged);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const earned = badges.filter((b) => b.earned_at).length;

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={badges}
        keyExtractor={(b) => b.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 6, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>Mis logros</Text>
            <Text style={styles.meta}>
              {earned} de {badges.length} desbloqueados. Se otorgan solos al confirmar un match.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, !item.earned_at && styles.rowLocked]}>
            <Text style={[styles.icon, !item.earned_at && styles.iconLocked]}>{badgeIcon(item.code)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, !item.earned_at && styles.textLocked]}>{item.name}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
            {item.earned_at ? (
              <Text style={styles.date}>{new Date(item.earned_at).toLocaleDateString()}</Text>
            ) : (
              <Text style={styles.locked}>Bloqueado</Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              El catálogo de logros está vacío. Falta correr la migración 0015 en Supabase.
            </Text>
          ) : null
        }
        ListFooterComponent={
          <Pressable style={styles.back} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>‹ Volver</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 12,
  },
  rowLocked: { opacity: 0.55 },
  icon: { fontSize: 26 },
  iconLocked: { opacity: 0.4 },
  name: { fontSize: 14, fontWeight: '700' },
  textLocked: { color: '#6b6b64' },
  description: { fontSize: 12, color: '#6b6b64', marginTop: 2 },
  date: { fontSize: 10, color: '#1f7a4d', fontWeight: '600' },
  locked: { fontSize: 10, color: '#8a8a8a' },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#6b6b64' },
});
