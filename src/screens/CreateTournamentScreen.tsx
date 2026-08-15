import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import VenueCover from '../ui/VenueCover';
import { Field } from '../ui/Field';
import { Card, Pill, SectionTitle } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';
import { pickVenuePhoto, uploadVenuePhoto } from '../lib/venuePhoto';
import {
  COMBAT_MODES,
  PHASE_KINDS,
  CombatMode,
  PhaseKind,
  SwissTiebreak,
  recommendStructure,
  suggestedSwissRounds,
} from '../lib/formats';
import { createTournament, PhaseSpec } from '../lib/formatsRepo';

// Armador de torneos.
//
// El cliente pidió poder armar cualquier formato popular. La trampa estaba en
// tratarlos como una lista: 1v1, 3v3, suizo, doble eliminación... no son
// alternativas entre sí, son EJES distintos que se combinan. Un torneo real es
// "suizo de 5 rondas en modalidad 3v3, final a 7 puntos".
//
// Por eso el armador pregunta un eje a la vez, en el orden en que el
// organizador ya piensa: qué se juega → cómo se emparejan → a cuántos puntos.

const STEPS = ['Identidad', 'Modalidad', 'Estructura', 'Puntos'] as const;

export default function CreateTournamentScreen({ route, navigation }: any) {
  const { leagueId } = route.params;

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  // Paso 1
  const [name, setName] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [mode, setMode] = useState<'ranking' | 'casual'>('ranking');

  // Paso 2
  const [combatMode, setCombatMode] = useState<CombatMode>('solo');
  const [deckOrder, setDeckOrder] = useState<'fixed' | 'blind'>('fixed');

  // Paso 3
  const [expected, setExpected] = useState('12');
  const [phases, setPhases] = useState<PhaseSpec[]>([]);
  const [why, setWhy] = useState('');
  const [tiebreak, setTiebreak] = useState<SwissTiebreak>('dml');

  const [registered, setRegistered] = useState<number | null>(null);

  // Cuántos hay inscritos de verdad: es mejor dato que un número inventado.
  useEffect(() => {
    (async () => {
      const { count } = await supabase
        .from('league_members')
        .select('*', { count: 'exact', head: true })
        .eq('league_id', leagueId);
      if (count && count > 1) {
        setRegistered(count);
        setExpected(String(count));
      }
    })();
  }, [leagueId]);

  const applyRecommendation = useCallback(
    (playerCount: number, forMode: 'ranking' | 'casual') => {
      const r = recommendStructure(playerCount);
      // En ranking el reglamento no deja elegir: siempre a 4 puntos. Las metas
      // de 5, 7 y 10 son de los torneos abiertos. Se puede cambiar a mano, pero
      // no debe llegar ya cambiado por la sugerencia.
      setPhases(
        r.phases.map((p) => ({ ...p, points_to_win: forMode === 'ranking' ? 4 : p.points_to_win }))
      );
      setWhy(r.why);
    },
    []
  );

  useEffect(() => {
    applyRecommendation(Number(expected) || 8, mode);
  }, [expected, mode, applyRecommendation]);

  function setPhase(i: number, patch: Partial<PhaseSpec>) {
    setPhases((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function addPhase() {
    setPhases((prev) => [
      ...prev,
      {
        kind: 'single_elim',
        cut_size: Math.max(2, Math.floor((Number(expected) || 8) / 4)),
        points_to_win: mode === 'ranking' ? 4 : 5,
      },
    ]);
  }

  function removePhase(i: number) {
    setPhases((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function pickPhoto() {
    const uri = await pickVenuePhoto();
    if (uri) setPhotoUri(uri);
  }

  async function create() {
    if (!name.trim()) return Alert.alert('Falta el nombre');
    if (phases.length === 0) return Alert.alert('Falta la estructura', 'Agrega al menos una fase.');

    setBusy(true);
    try {
      const id = await createTournament({
        leagueId,
        name,
        mode,
        combat_mode: combatMode,
        deck_order: deckOrder,
        swiss_tiebreak: tiebreak,
        phases,
      });

      // La foto se sube DESPUÉS de crear porque la ruta lleva el id del torneo.
      // Si algo falla aquí, el torneo ya existe y se queda con su portada
      // dibujada: se pierde la foto, no el torneo.
      if (photoUri) {
        const url = await uploadVenuePhoto(id, photoUri);
        if (url) await supabase.from('tournaments').update({ photo_url: url }).eq('id', id);
      }

      navigation.replace('TournamentDetail', { tournamentId: id, leagueId, isOrganizer: true });
    } catch (e: any) {
      Alert.alert('No se pudo crear', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const deckSize = COMBAT_MODES.find((m) => m.key === combatMode)?.deckSize ?? 1;
  const usesSwiss = phases.some((p) => p.kind === 'swiss');

  return (
    <Screen scroll padded={false}>
      <View style={styles.headRow}>
        <Pressable onPress={() => (step === 0 ? navigation.goBack() : setStep(step - 1))} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Nuevo torneo</Text>
      </View>

      {/* Dónde vas */}
      <View style={styles.steps}>
        {STEPS.map((s, i) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.dot, i <= step && styles.dotOn]} />
            <Text style={[styles.stepLabel, i === step && styles.stepLabelOn]}>{s}</Text>
          </View>
        ))}
      </View>

      <View style={styles.pad}>
        {step === 0 && (
          <View style={{ gap: space.md }}>
            {/* La portada primero: un torneo es un evento, no un registro. */}
            <View style={styles.coverWrap}>
              <VenueCover id={name || 'torneo-nuevo'} photoUrl={photoUri} height={140} />
              <Pressable style={styles.coverBtn} onPress={pickPhoto}>
                <Text style={styles.coverBtnText}>
                  {photoUri ? '🖼️ Cambiar portada' : '🖼️ Poner foto de portada'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.hint}>
              Si no pones foto, el torneo lleva esta portada dibujada. Nunca se queda en blanco.
            </Text>

            <Field
              label="Nombre del torneo"
              placeholder="Copa Central — Septiembre"
              value={name}
              onChangeText={setName}
              maxLength={50}
              counter={`${name.length}/50`}
            />

            <SectionTitle>¿Cuenta para el ranking?</SectionTitle>
            <View style={styles.row}>
              {([
                { v: 'ranking' as const, label: 'Ranking', desc: 'Mueve el ELO y la categoría. Sin Aerial.' },
                { v: 'casual' as const, label: 'Casual', desc: 'Al azar, Aerial vale, no toca el ranking.' },
              ]).map((o) => (
                <Pressable
                  key={o.v}
                  onPress={() => setMode(o.v)}
                  style={[styles.opt, { flex: 1 }, mode === o.v && styles.optOn]}
                >
                  <Text style={[styles.optName, mode === o.v && styles.optNameOn]}>{o.label}</Text>
                  <Text style={styles.optDesc}>{o.desc}</Text>
                </Pressable>
              ))}
            </View>

            <Button label="SIGUIENTE" onPress={() => setStep(1)} disabled={!name.trim()} />
          </View>
        )}

        {step === 1 && (
          <View style={{ gap: space.md }}>
            <SectionTitle>¿Cuántas peonzas trae cada quien?</SectionTitle>
            {COMBAT_MODES.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setCombatMode(m.key)}
                style={[styles.opt, combatMode === m.key && styles.optOn]}
              >
                <View style={styles.optTop}>
                  <Text style={[styles.optName, combatMode === m.key && styles.optNameOn]}>{m.label}</Text>
                  <Pill label={`${m.deckSize} bey${m.deckSize > 1 ? 's' : ''}`} />
                </View>
                <Text style={styles.optDesc}>{m.desc}</Text>
              </Pressable>
            ))}

            {deckSize > 1 && (
              <>
                <SectionTitle>¿Cómo se elige la peonza de cada round?</SectionTitle>
                <View style={styles.row}>
                  {([
                    { v: 'fixed' as const, label: 'Orden decidido antes', desc: 'Se anota el orden y se respeta.' },
                    { v: 'blind' as const, label: 'A ciegas', desc: 'Cada quien elige en secreto y se revela a la vez.' },
                  ]).map((o) => (
                    <Pressable
                      key={o.v}
                      onPress={() => setDeckOrder(o.v)}
                      style={[styles.opt, { flex: 1 }, deckOrder === o.v && styles.optOn]}
                    >
                      <Text style={[styles.optName, deckOrder === o.v && styles.optNameOn]}>{o.label}</Text>
                      <Text style={styles.optDesc}>{o.desc}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>
                  Con deck no se puede repetir ninguna pieza entre las {deckSize} combinaciones.
                </Text>
              </>
            )}

            <Button label="SIGUIENTE" onPress={() => setStep(2)} />
          </View>
        )}

        {step === 2 && (
          <View style={{ gap: space.md }}>
            <Field
              label="¿Cuántos van a jugar?"
              value={expected}
              onChangeText={setExpected}
              keyboardType="number-pad"
              hint={
                registered
                  ? `La liga tiene ${registered} miembros. La estructura se recalcula sola.`
                  : 'La estructura se recalcula sola.'
              }
            />

            {why ? (
              <Card style={styles.whyCard}>
                <Text style={styles.whyTag}>SUGERENCIA</Text>
                <Text style={styles.whyText}>{why}</Text>
                <Text style={styles.hint}>Puedes cambiarla: es una sugerencia, no una regla.</Text>
              </Card>
            ) : null}

            {phases.map((p, i) => (
              <Card key={i} style={{ gap: space.sm }}>
                <View style={styles.optTop}>
                  <Text style={styles.phaseTag}>FASE {i + 1}</Text>
                  {phases.length > 1 && (
                    <Pressable onPress={() => removePhase(i)} hitSlop={6}>
                      <Text style={styles.remove}>Quitar</Text>
                    </Pressable>
                  )}
                </View>

                <View style={styles.kindGrid}>
                  {PHASE_KINDS.map((k) => (
                    <Pressable
                      key={k.key}
                      onPress={() => setPhase(i, { kind: k.key })}
                      style={[styles.kind, p.kind === k.key && styles.optOn]}
                    >
                      <Text style={[styles.kindName, p.kind === k.key && styles.optNameOn]}>{k.label}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.optDesc}>
                  {PHASE_KINDS.find((k) => k.key === p.kind)?.desc}
                </Text>

                {p.kind === 'swiss' && (
                  <Field
                    label="Rondas"
                    value={String(p.rounds ?? suggestedSwissRounds(Number(expected) || 8))}
                    onChangeText={(v) => setPhase(i, { rounds: Number(v) || null })}
                    keyboardType="number-pad"
                    hint={`Con ${expected || '?'} jugadores se recomiendan ${suggestedSwissRounds(Number(expected) || 8)}.`}
                  />
                )}

                {p.kind === 'blocks' && (
                  <Field
                    label="¿En cuántos grupos?"
                    value={String(p.block_count ?? 2)}
                    onChangeText={(v) => setPhase(i, { block_count: Number(v) || 2 })}
                    keyboardType="number-pad"
                  />
                )}

                {i > 0 && (
                  <Field
                    label="¿Cuántos pasan a esta fase?"
                    value={String(p.cut_size ?? 4)}
                    onChangeText={(v) => setPhase(i, { cut_size: Number(v) || null })}
                    keyboardType="number-pad"
                    hint="El corte sale de la tabla de la fase anterior."
                  />
                )}
              </Card>
            ))}

            <Button label="＋  AGREGAR OTRA FASE" variant="ghost" onPress={addPhase} />

            {usesSwiss && (
              <>
                <SectionTitle>Desempate del suizo</SectionTitle>
                {([
                  { v: 'dml' as const, label: 'Reglamento DML', desc: 'Diferencia de puntos, luego enfrentamiento directo.' },
                  { v: 'opponents' as const, label: 'Fuerza de rivales', desc: 'Pesa contra quién te tocó jugar. Es lo que usan los torneos grandes.' },
                ]).map((o) => (
                  <Pressable
                    key={o.v}
                    onPress={() => setTiebreak(o.v)}
                    style={[styles.opt, tiebreak === o.v && styles.optOn]}
                  >
                    <Text style={[styles.optName, tiebreak === o.v && styles.optNameOn]}>{o.label}</Text>
                    <Text style={styles.optDesc}>{o.desc}</Text>
                  </Pressable>
                ))}
              </>
            )}

            <Button label="SIGUIENTE" onPress={() => setStep(3)} disabled={phases.length === 0} />
          </View>
        )}

        {step === 3 && (
          <View style={{ gap: space.md }}>
            <SectionTitle>Meta de puntos por fase</SectionTitle>
            <Text style={styles.hint}>
              Lo normal es subirla conforme avanza: 4 en clasificatoria, 5 en semis, 7 en la final.
            </Text>

            {phases.map((p, i) => (
              <Card key={i} style={{ gap: space.sm }}>
                <Text style={styles.phaseTag}>
                  FASE {i + 1} · {PHASE_KINDS.find((k) => k.key === p.kind)?.label.toUpperCase()}
                </Text>
                <View style={styles.row}>
                  {[4, 5, 7, 10].map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => setPhase(i, { points_to_win: v })}
                      style={[styles.points, p.points_to_win === v && styles.optOn]}
                    >
                      <Text style={[styles.pointsText, p.points_to_win === v && styles.optNameOn]}>{v}</Text>
                    </Pressable>
                  ))}
                </View>
                {mode === 'ranking' && p.points_to_win !== 4 && (
                  <Text style={styles.warn}>
                    El reglamento dice que en ranking siempre se juega a 4 puntos.
                  </Text>
                )}
              </Card>
            ))}

            {/* Vista previa: lo que va a pasar, en una frase */}
            <Card style={styles.preview}>
              <Text style={styles.previewTag}>ASÍ VA A QUEDAR</Text>
              <Text style={styles.previewName}>{name || 'Sin nombre'}</Text>
              <Text style={styles.previewLine}>
                {COMBAT_MODES.find((m) => m.key === combatMode)?.label} ·{' '}
                {mode === 'casual' ? 'Casual' : 'Ranking'}
              </Text>
              {phases.map((p, i) => (
                <Text key={i} style={styles.previewLine}>
                  {i + 1}. {PHASE_KINDS.find((k) => k.key === p.kind)?.label}
                  {p.kind === 'swiss' ? ` · ${p.rounds ?? '?'} rondas` : ''}
                  {p.kind === 'blocks' ? ` · ${p.block_count ?? 2} grupos` : ''}
                  {i > 0 && p.cut_size ? ` · pasan ${p.cut_size}` : ''}
                  {` · a ${p.points_to_win} puntos`}
                </Text>
              ))}
            </Card>

            <Button label="CREAR TORNEO" onPress={create} loading={busy} disabled={busy} />
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xl, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  pad: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },

  steps: { flexDirection: 'row', paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.sm },
  stepItem: { flex: 1, alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.blue },
  stepLabel: { fontSize: 9.5, color: colors.inkDim, fontWeight: '700' },
  stepLabelOn: { color: colors.blueHi },

  coverWrap: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  coverBtn: { paddingVertical: space.md, alignItems: 'center', backgroundColor: colors.card },
  coverBtnText: { color: colors.blue, fontSize: 12.5, fontWeight: '700' },

  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  opt: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: 4,
  },
  optOn: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  optTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  optName: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  optNameOn: { color: colors.blueHi },
  optDesc: { fontSize: 11.5, color: colors.inkSoft, lineHeight: 16 },

  kindGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  kind: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 10,
  },
  kindName: { fontSize: 11.5, fontWeight: '700', color: colors.inkSoft },

  phaseTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.blue },
  remove: { fontSize: 11.5, color: colors.loss, fontWeight: '700' },

  whyCard: { gap: 3, borderColor: colors.lineHi },
  whyTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.streak },
  whyText: { fontSize: 12.5, color: colors.ink, lineHeight: 18 },

  points: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  pointsText: { fontSize: 16, fontWeight: '800', color: colors.inkSoft },
  warn: { fontSize: 11, color: colors.streak },

  preview: { gap: 4, borderColor: colors.blue },
  previewTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.blue },
  previewName: { ...type.display, fontSize: 18 },
  previewLine: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },

  hint: { fontSize: 11.5, color: colors.inkDim, lineHeight: 16 },
});
