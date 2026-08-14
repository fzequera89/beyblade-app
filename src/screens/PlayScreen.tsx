import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Pill, Chip, Hex, SectionTitle } from '../ui/primitives';
import { IconPin, IconSearch, IconFlame, IconChevron } from '../ui/icons';
import { colors, space, type, radius, glow } from '../theme';

// Encontrar con quién batallar. Es la acción central de la app y por eso vive
// en el botón elevado de la barra.
//
// Antes solo se filtraba por ciudad. El reglamento y las pantallas propuestas
// piden filtrar por LOCACIÓN dentro de la ciudad — dónde estás parado ahora —
// que es lo que de verdad resuelve "con quién juego en este momento".
// Sin GPS: la locación se elige de los venues registrados.

const DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hora', minutes: 60 },
  { label: 'Todo el día', minutes: null as number | null },
];

const RANGES = [
  { key: 'all', label: 'Cualquiera', delta: null as number | null },
  { key: 'close', label: '±100 ELO', delta: 100 },
  { key: 'near', label: '±250 ELO', delta: 250 },
];

type Venue = { id: string; name: string; city: string | null };

type Available = {
  id: string;
  expires_at: string;
  venue_id: string | null;
  players: {
    id: string;
    display_name: string;
    elo_rating: number;
    city: string | null;
    avatar_key: string | null;
    avatar_url: string | null;
    experience_level: string | null;
  } | null;
};

