import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Card, Hex, Pill, SectionTitle } from '../ui/primitives';
import {
  Combo,
  DeckCard,
  SPARE_SLOTS,
  deckSizeFor,
  loadDeckCard,
  loadMyCombos,
  piecesOf,
  repeatedPieces,
  saveDeckCard,
} from '../lib/decks';
import { colors, space, type, radius } from '../theme';

// La tarjeta de deck de un torneo.
//
// Armar un deck es una DECISIÓN, no una lista: como ninguna pieza se puede
// repetir, elegir el mejor blade para el primer combo te lo quita de los otros
// dos. Por eso la pantalla enseña las piezas de cada combo y marca en rojo la
// que ya está usada, en vez de dejar que lo descubras al guardar.

export default function DeckScreen({ route, navigation }: any) {
  const { tournamentId, tournamentName, combatMode, status } = route.params;
  const { playerId } = useAuth();

  const size = deckSizeFor(combatMode);
  // El deck del reglamento es "3+1": los principales más un extra opcional que
  // se juega completo o se desarma para dar piezas a los otros.
  const maxPicks = size + SPARE_SLOTS;
  const [combos, setCombos] = useState<Combo[]>([]);
  const [deck, setDeck] = useState<DeckCard | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!playerId) return;
    setLoading(true);
    try {
      const [mine, card] = await Promise.all([
        loadMyCombos(playerId),
        loadDeckCard(tournamentId, playerId),
      ]);
      setCombos(mine);
      setDeck(card);
      setPicked(card ? card.combos.map((c) => c.combo.id) : []);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [playerId, tournamentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const locked = !!deck?.locked_at;
  const chosen = picked.map((id) => combos.find((c) => c.id === id)).filter(Boolean) as Combo[];
  const repeated = repeatedPieces(chosen);
  const usedPieces = new Set(chosen.flatMap(piecesOf));

  function toggle(combo: Combo) {
    if (locked) return;
    setPicked((prev) => {
      if (prev.includes(combo.id)) return prev.filter((id) => id !== combo.id);
      if (prev.length >= maxPicks) {
        Alert.alert(
          'Deck completo',
          `Este torneo pide ${size} principales y un extra. Quita uno para cambiarlo.`
        );
        return prev;
      }
      return [...prev, combo.id];
    });
  }

  async function save() {
    setBusy(true);
    try {
      await saveDeckCard(tournamentId, picked);
      Alert.alert('Deck registrado', 'Queda guardado. La organización lo bloquea al cerrar el registro.');
      load();
    } catch (e: any) {
      Alert.alert('No se pudo guardar', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  // El extra es opcional: con los principales ya se puede guardar.
  const canSave =
    !locked &&
    picked.length >= size &&
    picked.length <= maxPicks &&
    repeated.length === 0 &&
    status === 'pending';

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>Tu deck</Text>
        <Text style={styles.sub}>{tournamentName}</Text>
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.sm }}>
          <Pill label={`${size} combinaciones`} color={colors.blue} />
          {locked ? <Pill label="Bloqueado" color={colors.streak} /> : null}
        </View>
      </View>

      <Card style={{ gap: space.sm, marginBottom: space.lg }}>
        <Text style={styles.rule}>
          {size} principales y 1 extra opcional. Ninguna pieza se puede repetir entre ellos: ni el
          blade, ni el ratchet, ni el bit.
        </Text>
        <Text style={styles.hint}>
          El extra se puede jugar completo o desarmar para cambiarle piezas a los principales. El
          deck solo se usa en torneos de ranking.
        </Text>
        <Text style={styles.hint}>
          {locked
            ? 'Tu deck ya está bloqueado: así se juega el torneo. Se bloquea para que nadie lo cambie después de ver el bracket.'
            : 'Se puede cambiar hasta que la organización cierre el registro.'}
        </Text>
      </Card>

      {/* Los espacios se ven vacíos a propósito: el deck es una tarjeta con
          huecos que llenar, no una lista de seleccionados. */}
      <View style={styles.slots}>
        {Array.from({ length: maxPicks }).map((_, i) => {
          const combo = chosen[i];
          const spare = i >= size;
          return (
            <View
              key={i}
              style={[
                styles.slot,
                combo && { borderColor: spare ? colors.streak : colors.blue },
                spare && !combo && { borderColor: colors.line },
              ]}
            >
              <Text style={[styles.slotNum, spare && { color: colors.streak }]}>
                {spare ? 'EXTRA' : i + 1}
              </Text>
              <Text style={[styles.slotName, !combo && { color: colors.inkDim }]} numberOfLines={1}>
                {combo ? combo.name : spare ? 'Opcional' : 'Vacío'}
              </Text>
            </View>
          );
        })}
      </View>

      {/* La inspección del juez: es lo que convierte "revisado y autorizado" en
          un hecho con nombre y hora, en vez de un acuerdo de palabra. */}
      {deck?.inspected_at ? (
        <Card
          style={[
            styles.inspect,
            { borderColor: deck.inspection_passed ? colors.win : colors.loss },
          ]}
        >
          <Text
            style={[
              styles.inspectTitle,
              { color: deck.inspection_passed ? colors.win : colors.loss },
            ]}
          >
            {deck.inspection_passed ? '✓ Deck revisado y autorizado' : '✕ Deck rechazado en revisión'}
          </Text>
          {deck.inspection_notes ? (
            <Text style={styles.inspectNote}>{deck.inspection_notes}</Text>
          ) : null}
          <Text style={styles.hint}>
            {deck.inspection_passed
              ? 'Después de autorizar no se cambian piezas ni lanzadores.'
              : 'Corrige lo señalado y vuelve a presentarlo con el juez.'}
          </Text>
        </Card>
      ) : null}

      <Pressable style={styles.guideRow} onPress={() => navigation.navigate('WearGuide')}>
        <Text style={styles.guideGlyph}>🔍</Text>
        <Text style={styles.guideText}>QUÉ REVISA EL JUEZ (GUÍA DE DESGASTE)</Text>
        <Text style={styles.guideChevron}>›</Text>
      </Pressable>

      {repeated.length > 0 && (
        <Card style={[styles.warn, { borderColor: colors.loss }]}>
          <Text style={styles.warnTitle}>Piezas repetidas</Text>
          <Text style={styles.warnText}>
            {repeated.join(', ')} — cámbialas o el deck no es legal.
          </Text>
        </Card>
      )}

      <SectionTitle>{locked ? 'Tu deck' : 'Elige tus combinaciones'}</SectionTitle>

      {combos.length === 0 && !loading ? (
        <Card style={styles.empty}>
          <Hex size={50} color={colors.inkDim}>
            <Text style={{ fontSize: 18 }}>🧩</Text>
          </Hex>
          <Text style={styles.emptyTitle}>No tienes combos registrados</Text>
          <Text style={styles.hintCenter}>
            El deck se arma con tus combos. Créalos en Perfil › Mis combos, con su blade, ratchet y
            bit.
          </Text>
        </Card>
      ) : (
        combos.map((c) => {
          const on = picked.includes(c.id);
          const pieces = piecesOf(c);
          // Una pieza que ya usa OTRO combo elegido: es la que va a chocar.
          const clashing = !on && pieces.some((p) => usedPieces.has(p));
          return (
            <Card
              key={c.id}
              onPress={locked ? undefined : () => toggle(c)}
              style={[
                styles.combo,
                on && { borderColor: colors.blue, backgroundColor: colors.surface },
                clashing && { opacity: 0.55 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.comboName}>{c.name}</Text>
                <Text style={styles.comboParts} numberOfLines={1}>
                  {[c.parts?.blade, c.parts?.ratchet, c.parts?.bit].filter(Boolean).join(' · ') ||
                    'Sin piezas anotadas'}
                </Text>
                {clashing ? (
                  <Text style={styles.clash}>Repite una pieza de las que ya elegiste</Text>
                ) : null}
              </View>
              {on ? <Pill label="En el deck" color={colors.blue} /> : null}
            </Card>
          );
        })
      )}

      {!locked && (
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button
            label={`GUARDAR DECK (${picked.length}/${size}${picked.length > size ? '+1' : ''})`}
            onPress={save}
            disabled={!canSave || busy}
            loading={busy}
          />
          {status !== 'pending' ? (
            <Text style={styles.hintCenter}>El torneo ya empezó: el deck se registra antes.</Text>
          ) : picked.length < size ? (
            <Text style={styles.hintCenter}>
              Te faltan {size - picked.length} principal(es). El extra es opcional.
            </Text>
          ) : picked.length === size ? (
            <Text style={styles.hintCenter}>Puedes guardar así, o agregar el extra.</Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  hero: { paddingVertical: space.lg, gap: 3 },
  title: { ...type.display, fontSize: 22 },
  sub: { fontSize: 12.5, color: colors.inkSoft },

  rule: { fontSize: 13, color: colors.ink, lineHeight: 18, fontWeight: '600' },
  hint: { fontSize: 11.5, color: colors.inkSoft, lineHeight: 16 },
  hintCenter: { fontSize: 11.5, color: colors.inkDim, textAlign: 'center', lineHeight: 16 },

  slots: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg, flexWrap: 'wrap' },
  slot: {
    flex: 1,
    minWidth: 92,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    gap: 2,
  },
  slotNum: { fontSize: 9, fontWeight: '800', color: colors.inkDim },
  slotName: { fontSize: 12, fontWeight: '700', color: colors.ink },

  warn: { gap: 3, marginBottom: space.lg },
  warnTitle: { fontSize: 12, fontWeight: '800', color: colors.loss, letterSpacing: 0.5 },
  warnText: { fontSize: 12, color: colors.ink, lineHeight: 17 },

  inspect: { gap: 4, marginBottom: space.lg },
  inspectTitle: { fontSize: 13, fontWeight: '800' },
  inspectNote: { fontSize: 12.5, color: colors.ink, lineHeight: 18 },

  guideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    marginBottom: space.lg,
  },
  guideGlyph: { fontSize: 15 },
  guideText: { flex: 1, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, color: colors.inkSoft },
  guideChevron: { fontSize: 18, color: colors.inkDim },

  combo: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  comboName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  comboParts: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },
  clash: { fontSize: 10.5, color: colors.loss, marginTop: 3 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
