import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type Venue = { id: string; name: string; address: string | null; city: string | null };

export default function VenuesScreen({ navigation }: any) {
  const { playerId, isAdmin } = useAuth();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { count: organizerCount }] = await Promise.all([
      supabase.from('venues').select('id, name, address, city').order('name', { ascending: true }),
      supabase
        .from('league_members')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('role', 'organizer'),
    ]);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setVenues(data ?? []);
    setCanCreate(isAdmin || (organizerCount ?? 0) > 0);
  }, [playerId, isAdmin]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Venues</Text>
        {canCreate && (
          <Pressable style={styles.createButton} onPress={() => navigation.navigate('CreateVenue')}>
            <Text style={styles.createButtonText}>+ Agregar</Text>
          </Pressable>
        )}
      </View>
      <Pressable style={styles.scanButton} onPress={() => navigation.navigate('ScanCheckIn')}>
        <Text style={styles.scanButtonText}>📷 Escanear QR de check-in</Text>
      </Pressable>
      <FlatList
        style={{ flex: 1 }}
        data={venues}
        keyExtractor={(v) => v.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('VenueDetail', { venueId: item.id })}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardSub}>{[item.address, item.city].filter(Boolean).join(', ') || 'Sin dirección'}</Text>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>Todavía no hay venues registrados.</Text> : null}
        ListFooterComponent={
          <Pressable style={styles.back} onPress={() => navigation.navigate('Profile')}>
            <Text style={styles.backText}>‹ Volver a mi perfil</Text>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  createButton: { backgroundColor: '#2f5ad6', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  createButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  scanButton: { backgroundColor: '#444', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 12 },
  scanButtonText: { color: '#fff', fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#eee', borderRadius: 10, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { color: '#6b6b64', fontSize: 13, marginTop: 2 },
  empty: { textAlign: 'center', color: '#6b6b64', marginTop: 40 },
  back: { marginTop: 16 },
  backText: { color: '#2f5ad6' },
});
