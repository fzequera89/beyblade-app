import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Avatar from '../ui/Avatar';
import { Card, Pill, SectionTitle, Hex } from '../ui/primitives';
import { IconChevron, IconFlame } from '../ui/icons';
import { badgeIcon } from '../lib/badges';
import { colors, space, type, radius } from '../theme';

type Player = {
  id: string;
  display_name: string;
  city: string | null;
  country: string | null;
  main_beyblade: string | null;
  play_style: string | null;
  elo_rating: number;
  matches_played: number;
  avatar_key: string | null;
  avatar_url: string | null;
  experience_level: string | null;
};

const EXPERIENCE_LABEL: Record<string, string> = {
  rookie: 'Rookie Blader',
  blader: 'Blader',
  pro: 'Pro Blader',
  elite: 'Elite Blader',
};

// El perfil ya no es un menú de secciones: eso ahora lo resuelven las pestañas.
// Aquí solo vive lo que ES el jugador — su identidad, sus números y su vitrina —
// más los accesos a las vistas personales que no merecen pestaña propia.
const LINKS = [
  { key: 'Stats', label: 'Mis estadísticas', desc: 'Win rate, rachas y finishes', glyph: '📊' },
  { key: 'Combos', label: 'Mis combos', desc: 'Tus beyblades y su rendimiento', glyph: '🌀' },
  { key: 'Rivalries', label: 'Rivalidades', desc: 'Tu récord contra cada rival', glyph: '⚔️' },
  { key: 'Passport', label: 'League Passport', desc: 'Toda tu trayectoria', glyph: '🛂' },
  { key: 'Leagues', label: 'Mis ligas', desc: 'Ligas y tu posición', glyph: '🏅' },
  { key: 'Clubs', label: 'Clubes', desc: 'Tu equipo', glyph: '🛡️' },
];

