import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import { IconChevron } from '../ui/icons';
import { colors, space, type } from '../theme';

export default function AdminScreen({ navigation }: any) {
  const [playerCount, setPlayerCount] = useState(0);
  const [leagueCount, setLeagueCount] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [openDisputes, setOpenDisputes] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ count: players }, { count: leagues }, { count: matches }, { count: disputes }] =
      await Promise.all([
        supabase.from('players').select('*', { count: 'exact', head: true }),
        supabase.from('leagues').select('*', { count: 'exact', head: true }),
        supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
        supabase.from('matches').select('*', { count: 'exact', head: true }).eq('status', 'disputed'),
      ]);
    setPlayerCount(players ?? 0);
    setLeagueCount(leagues ?? 0);
    setMatchCount(matches ?? 0);
    setOpenDisputes(disputes ?? 0);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const n = (v: number) => (loading ? '—' : String(v));

  return (
    <Screen scroll padded={false}>
      <View style={styles.pad}>
        <View style={styles.headRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Hex size={72} color={colors.elite}>
            <Text style={{ fontSize: 26 }}>👑</Text>
          </Hex>
          <Text style={styles.title}>Panel de control</Text>
          <Pill label="Administrador" color={colors.elite} align="center" />
        </View>

        {/* La disputa es lo único que exige acción del admin: si hay, va primero. */}
        {openDisputes > 0 && (
          <Card style={styles.alert} onPress={() => navigation.navigate('Disputes')}>
            <Text style={styles.alertTag}>REQUIERE ARBITRAJE</Text>
            <Text style={styles.alertBig}>
              {openDisputes}
              <Text style={styles.alertUnit}> batalla{openDisputes === 1 ? '' : 's'} en disputa</Text>
            </Text>
            <Text style={styles.meta}>
              Los jugadores reportaron resultados distintos. Cada combate está detenido hasta que un juez falle.
            </Text>
            <Text style={styles.alertCta}>Ver bandeja ›</Text>
          </Card>
        )}

        <Card style={styles.stats}>
          <Stat label="Jugadores" value={n(playerCount)} />
          <View style={styles.vDiv} />
          <Stat label="Ligas" value={n(leagueCount)} />
          <View style={styles.vDiv} />
          <Stat label="Batallas" value={n(matchCount)} tint={colors.blue} />
        </Card>

        <View style={styles.block}>
          <SectionTitle>Gestión</SectionTitle>

          <Link
            glyph="🧑‍🚀"
            title="Jugadores"
            sub="Ver a todos y registrar bladers sin cuenta"
            onPress={() => navigation.navigate('AdminPlayers')}
          />
          <Link
            glyph="🏅"
            title="Ligas"
            sub="Crear ligas y nombrar moderadores"
            // Las ligas viven en la pestaña Batallas, no en Perfil. Hay que
            // saltar de pestaña: un navigate('Leagues') a secas no encuentra
            // la ruta dentro de esta pila y el toque no hace nada.
            onPress={() => navigation.navigate('Batallas', { screen: 'Leagues' })}
          />
          <Link
            glyph="📣"
            title="Anuncios"
            sub="Avisar a un jugador, a un club, a una liga o a todos"
            onPress={() => navigation.navigate('Announcements')}
          />
          <Link
            glyph="📊"
            title="Ranking global"
            sub="Toda la plataforma ordenada por ELO"
            onPress={() => navigation.navigate('AdminGlobalRanking')}
          />
          <Link
            glyph="⚖️"
            title="Disputas"
            sub={
              openDisputes > 0
                ? `${openDisputes} combate${openDisputes === 1 ? '' : 's'} esperando fallo`
                : 'Nada pendiente de arbitrar'
            }
            onPress={() => navigation.navigate('Disputes')}
          />
        </View>
      </View>
    </Screen>
  );
}

function Link({
  glyph,
  title,
  sub,
  onPress,
}: {
  glyph: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Card style={styles.link} onPress={onPress}>
      <Text style={styles.linkGlyph}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.meta}>{sub}</Text>
      </View>
      <IconChevron />
    </Card>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label.toUpperCase()}</Text>
      <Text style={[styles.statVal, tint ? { color: tint } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  headRow: { paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },

  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  title: { ...type.display, fontSize: 23, textAlign: 'center' },

  alert: { gap: 4, borderColor: colors.loss, backgroundColor: colors.lossSoft },
  alertTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, color: colors.loss },
  alertBig: { fontSize: 22, fontWeight: '800', fontStyle: 'italic', color: colors.ink },
  alertUnit: { fontSize: 13, fontWeight: '600', fontStyle: 'normal', color: colors.inkSoft },
  alertCta: { fontSize: 12, fontWeight: '800', color: colors.loss, marginTop: 4 },

  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  statVal: { fontSize: 19, fontWeight: '800', color: colors.ink },
  vDiv: { width: 1, height: 28, backgroundColor: colors.line },

  block: { marginTop: space.xl, gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  linkGlyph: { fontSize: 19, width: 26, textAlign: 'center' },
  linkTitle: { fontSize: 14.5, fontWeight: '700', color: colors.ink },
  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
});
