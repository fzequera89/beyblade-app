import { View, Text, Pressable, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';
import { Hex } from './primitives';
import Cover, { coverAccent } from './Cover';
import { CountdownBox, ClosingBar, InfoRow, StatStrip, TournamentName, splitName } from './tournament';
import { leagueEmblem, emblemFont } from '../lib/emblem';
import { COMBAT_MODES } from '../lib/formats';
import { fmtDateFull } from '../lib/when';
import { IconChevron } from './icons';
import { colors, space, type, radius, glow } from '../theme';

// Las tarjetas de un torneo, en un solo lugar. Se ven igual en el lobby de una
// liga (TournamentsScreen) y en el hub de Batallas (lista global). La HeroCard
// es el torneo más relevante visto de cerca; la RowCard, una fila de la lista.

export type Filter = 'todos' | 'abiertos' | 'completados';

export type Champion = {
  id: string;
  display_name: string;
  elo_rating: number;
  avatar_key: string | null;
  avatar_url: string | null;
};

export type Tournament = {
  id: string;
  name: string;
  status: string;
  mode: string | null;
  photo_url: string | null;
  combat_mode: string | null;
  created_at: string | null;
  starts_at: string | null;
  registration_closes_at: string | null;
  capacity: number | null;
  level: string | null;
  prize: string | null;
  venues: { name: string; city: string | null } | null;
  registered: number;
  mine: boolean;
  champion: Champion | null;
};

// El formato en una línea: cómo se juega y con cuántas peonzas. Repetir "deck
// de 3 · 3 piezas" dice dos veces lo mismo.
export function formatLine(t: Pick<Tournament, 'combat_mode'>): string {
  const deck = COMBAT_MODES.find((m) => m.key === t.combat_mode)?.deckSize ?? 1;
  const rules = t.combat_mode === 'stock' ? 'Stock de caja' : 'Estándar';
  return `${rules} · ${deck} pieza${deck === 1 ? '' : 's'}`;
}

// Abiertos primero y por fecha más cercana; después los que están en curso; al
// final los terminados. Sin fecha va después de los que sí la tienen: no se
// puede decidir si urge.
export function byRelevance(a: Tournament, b: Tournament): number {
  const rank = (t: Tournament) => (t.status === 'pending' ? 0 : t.status === 'completed' ? 2 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  const at = a.starts_at ? new Date(a.starts_at).getTime() : null;
  const bt = b.starts_at ? new Date(b.starts_at).getTime() : null;
  if (at === null && bt === null) return 0;
  if (at === null) return 1;
  if (bt === null) return -1;
  // Los terminados, del más reciente al más viejo. Los demás, del más próximo.
  return rank(a) === 2 ? bt - at : at - bt;
}

/**
 * El campeón de cada torneo terminado: el ganador del combate de ronda más alta,
 * con la gran final por encima del número de ronda (en eliminación doble abajo
 * se juegan más rondas que arriba, así que la última no es la que decide). Se
 * resuelve en dos consultas para toda la lista, no una por torneo.
 */
export async function attachChampions(rows: Tournament[]): Promise<void> {
  const done = rows.filter((t) => t.status === 'completed').map((t) => t.id);
  if (done.length === 0) return;

  const { data: finals } = await supabase
    .from('matches')
    .select('tournament_id, bracket_round, bracket_side, winner_id')
    .in('tournament_id', done)
    .eq('status', 'confirmed')
    .not('winner_id', 'is', null);

  const best = new Map<string, { round: number; final: boolean; winner: string }>();
  for (const m of ((finals as any[]) ?? [])) {
    const final = m.bracket_side === 'final';
    const prev = best.get(m.tournament_id);
    const better = !prev || (final !== prev.final ? final : (m.bracket_round ?? 0) > prev.round);
    if (better) best.set(m.tournament_id, { round: m.bracket_round ?? 0, final, winner: m.winner_id });
  }

  const winnerIds = [...new Set([...best.values()].map((b) => b.winner))];
  if (winnerIds.length === 0) return;

  const { data: players } = await supabase
    .from('players')
    .select('id, display_name, elo_rating, avatar_key, avatar_url')
    .in('id', winnerIds);
  const byId = new Map(((players as any[]) ?? []).map((p) => [p.id, p]));
  for (const t of rows) {
    const b = best.get(t.id);
    if (b) t.champion = byId.get(b.winner) ?? null;
  }
}

export function HeroCard({ t, onPress }: { t: Tournament; onPress: () => void }) {
  const accent = coverAccent(t.id);
  const full = t.capacity !== null && t.registered >= t.capacity;

  return (
    <View style={[styles.hero, { borderColor: accent.neon }]}>
      <View style={styles.heroHead}>
        <View style={styles.absFill} pointerEvents="none">
          <Cover id={t.id} photoUrl={t.photo_url} live height={244} />
        </View>

        <View style={styles.heroTop}>
          <View style={[styles.tag, { borderColor: colors.win, backgroundColor: 'rgba(4,6,12,0.6)' }]}>
            <Text style={[styles.tagText, { color: colors.win }]}>REGISTRO ABIERTO</Text>
          </View>
          <CountdownBox startsAt={t.starts_at} accent={accent.warm} />
        </View>

        <View style={styles.heroBottom}>
          <TournamentName name={t.name} color={accent.warm} size={25} />
          <View style={styles.heroInfo}>
            <InfoRow glyph="📅" value={fmtDateFull(t.starts_at) ?? 'Fecha por confirmar'} accent={accent.warm} />
            <InfoRow
              glyph="📍"
              value={t.venues ? [t.venues.name, t.venues.city].filter(Boolean).join(', ') : 'Sede por confirmar'}
              accent={accent.warm}
            />
            <InfoRow glyph="👥" label="Formato" value={formatLine(t)} accent={accent.warm} />
          </View>
        </View>
      </View>

      <View style={styles.heroFoot}>
        <StatStrip
          items={[
            {
              glyph: '👥',
              label: 'INSCRITOS',
              value: t.capacity ? `${t.registered} / ${t.capacity}` : String(t.registered),
              tint: full ? colors.loss : undefined,
            },
            { glyph: '🛡️', label: 'NIVEL', value: t.level ?? 'Abierto' },
            { glyph: '🏆', label: 'PREMIO', value: t.prize ?? 'Sin premio' },
          ]}
        />

        <ClosingBar createdAt={t.created_at} closesAt={t.registration_closes_at} accent={accent.neon} />

        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            styles.heroBtn,
            { backgroundColor: accent.neon },
            glow(accent.neon, 14),
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={styles.heroBtnText}>VER TORNEO</Text>
          <Text style={styles.heroBtnChevron}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function RowCard({
  t,
  onPress,
  subtitle,
}: {
  t: Tournament;
  onPress: () => void;
  /** Línea extra bajo el nombre — p. ej. la liga, cuando la lista es global. */
  subtitle?: string | null;
}) {
  const accent = coverAccent(t.id);
  const done = t.status === 'completed';
  const live = t.status === 'in_progress';
  const emblem = leagueEmblem(t.name);
  const [head, tail] = splitName(t.name);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      <View style={[styles.row, { borderColor: done ? colors.line : accent.neon }]}>
        {/* Escudo sobre un trozo de su propia portada: la fila se reconoce de
            vista antes de leer el nombre. */}
        <View style={styles.thumb}>
          <View style={styles.absFill} pointerEvents="none">
            <Cover id={t.id} photoUrl={t.photo_url} height={116} />
          </View>
          <Hex size={70} color={done ? colors.inkDim : accent.neon}>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={[styles.emblem, { fontSize: emblemFont(emblem.top, 13) }, done && { color: colors.inkSoft }]}
                numberOfLines={1}
              >
                {emblem.top}
              </Text>
              {emblem.bottom ? (
                <Text style={[styles.emblemSub, { fontSize: emblemFont(emblem.bottom, 9) }]} numberOfLines={1}>
                  {emblem.bottom}
                </Text>
              ) : null}
            </View>
          </Hex>
        </View>

        <View style={styles.rowBody}>
          <View style={styles.rowTags}>
            <View style={[styles.tag, { borderColor: done ? colors.inkDim : live ? accent.neon : colors.win }]}>
              <Text style={[styles.tagText, { color: done ? colors.inkSoft : live ? accent.warm : colors.win }]}>
                {done ? 'COMPLETADO' : live ? 'EN JUEGO' : 'REGISTRO ABIERTO'}
              </Text>
            </View>
            {t.mine && !done ? (
              <View style={[styles.tag, { borderColor: colors.blue }]}>
                <Text style={[styles.tagText, { color: colors.blueHi }]}>INSCRITO</Text>
              </View>
            ) : null}
          </View>

          <Text style={[styles.rowName, done && { color: colors.inkSoft }]} numberOfLines={2}>
            {head}
            {tail ? <Text style={{ color: done ? colors.inkDim : accent.warm }}> — {tail}</Text> : null}
          </Text>

          {subtitle ? (
            <Text style={[styles.meta, { color: accent.warm }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          <Text style={styles.meta} numberOfLines={1}>
            📅 {fmtDateFull(t.starts_at) ?? 'Fecha por confirmar'}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            📍 {t.venues ? [t.venues.name, t.venues.city].filter(Boolean).join(', ') : 'Sede por confirmar'}
          </Text>

          {/* Un torneo terminado es su campeón; uno abierto son sus lugares. */}
          {done && t.champion ? (
            <View style={styles.champRow}>
              <Avatar uri={t.champion.avatar_url} avatarKey={t.champion.avatar_key} size={26} ring={colors.streak} />
              <View style={{ flex: 1 }}>
                <Text style={styles.champTag}>CAMPEÓN</Text>
                <Text style={styles.champName} numberOfLines={1}>
                  {t.champion.display_name} · {Math.round(t.champion.elo_rating)} ELO
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.rowSide}>
          {done ? (
            <View style={[styles.results, { borderColor: colors.win }]}>
              <Text style={styles.resultsText}>VER RESULTADOS ›</Text>
            </View>
          ) : (
            <>
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.sideLabel}>INSCRITOS</Text>
                <Text style={styles.sideValue}>
                  {t.registered}
                  {t.capacity ? ` / ${t.capacity}` : ''}
                </Text>
              </View>
              <CountdownBox startsAt={t.starts_at} accent={accent.warm} compact />
            </>
          )}
        </View>

        {!done && <IconChevron />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  absFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  hero: { borderWidth: 1, borderRadius: radius.lg, backgroundColor: colors.card, overflow: 'hidden' },
  heroHead: { height: 244, justifyContent: 'space-between', padding: space.lg },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },
  heroBottom: { gap: space.md },
  heroInfo: { gap: 5 },
  heroFoot: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.md },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: space.lg,
  },
  heroBtnText: { fontSize: 13.5, fontWeight: '800', letterSpacing: 1, color: '#fff' },
  heroBtnChevron: { fontSize: 18, fontWeight: '800', color: '#fff', marginTop: -2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    paddingRight: space.md,
  },
  thumb: { width: 96, height: 128, alignItems: 'center', justifyContent: 'center' },
  emblem: { fontSize: 12.5, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.4 },
  emblemSub: { fontSize: 7, fontWeight: '800', letterSpacing: 0.4, color: colors.inkSoft, marginTop: -1 },

  rowBody: { flex: 1, gap: 2, paddingVertical: space.md },
  rowTags: { flexDirection: 'row', gap: 5, marginBottom: 2 },
  rowName: { fontSize: 14.5, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.3 },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2.5 },
  tagText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },

  rowSide: { alignItems: 'center', gap: 6, width: 78 },
  sideLabel: { fontSize: 7.5, fontWeight: '800', letterSpacing: 0.6, color: colors.inkDim },
  sideValue: { fontSize: 13, fontWeight: '800', color: colors.ink },
  results: { borderWidth: 1, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8 },
  resultsText: { fontSize: 8.5, fontWeight: '800', color: colors.win, letterSpacing: 0.4 },

  champRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 4 },
  champTag: { fontSize: 7.5, fontWeight: '800', letterSpacing: 0.7, color: colors.streak },
  champName: { fontSize: 11.5, fontWeight: '700', color: colors.ink },

  meta: { fontSize: 11, color: colors.inkSoft },
});
