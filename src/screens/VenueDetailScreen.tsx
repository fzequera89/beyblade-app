import { useCallback, useState } from 'react';
import { Text, View, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

type Venue = { id: string; name: string; address: string | null; city: string | null; qr_code: string | null };

export default function VenueDetailScreen({ route, navigation }: any) {
  const { venueId } = route.params;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('venues')
      .select('id, name, address, city, qr_code')
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

      {venue.qr_code && (
        <View style={styles.qrBox}>
          <Text style={styles.qrLabel}>QR de check-in — muéstralo en el venue</Text>
          <View style={styles.qrWrapper}>
            <QRCode value={venue.qr_code} size={200} />
          </View>
        </View>
      )}

      <Pressable style={styles.button} onPress={() => navigation.navigate('ScanCheckIn')}>
        <Text style={styles.buttonText}>Escanear QR para hacer check-in</Text>
      </Pressable>

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
  qrBox: { alignItems: 'center', marginTop: 24, gap: 12 },
  qrLabel: { fontSize: 12, color: '#6b6b64', textAlign: 'center' },
  qrWrapper: { padding: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 12 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
