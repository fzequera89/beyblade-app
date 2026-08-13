import { useCallback, useState } from 'react';
import { Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

type Venue = { id: string; name: string; address: string | null; city: string | null };

export default function VenueDetailScreen({ route, navigation }: any) {
  const { venueId } = route.params;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, address, city')
      .eq('id', venueId)
      .single();
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setVenue(data);
  }, [venueId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !venue) {
    return (
      <Screen style={styles.container}>
        <Text>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <Text style={styles.title}>{venue.name}</Text>
      <Text style={styles.sub}>{[venue.address, venue.city].filter(Boolean).join(', ') || 'Sin dirección'}</Text>

      <Pressable style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>‹ Volver a venues</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { color: '#6b6b64', marginTop: 4 },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
