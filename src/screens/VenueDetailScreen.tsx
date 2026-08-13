import { useCallback, useState } from 'react';
import { Text, View, Pressable, StyleSheet, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import Screen from '../components/Screen';

type Venue = { id: string; name: string; address: string | null; city: string | null; qr_code: string | null };
type RecentCheckIn = {
  id: string;
  checked_in_at: string;
  players: { display_name: string; elo_rating: number } | null;
};

const WHOS_PLAYING_WINDOW_HOURS = 4;

export default function VenueDetailScreen({ route, navigation }: any) {
  const { venueId } = route.params;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - WHOS_PLAYING_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const [{ data, error }, { data: checkIns }] = await Promise.all([
      supabase.from('venues').select('id, name, address, city, qr_code').eq('id', venueId).single(),
      supabase
        .from('check_ins')
        .select('id, checked_in_at, players(display_name, elo_rating)')
        .eq('venue_id', venueId)
        .gte('checked_in_at', since)
        .order('checked_in_at', { ascending: false }),
    ]);
    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setVenue(data);
    setRecentCheckIns((checkIns as any) ?? []);
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
    <Screen>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{venue.name}</Text>
        <Text style={styles.sub}>{[venue.address, venue.city].filter(Boolean).join(', ') || 'Sin dirección'}</Text>

        <Text style={styles.sectionTitle}>Quién está jugando aquí</Text>
        <Text style={styles.sectionMeta}>Check-ins de las últimas {WHOS_PLAYING_WINDOW_HOURS} horas</Text>
        {recentCheckIns.length === 0 ? (
          <Text style={styles.empty}>Nadie ha hecho check-in recientemente.</Text>
        ) : (
          recentCheckIns.map((c) => (
            <View key={c.id} style={styles.playerRow}>
              <Text style={styles.playerName}>{c.players?.display_name ?? '—'}</Text>
              <Text style={styles.playerElo}>{c.players?.elo_rating ?? 1000}</Text>
            </View>
          ))
        )}

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
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { color: '#6b6b64', marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 24 },
  sectionMeta: { fontSize: 11, color: '#6b6b64', marginTop: 2, marginBottom: 8 },
  empty: { color: '#6b6b64', fontSize: 13 },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 8,
  },
  playerName: { fontSize: 14, fontWeight: '600' },
  playerElo: { fontWeight: '700', color: '#2f5ad6' },
  qrBox: { alignItems: 'center', marginTop: 24, gap: 12 },
  qrLabel: { fontSize: 12, color: '#6b6b64', textAlign: 'center' },
  qrWrapper: { padding: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 12 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 24 },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 24 },
  backText: { color: '#6b6b64' },
});