export default function ProfileScreen({ navigation }: any) {
  const { session, playerId, isAdmin } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [badges, setBadges] = useState<{ code: string; name: string }[]>([]);
  const [wins, setWins] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rank, setRank] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data: me } = await supabase
      .from('players')
      .select(
        'id, display_name, city, country, main_beyblade, play_style, elo_rating, matches_played, avatar_key, avatar_url, experience_level'
      )
      .eq('id', playerId)
      .single();
    if (!me) return;
    setPlayer(me as any);

    const [{ count: winCount }, { count: above }, { data: earned }, { data: recent }] = await Promise.all([
      supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'confirmed').eq('winner_id', playerId),
      supabase.from('players').select('*', { count: 'exact', head: true }).gt('elo_rating', (me as any).elo_rating),
      supabase.from('player_badges').select('badges(code, name)').eq('player_id', playerId),
      supabase
        .from('matches')
        .select('winner_id, confirmed_at')
        .or(`player_a_id.eq.${playerId},player_b_id.eq.${playerId}`)
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .limit(30),
    ]);

    setWins(winCount ?? 0);
    setRank((above ?? 0) + 1);
    setBadges(((earned as any[]) ?? []).map((r) => r.badges).filter(Boolean));

    let s = 0;
    for (const m of ((recent as any[]) ?? [])) {
      if (m.winner_id === playerId) s += 1;
      else break;
    }
    setStreak(s);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!player) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const losses = player.matches_played - wins;
  const winRate = player.matches_played > 0 ? Math.round((wins / player.matches_played) * 100) : 0;

  return (
    <Screen scroll padded={false}>
      {/* Identidad */}
      <View style={styles.hero}>
        <Hex size={112} color={colors.blue}>
          <Avatar uri={player.avatar_url} avatarKey={player.avatar_key} size={78} />
        </Hex>

        <Text style={styles.name}>{player.display_name}</Text>
        <Pill label={EXPERIENCE_LABEL[player.experience_level ?? ''] ?? 'Blader'} />
        <Text style={styles.city}>
          {[player.city, player.country].filter(Boolean).join(', ') || 'Sin ubicación'}
        </Text>

        <Pressable style={styles.edit} onPress={() => navigation.navigate('EditProfile')}>
          <Text style={styles.editText}>EDITAR PERFIL</Text>
        </Pressable>
      </View>

      <View style={styles.pad}>
        {/* Números */}
        <Card style={styles.stats}>
          <Stat label="ELO" value={Math.round(player.elo_rating).toLocaleString()} tint={colors.blue} />
          <View style={styles.div} />
          <Stat label="Récord" value={`${wins}–${losses}`} sub={`${winRate}%`} />
          <View style={styles.div} />
          <Stat
            label="Racha"
            value={String(streak)}
            tint={streak > 0 ? colors.streak : undefined}
            icon={streak > 0 ? <IconFlame size={14} /> : undefined}
          />
          <View style={styles.div} />
          <Stat label="Rank" value={rank ? `#${rank}` : '—'} sub="Global" />
        </Card>

        {/* Equipo */}
        {(player.main_beyblade || player.play_style) && (
          <Card style={styles.gear}>
            {player.main_beyblade ? (
              <GearRow label="Beyblade principal" value={player.main_beyblade} />
            ) : null}
            {player.play_style ? <GearRow label="Estilo" value={player.play_style} /> : null}
          </Card>
        )}

        {/* Vitrina */}
        <View style={styles.block}>
          <SectionTitle
            right={
              <Pressable onPress={() => navigation.navigate('Badges')} hitSlop={6}>
                <Text style={styles.link}>Ver todos</Text>
              </Pressable>
            }
          >
            Logros
          </SectionTitle>
          {badges.length === 0 ? (
            <Card>
              <Text style={type.soft}>
                Sin logros todavía. Se desbloquean solos conforme compitas.
              </Text>
            </Card>
          ) : (
            <Card style={styles.badgeStrip}>
              {badges.slice(0, 10).map((b) => (
                <View key={b.code} style={styles.badge}>
                  <Text style={styles.badgeGlyph}>{badgeIcon(b.code)}</Text>
                </View>
              ))}
              {badges.length > 10 && <Text style={styles.more}>+{badges.length - 10}</Text>}
            </Card>
          )}
        </View>

        {/* Accesos */}
        <View style={styles.block}>
          {LINKS.map((l) => (
            <Card key={l.key} style={styles.row} onPress={() => navigation.navigate(l.key)}>
              <Text style={styles.rowGlyph}>{l.glyph}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{l.label}</Text>
                <Text style={styles.rowDesc}>{l.desc}</Text>
              </View>
              <IconChevron />
            </Card>
          ))}

          {isAdmin && (
            <Card style={[styles.row, styles.adminRow]} onPress={() => navigation.navigate('Admin')}>
              <Text style={styles.rowGlyph}>🛠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.elite }]}>Panel de administrador</Text>
                <Text style={styles.rowDesc}>Jugadores, ligas y ranking global</Text>
              </View>
              <IconChevron color={colors.elite} />
            </Card>
          )}
        </View>

        <Text style={styles.account}>{session?.user.email}</Text>
        <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function Stat({
  label,
  value,
  sub,
  tint,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <View style={styles.statRow}>
        {icon}
        <Text style={[styles.statVal, tint ? { color: tint } : null]}>{value}</Text>
      </View>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function GearRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.gearRow}>
      <Text style={styles.gearLabel}>{label}</Text>
      <Text style={styles.gearValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pad: { paddingHorizontal: space.xl },

  hero: { alignItems: 'center', gap: space.sm, paddingTop: space.xl, paddingBottom: space.lg },
  name: { ...type.display, fontSize: 26, marginTop: space.sm },
  city: { fontSize: 13, color: colors.inkSoft },
  edit: {
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.blue,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: 8,
  },
  editText: { color: colors.blue, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },

  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  div: { width: 1, height: 32, backgroundColor: colors.line },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7, color: colors.inkDim },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.ink },
  statSub: { fontSize: 9.5, color: colors.inkDim },

  gear: { marginTop: space.md, gap: space.sm },
  gearRow: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  gearLabel: { fontSize: 12, color: colors.inkSoft },
  gearValue: { fontSize: 13, color: colors.ink, fontWeight: '600', flexShrink: 1 },

  block: { marginTop: space.xxl, gap: space.sm },
  link: { color: colors.blue, fontSize: 12, fontWeight: '700' },

  badgeStrip: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeGlyph: { fontSize: 19 },
  more: { fontSize: 12, color: colors.inkSoft, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  adminRow: { borderColor: colors.elite + '66' },
  rowGlyph: { fontSize: 19, width: 26, textAlign: 'center' },
  rowLabel: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  rowDesc: { fontSize: 11.5, color: colors.inkSoft, marginTop: 1 },

  account: { fontSize: 11, color: colors.inkDim, textAlign: 'center', marginTop: space.xxl },
  signOut: { alignSelf: 'center', marginTop: space.md, padding: space.sm },
  signOutText: { color: colors.loss, fontSize: 13, fontWeight: '700' },
});
