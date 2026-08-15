import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Hex } from './primitives';
import Cover, { coverAccent } from './Cover';
import { leagueEmblem, emblemFont } from '../lib/emblem';
import { IconChevron } from './icons';
import { colors, space, type, radius } from '../theme';

// Tarjeta rica de liga: escudo hexagonal sobre su portada atenuada, rol
// (ADMIN/MODERADOR), y los tres datos que importan de un vistazo —cuánta gente,
// cuántos torneos y en qué lugar vas. Es la MISMA tarjeta en el lobby de Ligas y
// en el hub de Batallas: un solo lugar donde se define cómo se ve una liga.

export type LeagueCardData = {
  id: string;
  name: string;
  description: string | null;
  photo_url: string | null;
  role: 'member' | 'organizer' | null;
  /** Eres el dueño de la liga (owner_player_id): muestra ADMIN en vez de MODERADOR. */
  isOwner?: boolean;
  myRank: number | null;
  memberCount: number;
  tournamentCount: number;
};

export default function LeagueCard({
  league,
  onPress,
  onJoin,
}: {
  league: LeagueCardData;
  onPress: () => void;
  onJoin?: () => void;
}) {
  const mine = !!league.role;
  const accent = coverAccent(league.id);
  const emblem = leagueEmblem(league.name);
  // El dueño manda ADMIN; un moderador nombrado, MODERADOR. El resto, nada.
  const roleTag = league.isOwner ? 'ADMIN' : league.role === 'organizer' ? 'MODERADOR' : null;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <View style={[styles.card, { borderColor: mine ? accent.neon : colors.line }]}>
        {/* La portada va de fondo, atenuada: acompaña sin tapar el dato. */}
        <View style={styles.bg} pointerEvents="none">
          <Cover id={league.id} photoUrl={league.photo_url} height={132} />
        </View>
        <View style={styles.scrim} pointerEvents="none" />

        <View style={styles.cardRow}>
          <Hex size={72} color={accent.neon} solid>
            <View style={{ alignItems: 'center' }}>
              <Text style={[styles.emblem, { fontSize: emblemFont(emblem.top, 15) }]} numberOfLines={1}>
                {emblem.top}
              </Text>
              {emblem.bottom ? (
                <Text
                  style={[styles.emblemSub, { fontSize: emblemFont(emblem.bottom, 8.5) }]}
                  numberOfLines={1}
                >
                  {emblem.bottom}
                </Text>
              ) : null}
            </View>
          </Hex>

          <View style={{ flex: 1, gap: 3 }}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>
                {league.name}
              </Text>
              {roleTag ? (
                <View style={[styles.roleTag, { borderColor: accent.neon }]}>
                  <Text style={[styles.roleTagText, { color: accent.warm }]}>{roleTag}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.desc} numberOfLines={2}>
              {league.description ?? 'Sin descripción'}
            </Text>

            <View style={styles.statsRow}>
              <MiniStat glyph="👥" value={String(league.memberCount)} label="Miembros" tint={accent.neon} />
              <MiniStat glyph="🏆" value={String(league.tournamentCount)} label="Torneos" tint={accent.neon} />
              <MiniStat
                glyph="📊"
                value={league.myRank ? `#${league.myRank}` : '—'}
                label="Tu posición"
                tint={accent.neon}
              />
            </View>
          </View>

          {mine || !onJoin ? (
            <IconChevron />
          ) : (
            <Pressable style={[styles.join, { borderColor: accent.neon }]} onPress={onJoin}>
              <Text style={[styles.joinText, { color: accent.warm }]}>UNIRME</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function MiniStat({ glyph, value, label, tint }: { glyph: string; value: string; label: string; tint: string }) {
  return (
    <View style={styles.miniStat}>
      <Text style={styles.miniGlyph}>{glyph}</Text>
      <View>
        <Text style={[styles.miniValue, { color: tint }]}>{value}</Text>
        <Text style={styles.miniLabel}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  bg: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.5 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,6,12,0.62)' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  emblem: { fontSize: 15, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.5 },
  emblemSub: { fontSize: 7.5, fontWeight: '800', letterSpacing: 0.5, color: colors.inkSoft, marginTop: -1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  name: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.ink },
  roleTag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  roleTagText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.6 },
  desc: { fontSize: 11.5, color: colors.inkSoft, lineHeight: 16 },
  statsRow: { flexDirection: 'row', gap: space.lg, marginTop: space.sm },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  miniGlyph: { fontSize: 13 },
  miniValue: { fontSize: 14, fontWeight: '800' },
  miniLabel: { fontSize: 9, color: colors.inkDim },
  join: { borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  joinText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});
