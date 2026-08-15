import { useCallback, useState } from 'react';
import { Text, View, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { pickVenuePhoto, uploadVenuePhoto } from '../lib/venuePhoto';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import Cover from '../ui/Cover';
import { Card, Pill, SectionTitle } from '../ui/primitives';
import { IconPin } from '../ui/icons';
import { colors, space, type, radius } from '../theme';

type Venue = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  qr_code: string | null;
  photo_url: string | null;
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
  const { playerId, isAdmin } = useAuth();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [showQr, setShowQr] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();
    const [{ data, error }, { data: recent }, { count: organizerCount }] = await Promise.all([
      supabase
        .from('venues')
        .select('id, name, address, city, qr_code, photo_url')
        .eq('id', venueId)
        .single(),
      supabase
        .from('check_ins')
        .select('id, checked_in_at, players(id, display_name, elo_rating, avatar_key, avatar_url)')
        .eq('venue_id', venueId)
        .gte('checked_in_at', since)
        .order('checked_in_at', { ascending: false }),
      supabase
        .from('league_members')
        .select('*', { count: 'exact', head: true })
        .eq('player_id', playerId)
        .eq('role', 'organizer'),
    ]);
    setLoading(false);
    if (error) return Alert.alert('Error', error.message);
    setVenue(data as any);
    // Misma regla que para crear locaciones: admin o moderador de alguna liga.
    setCanEdit(isAdmin || (organizerCount ?? 0) > 0);

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
  }, [venueId, playerId, isAdmin]);

  async function changePhoto() {
    const uri = await pickVenuePhoto();
    if (!uri) return;
    setUploading(true);
    const url = await uploadVenuePhoto(venueId, uri);
    if (url) {
      const { error } = await supabase.from('venues').update({ photo_url: url }).eq('id', venueId);
      if (error) Alert.alert('No se pudo guardar', error.message);
    }
    setUploading(false);
    load();
  }

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
      {/* La portada es lo primero: entras al lugar, no a una ficha. */}
      <View>
        <Cover id={venue.id} photoUrl={venue.photo_url} live={live} height={190} />
        <Pressable style={styles.backOverCover} onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={styles.coverText}>
          {live && (
            <Pill label={`${checkIns.length} jugando ahora`} color={colors.win} />
          )}
          <Text style={styles.title}>{venue.name}</Text>
          <View style={styles.placeRow}>
            <IconPin size={13} color={colors.inkSoft} />
            <Text style={styles.address} numberOfLines={2}>
              {[venue.address, venue.city].filter(Boolean).join(', ') || 'Sin dirección'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.pad}>
        {canEdit && (
          <Pressable onPress={changePhoto} disabled={uploading} hitSlop={6} style={styles.photoBtn}>
            <Text style={styles.photoBtnText}>
              {uploading ? 'Subiendo…' : venue.photo_url ? '🖼️ Cambiar foto del lugar' : '🖼️ Poner foto del lugar'}
            </Text>
          </Pressable>
        )}

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
            <SectionTitle>Código de la locación</SectionTitle>
            {showQr ? (
              <Card style={styles.qrCard}>
                {/* El QR va sobre blanco a propósito: un código sobre fondo
                    oscuro no lo lee ninguna cámara. */}
                <View style={styles.qrPaper}>
                  <QRCode value={venue.qr_code} size={196} />
                </View>
                <Text style={styles.note}>
                  Muéstralo en el lugar para que los demás hagan check-in.
                </Text>
                <Pressable onPress={() => setShowQr(false)} hitSlop={6}>
                  <Text style={styles.link}>Ocultar</Text>
                </Pressable>
              </Card>
            ) : (
              <Button label="MOSTRAR QR DE LA LOCACIÓN" variant="ghost" onPress={() => setShowQr(true)} />
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  backOverCover: {
    position: 'absolute',
    top: space.md,
    left: space.xl,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(4,6,12,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pad: { paddingHorizontal: space.xl, gap: space.sm },

  coverText: { paddingHorizontal: space.xl, paddingTop: space.md, gap: 4, marginBottom: space.lg },
  title: { ...type.display, fontSize: 24 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  address: { flex: 1, fontSize: 12.5, color: colors.inkSoft },
  photoBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  photoBtnText: { color: colors.blue, fontSize: 12.5, fontWeight: '700' },

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