export default function PlayScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [myCity, setMyCity] = useState<string | null>(null);
  const [myElo, setMyElo] = useState(1000);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [rows, setRows] = useState<Available[]>([]);
  const [mine, setMine] = useState<{ expires_at: string; venue_id: string | null } | null>(null);

  const [venueFilter, setVenueFilter] = useState<string | null>(null);
  const [range, setRange] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const nowIso = new Date().toISOString();

    const { data: me } = await supabase
      .from('players')
      .select('city, elo_rating')
      .eq('id', playerId)
      .maybeSingle();
    const city = (me as any)?.city ?? null;
    setMyCity(city);
    setMyElo((me as any)?.elo_rating ?? 1000);

    const [{ data: venueRows }, { data: myPresence }, { data: others }] = await Promise.all([
      city
        ? supabase.from('venues').select('id, name, city').eq('city', city).order('name')
        : supabase.from('venues').select('id, name, city').order('name'),
      supabase
        .from('presence')
        .select('expires_at, venue_id')
        .eq('player_id', playerId)
        .gt('expires_at', nowIso)
        .order('expires_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('presence')
        .select(
          'id, expires_at, venue_id, players(id, display_name, elo_rating, city, avatar_key, avatar_url, experience_level)'
        )
        .gt('expires_at', nowIso)
        .neq('player_id', playerId)
        .order('expires_at', { ascending: true }),
    ]);

    setVenues((venueRows as any) ?? []);
    setMine((myPresence as any) ?? null);
    setRows((others as any) ?? []);
    setLoading(false);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function activate(minutes: number | null) {
    setBusy(true);
    const now = new Date();
    const expires = minutes
      ? new Date(now.getTime() + minutes * 60 * 1000)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    await supabase.from('presence').delete().eq('player_id', playerId).gt('expires_at', now.toISOString());
    const { error } = await supabase.from('presence').insert({
      player_id: playerId,
      status: 'looking_to_play',
      // Se guarda la locación elegida: así los demás saben DÓNDE estás, no solo
      // que estás disponible.
      venue_id: venueFilter,
      expires_at: expires.toISOString(),
    });
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    load();
  }

  async function cancel() {
    setBusy(true);
    await supabase.from('presence').delete().eq('player_id', playerId).gt('expires_at', new Date().toISOString());
    setBusy(false);
    load();
  }

  async function challenge(targetId: string, name: string) {
    const { error } = await supabase
      .from('challenges')
      .insert({ challenger_id: playerId, challenged_id: targetId });
    if (error) return Alert.alert('Error', error.message);
    Alert.alert('Reto enviado', `${name} tiene que aceptarlo para crear la batalla.`);
  }

  const delta = RANGES.find((r) => r.key === range)?.delta ?? null;

  const filtered = rows.filter((r) => {
    const p = r.players;
    if (!p) return false;
    if (myCity && p.city !== myCity) return false;
    if (venueFilter && r.venue_id !== venueFilter) return false;
    if (delta !== null && Math.abs(p.elo_rating - myElo) > delta) return false;
    return true;
  });

  const activeUntil = mine ? new Date(mine.expires_at) : null;
  const venueName = (id: string | null) => venues.find((v) => v.id === id)?.name ?? null;

  return (
    <Screen padded={false}>
      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Encuentra rival</Text>
            <Text style={styles.sub}>
              {myCity ? `Bladers disponibles en ${myCity}` : 'Define tu ciudad en tu perfil para ver bladers cerca'}
            </Text>

            {/* Tu disponibilidad */}
            {activeUntil ? (
              <Card style={styles.activeCard}>
                <View style={styles.activeRow}>
                  <View style={[styles.pulse, glow(colors.win, 8)]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeTitle}>Estás buscando jugar</Text>
                    <Text style={styles.activeMeta}>
                      Hasta las{' '}
                      {activeUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {venueName(mine?.venue_id ?? null) ? ` · ${venueName(mine!.venue_id)}` : ''}
                    </Text>
                  </View>
                  <Pressable style={styles.stop} onPress={cancel} disabled={busy}>
                    <Text style={styles.stopText}>Parar</Text>
                  </Pressable>
                </View>
              </Card>
            ) : (
              <Card style={{ gap: space.md }}>
                <Text style={styles.blockLabel}>AVISA QUE ESTÁS DISPONIBLE</Text>
                <Text style={styles.help}>
                  {venueFilter
                    ? `Los demás verán que estás en ${venueName(venueFilter)}.`
                    : 'Elige abajo una locación para que sepan dónde encontrarte.'}
                </Text>
                <View style={styles.row}>
                  {DURATIONS.map((d) => (
                    <Pressable
                      key={d.label}
                      style={styles.duration}
                      onPress={() => activate(d.minutes)}
                      disabled={busy}
                    >
                      <Text style={styles.durationText}>{d.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            )}

            {/* Filtros */}
            <View style={styles.filters}>
              <View style={styles.filterHead}>
                <IconPin size={15} color={colors.inkSoft} />
                <Text style={styles.blockLabel}>LOCACIÓN</Text>
              </View>
              <View style={styles.row}>
                <Chip label="Cualquier lugar" selected={venueFilter === null} onPress={() => setVenueFilter(null)} />
                {venues.map((v) => (
                  <Chip
                    key={v.id}
                    label={v.name}
                    selected={venueFilter === v.id}
                    onPress={() => setVenueFilter(v.id)}
                  />
                ))}
              </View>
              {venues.length === 0 && (
                <Text style={styles.help}>
                  No hay venues registrados en tu ciudad todavía.
                </Text>
              )}

              <View style={styles.filterHead}>
                <IconSearch size={15} color={colors.inkSoft} />
                <Text style={styles.blockLabel}>NIVEL DEL RIVAL</Text>
              </View>
              <View style={styles.row}>
                {RANGES.map((r) => (
                  <Chip key={r.key} label={r.label} selected={range === r.key} onPress={() => setRange(r.key)} />
                ))}
              </View>
            </View>

            <View style={styles.shortcuts}>
              <Shortcut label="Venues" glyph="📍" onPress={() => navigation.navigate('Venues')} />
              <Shortcut label="Eventos" glyph="📅" onPress={() => navigation.navigate('Events')} />
              <Shortcut label="Clubes" glyph="🛡️" onPress={() => navigation.navigate('Clubs')} />
            </View>

            <SectionTitle>
              {filtered.length > 0 ? `Disponibles ahora (${filtered.length})` : 'Disponibles ahora'}
            </SectionTitle>
          </View>
        }
        renderItem={({ item, index }) => {
          const p = item.players!;
          const diff = Math.round(p.elo_rating - myElo);
          const where = venueName(item.venue_id);

          // La primera lleva tratamiento de héroe: es el rival más inmediato.
          if (index === 0) {
            return (
              <Card style={styles.hero}>
                <View style={styles.heroTop}>
                  <Avatar uri={p.avatar_url} avatarKey={p.avatar_key} size={72} ring={colors.win} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.heroName} numberOfLines={1}>
                      {p.display_name}
                    </Text>
                    <View style={styles.heroMetaRow}>
                      <Text style={styles.heroElo}>{Math.round(p.elo_rating).toLocaleString()}</Text>
                      <Text style={styles.diff}>
                        {diff === 0 ? 'mismo nivel' : diff > 0 ? `+${diff} sobre ti` : `${diff} bajo ti`}
                      </Text>
                    </View>
                    {where ? <Text style={styles.where}>📍 {where}</Text> : null}
                  </View>
                </View>
                <Pressable
                  style={[styles.challengeBig, glow(colors.blue, 10)]}
                  onPress={() => challenge(p.id, p.display_name)}
                >
                  <Text style={styles.challengeBigText}>RETAR A {p.display_name.toUpperCase()}</Text>
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate('PlayerProfile', { playerId: p.id })}
                  hitSlop={6}
                >
                  <Text style={styles.seeProfile}>Ver su perfil ›</Text>
                </Pressable>
              </Card>
            );
          }

          return (
            <Card style={styles.row2}>
              <Pressable
                style={styles.rowLeft}
                onPress={() => navigation.navigate('PlayerProfile', { playerId: p.id })}
              >
                <Avatar uri={p.avatar_url} avatarKey={p.avatar_key} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.display_name}
                  </Text>
                  <Text style={styles.meta}>
                    {Math.round(p.elo_rating)} ELO{where ? ` · ${where}` : ''}
                  </Text>
                </View>
              </Pressable>
              <Pressable style={styles.challenge} onPress={() => challenge(p.id, p.display_name)}>
                <Text style={styles.challengeText}>RETAR</Text>
              </Pressable>
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={54} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>🌀</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Nadie disponible ahora</Text>
              <Text style={styles.help}>
                {venueFilter
                  ? 'Prueba con "Cualquier lugar" o amplía el nivel del rival.'
                  : 'Avisa que estás disponible arriba: los demás te van a ver.'}
              </Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

function Shortcut({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) {
  return (
    <Pressable style={styles.shortcut} onPress={onPress}>
      <Text style={styles.shortcutGlyph}>{glyph}</Text>
      <Text style={styles.shortcutText}>{label}</Text>
      <IconChevron size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.lg, paddingTop: space.xl, marginBottom: space.sm },
  title: { ...type.display, fontSize: 28 },
  sub: { ...type.soft, marginTop: -12, fontSize: 12.5 },
  blockLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.9, color: colors.inkDim },
  help: { fontSize: 12, color: colors.inkSoft, lineHeight: 16 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },

  activeCard: { borderColor: colors.win },
  activeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.win },
  activeTitle: { fontSize: 14, fontWeight: '700', color: colors.win },
  activeMeta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  stop: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  stopText: { fontSize: 11.5, color: colors.inkSoft, fontWeight: '700' },

  duration: {
    flex: 1,
    backgroundColor: colors.blue,
    borderRadius: radius.sm,
    paddingVertical: 11,
    alignItems: 'center',
  },
  durationText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  filters: { gap: space.sm },
  filterHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.sm },

  shortcuts: { flexDirection: 'row', gap: space.sm },
  shortcut: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: space.sm,
  },
  shortcutGlyph: { fontSize: 14 },
  shortcutText: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.ink },

  hero: { gap: space.md, borderColor: colors.win },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  heroName: { ...type.display, fontSize: 20 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  heroElo: { fontSize: 20, fontWeight: '800', color: colors.blue },
  diff: { fontSize: 11.5, color: colors.inkSoft },
  where: { fontSize: 11.5, color: colors.inkSoft },
  challengeBig: {
    backgroundColor: colors.blue,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  challengeBigText: { color: '#fff', fontSize: 12.5, fontWeight: '800', letterSpacing: 0.6 },
  seeProfile: { color: colors.inkSoft, fontSize: 12, textAlign: 'center' },

  row2: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  challenge: {
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  challengeText: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
