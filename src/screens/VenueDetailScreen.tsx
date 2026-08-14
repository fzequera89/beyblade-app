import { useCallback, useState } from 'react';
import { Text, View, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import { IconPin } from '../ui/icons';
import { colors, space, type, radius, glow } from '../theme';

type Venue = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  qr_code: string | null;
};

type CheckIn = {
  id: string;
  checked_in_at: string;
  players: {
    id: string;
    display_name: string;
    elo_rating: number;
    avatar_key: string | null;
    avatar_url: string | null;
  } | null;
};

const WINDOW_HOURS = 4;

export default function VenueDetailScreen({ route, navigation }: any) {
  const { venueId } = route.params;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const [{ data, error }, { data: recent }] = await Promise.all([
      supabase.from('venues').select('id, name, address, city, qr_code').eq('id', venueId).single(),
      supabase
        .from('check_ins')
        .select('id, checked_in_at, players(id, display_name, elo_rating, avatar_key, avatar_url)')
        .eq('venue_id', venueId)
        .gte('checked_in_at', since)
        .order('checked_in_at', { ascending: false }),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    setVenue(data as any);

    // Un jugador que escaneó dos veces no son dos personas: se queda el más
    // reciente de cada uno.
    const seen = new Set<string>();
    const unique: CheckIn[] = [];
    for (const c of ((recent as any as CheckIn[]) ?? [])) {
      const pid = c.players?.id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      unique.push(c);
    }
    setCheckIns(unique);
  }, [venueId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading || !venue) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  function ago(iso: string) {
    const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    return `hace ${Math.floor(min / 60)} h`;
  }

  const live = checkIns.length > 0;

  return (
    <Screen scroll padded={false}>
      <View style={styles.headRow}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.pad}>
        <View style={styles.hero}>
          <Hex size={72} color={live ? colors.win : colors.blue}>
            <IconPin size={26} color={live ? colors.win : colors.blue} />
          </Hex>
          <Text style={styles.title}>{venue.name}</Text>
          <Text style={styles.address}>
            {[venue.address, venue.city].filter(Boolean).join(', ') || 'Sin dirección'}
          </Text>
          {live && <Pill label={`${checkIns.length} jugando ahora`} color={colors.win} align="center" />}
        </View>

        <Button label="📷  HACER CHECK-IN AQUÍ" onPress={() => navigation.navigate('ScanCheckIn')} />

        <View style={styles.block}>
          <SectionTitle>Quién está jugando aquí</SectionTitle>
          <Text style={styles.note}>Check-ins de las últimas {WINDOW_HOURS} horas.</Text>

          {checkIns.length === 0 ? (
            <Card>
              <Text style={type.soft}>
                Nadie ha hecho check-in recientemente. Si estás aquí, escanea el QR y avísale a los demás.
              </Text>
            </Card>
          ) : (
            checkIns.map((c) => (
              <Card
                key={c.id}
                style={styles.row}
                onPress={() =>
                  c.players && navigation.navigate('PlayerProfile', { playerId: c.players.id })
                }
              >
                <Avatar
                  uri={c.players?.avatar_url}
                  avatarKey={c.players?.avatar_key}
                  size={44}
                  ring={colors.win}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.players?.display_name ?? '—'}</Text>
                  <Text style={styles.meta}>{ago(c.checked_in_at)}</Text>
                </View>
                <Text style={styles.elo}>{Math.round(c.players?.elo_rating ?? 1000)}</Text>
              </Card>
            ))
          )}
        </View>

        {venue.qr_code && (
          <View style={styles.block}>
            <SectionTitle>Código del venue</SectionTitle>
            {showQr ? (
              <Card style={styles.qrCard}>
                {/* El QR va sobre blanco a propósito: un código sobre fondo
                    oscuro no lo lee ninguna cámara. */}
                <View style={styles.qrPaper}>
                  <QRCode value={venue.qr_code} size={196} />
                </View>
                <Text style={styles.note}>
                  Muéstralo en el venue para que los demás hagan check-in.
                </Text>
                <Pressable onPress={() => setShowQr(false)} hitSlop={6}>
                  <Text style={styles.link}>Ocultar</Text>
                </Pressable>
              </Card>
            ) : (
              <Button label="MOSTRAR QR DEL VENUE" variant="ghost" onPress={() => setShowQr(true)} />
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headRow: { paddingHorizontal: space.xl, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  pad: { paddingHorizontal: space.xl },

  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  title: { ...type.display, fontSize: 24, textAlign: 'center' },
  address: { fontSize: 12.5, color: colors.inkSoft, textAlign: 'center' },

  block: { marginTop: space.xxl, gap: space.sm },
  note: { fontSize: 11.5, color: colors.inkDim },
  link: { color: colors.blue, fontSize: 12.5, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  elo: { fontSize: 15, fontWeight: '800', color: colors.blue },

  qrCard: { alignItems: 'center', gap: space.md },
  qrPaper: { backgroundColor: '#FFFFFF', padding: space.lg, borderRadius: radius.md },
});
