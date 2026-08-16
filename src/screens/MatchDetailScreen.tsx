import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { loadDeckCard } from '../lib/decks';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import Avatar from '../ui/Avatar';
import { Card, Pill, SectionTitle } from '../ui/primitives';
import { Field } from '../ui/Field';
import { colors, space, type, radius } from '../theme';
import {
  finishesFor,
  finishLabel,
  finishPoints,
  NO_CONTACT_OUTCOMES,
  OutcomeCode,
  MatchMode,
} from '../lib/finishTypes';
import {
  loadPenaltyCodes,
  loadMatchPenalties,
  PenaltyCode,
  Penalty,
  Severity,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  SEVERITY_EFFECT,
} from '../lib/penalties';

type Match = {
  id: string;
  league_id: string | null;
  tournament_id: string | null;
  player_a_id: string;
  player_b_id: string;
  combo_a_id: string | null;
  combo_b_id: string | null;
  score_a: number;
  score_b: number;
  winner_id: string | null;
  status: 'pending' | 'reported' | 'confirmed' | 'disputed';
  reported_by: string | null;
  elo_a_change: number | null;
  elo_b_change: number | null;
  points_to_win: number;
  mode: MatchMode;
  penalty_points_a: number;
  penalty_points_b: number;
  arbitrated_by: string | null;
  arbitration_reason: string | null;
  countermark_by: string | null;
  countermark_winner_id: string | null;
  countermark_score_a: number | null;
  countermark_score_b: number | null;
  disputed_by: string | null;
  dispute_reason: string | null;
  player_a: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
  player_b: { display_name: string; avatar_key: string | null; avatar_url: string | null } | null;
};

type Round = { winner_id: string | null; finish_type: OutcomeCode };
type SavedRound = {
  id: string;
  round_number: number;
  winner_id: string | null;
  finish_type: string | null;
  points: number;
};

export default function MatchDetailScreen({ route, navigation }: any) {
  const { matchId } = route.params;
  const { playerId } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [savedRounds, setSavedRounds] = useState<SavedRound[]>([]);
  const [combos, setCombos] = useState<{ id: string; name: string }[]>([]);
  const [isOrganizer, setIsOrganizer] = useState(false);

  // Arbitraje
  const [canJudge, setCanJudge] = useState(false);
  const [penalties, setPenalties] = useState<Penalty[]>([]);
  const [codes, setCodes] = useState<PenaltyCode[]>([]);
  const [panel, setPanel] = useState<'none' | 'resolve' | 'penalty'>('none');
  const [ruledWinner, setRuledWinner] = useState<'a' | 'b' | null>(null);
  const [ruledA, setRuledA] = useState('');
  const [ruledB, setRuledB] = useState('');
  const [reason, setReason] = useState('');
  const [offender, setOffender] = useState<'a' | 'b' | null>(null);
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const [penaltyNote, setPenaltyNote] = useState('');

  // Doble marca: la versión del segundo jugador, registrada sin ver la del primero.
  const [markWinner, setMarkWinner] = useState<'a' | 'b' | null>(null);
  const [markA, setMarkA] = useState('');
  const [markB, setMarkB] = useState('');
  const [clash, setClash] = useState<{ winner_id: string; score_a: number; score_b: number } | null>(
    null
  );
  const [disputeNote, setDisputeNote] = useState('');

  const [rounds, setRounds] = useState<Round[]>([]);
  const [pickedWinner, setPickedWinner] = useState<'a' | 'b' | null>(null);
  const [pickedFinish, setPickedFinish] = useState<OutcomeCode | null>(null);
  const [pickedCombo, setPickedCombo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select(
        'id, league_id, tournament_id, player_a_id, player_b_id, combo_a_id, combo_b_id, score_a, score_b, winner_id, status, reported_by, elo_a_change, elo_b_change, points_to_win, mode, penalty_points_a, penalty_points_b, arbitrated_by, arbitration_reason, countermark_by, countermark_winner_id, countermark_score_a, countermark_score_b, disputed_by, dispute_reason, player_a:players!matches_player_a_id_fkey(display_name, avatar_key, avatar_url), player_b:players!matches_player_b_id_fkey(display_name, avatar_key, avatar_url)'
      )
      .eq('id', matchId)
      .single();
    if (error) {
      setLoading(false);
      alerta('Error', error.message);
      return;
    }
    setMatch(data as any);

    const [{ data: membership }, { data: roundRows }, { data: comboRows }] = await Promise.all([
      data.league_id
        ? supabase
            .from('league_members')
            .select('role')
            .eq('league_id', data.league_id)
            .eq('player_id', playerId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('match_rounds')
        .select('id, round_number, winner_id, finish_type, points')
        .eq('match_id', matchId)
        .order('round_number'),
      supabase.from('combos').select('id, name').eq('player_id', playerId).order('created_at'),
    ]);

    setIsOrganizer((membership as any)?.role === 'organizer');
    setSavedRounds((roundRows as any) ?? []);

    // Si el combate es de un torneo con deck registrado, solo se puede jugar
    // con las combinaciones de ESE deck: es la tarjeta que se bloqueó antes de
    // empezar. Sin deck registrado, valen todos los combos de siempre.
    let usable = ((comboRows as any) ?? []) as { id: string; name: string }[];
    if (data.tournament_id && playerId) {
      try {
        const deck = await loadDeckCard(data.tournament_id, playerId);
        if (deck && deck.combos.length > 0) {
          const allowedIds = new Set(deck.combos.map((c) => c.combo.id));
          usable = usable.filter((c) => allowedIds.has(c.id));
        }
      } catch {
        // La 0040 puede no haber corrido todavía: el reporte no se bloquea por
        // eso, simplemente no se filtra.
      }
    }
    setCombos(usable);

    // Quién puede arbitrar lo decide el servidor, no el cliente: es la misma
    // función que después rechaza la llamada si no le corresponde.
    const [{ data: allowed }, marks, catalog] = await Promise.all([
      supabase.rpc('can_arbitrate', { p_player_id: playerId, p_match_id: matchId }),
      loadMatchPenalties(matchId),
      loadPenaltyCodes(),
    ]);
    setCanJudge(allowed === true);
    setPenalties(marks);
    setCodes(catalog);

    setLoading(false);
  }, [matchId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isParticipant = match && (match.player_a_id === playerId || match.player_b_id === playerId);
  const isReporter = match && match.reported_by === playerId;

  // Mientras me toque marcar, NO puedo ver la versión de mi rival: ni el
  // marcador de arriba, ni los rounds que registró. Si la viera, esto dejaría
  // de ser una verificación independiente y volvería a ser ratificar.
  const mustMarkBlind =
    !!match && match.status === 'reported' && !!isParticipant && !isReporter && !match.countermark_by;

  // Las dos versiones coinciden: para el juez, el camino de aprobar de un toque.
  const marksAgree =
    !!match &&
    !!match.countermark_by &&
    match.countermark_winner_id === match.winner_id &&
    match.countermark_score_a === match.score_a &&
    match.countermark_score_b === match.score_b;

  // El marcador se calcula sumando el valor de cada finish, NO contando rounds.
  const tallyA = match
    ? rounds.filter((r) => r.winner_id === match.player_a_id).reduce((s, r) => s + finishPoints(r.finish_type), 0)
    : 0;
  const tallyB = match
    ? rounds.filter((r) => r.winner_id === match.player_b_id).reduce((s, r) => s + finishPoints(r.finish_type), 0)
    : 0;
  const target = match?.points_to_win ?? 4;

  // Cada jugador declara SU deck: el de A vive en combo_a_id y el de B en
  // combo_b_id. Si el mío ya está puesto, no vuelvo a preguntarlo.
  const soyA = match?.player_a_id === playerId;
  const miDeckYaPuesto = soyA ? !!match?.combo_a_id : !!match?.combo_b_id;
  const necesitoDeck = !miDeckYaPuesto && combos.length > 0;
  const decided = tallyA >= target || tallyB >= target;

  // 'void' (empate / lanzamiento nulo) no tiene ganador; los demás resultados sí.
  const needsWinner = pickedFinish !== 'void';

  function addRound() {
    if (!match || pickedFinish === null) return;
    if (needsWinner && pickedWinner === null) return;
    const winnerId = !needsWinner
      ? null
      : pickedWinner === 'a'
        ? match.player_a_id
        : match.player_b_id;
    setRounds([...rounds, { winner_id: winnerId, finish_type: pickedFinish }]);
    setPickedWinner(null);
    setPickedFinish(null);
  }

  async function submitReport() {
    if (!match || !decided) return;
    if (!pickedCombo) {
      alerta('Falta el deck', 'Di con qué jugaste: es lo que alimenta tus estadísticas.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('report_match_result', {
      p_match_id: match.id,
      p_rounds: rounds,
      p_combo_id: pickedCombo,
    });
    setBusy(false);
    if (error) return alerta('No se pudo registrar', error.message);
    setRounds([]);
    setPickedCombo(null);
    load();
  }

  // Ya no cierra el combate: deja constancia de que B se dio por convencido,
  // para que el juez lo apruebe de un toque. Todo resultado pasa por el juez.
  async function acceptReported() {
    if (necesitoDeck && !pickedCombo) {
      alerta('Falta el deck', 'Di con qué jugaste antes de aceptar el resultado.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('accept_reported_result', {
      p_match_id: matchId,
      p_combo_id: pickedCombo,
    });
    setBusy(false);
    if (error) return alerta('Error', error.message);
    setClash(null);
    alerta('Listo', 'Quedó registrado que están de acuerdo. Falta que un juez lo apruebe.');
    load();
  }

  // El juez toma el resultado tal cual. Para CAMBIARLO existe "fallar", que sí
  // exige dejar escrito el porqué.
  async function approve() {
    setBusy(true);
    const { error } = await supabase.rpc('approve_match_result', { p_match_id: matchId });
    setBusy(false);
    if (error) return alerta('No se pudo aprobar', error.message);
    alerta('Aprobado', 'El resultado quedó firme y el ELO ya se aplicó.');
    load();
  }

  // B registra su versión sin haber visto la de A. Si coinciden, el servidor
  // cierra el combate solo y el ELO ya viene aplicado al recargar.
  async function submitMark() {
    if (!match || markWinner === null) return;
    if (necesitoDeck && !pickedCombo) {
      alerta('Falta el deck', 'Di con qué jugaste: es lo que alimenta tus estadísticas.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('submit_countermark', {
      p_match_id: match.id,
      p_winner_id: markWinner === 'a' ? match.player_a_id : match.player_b_id,
      p_score_a: Number(markA) || 0,
      p_score_b: Number(markB) || 0,
      // El deck de quien marca. Sin esto, del segundo jugador nunca se
      // registraba con qué jugó y su estadística quedaba a medias.
      p_combo_id: pickedCombo,
    });
    setBusy(false);
    if (error) return alerta('No se pudo registrar', error.message);

    const r = data as any;
    if (r?.agreed) {
      alerta('Coinciden', 'Los dos marcaron lo mismo. El combate quedó cerrado.');
      setClash(null);
    } else {
      // Recién ahora se revela lo que puso el rival.
      setClash({
        winner_id: r.reported_winner_id,
        score_a: r.reported_score_a,
        score_b: r.reported_score_b,
      });
    }
    load();
  }

  async function dispute() {
    setBusy(true);
    const { error } = await supabase.rpc('dispute_match', {
      p_match_id: matchId,
      p_reason: disputeNote || null,
    });
    setBusy(false);
    if (error) return alerta('Error', error.message);
    setClash(null);
    setDisputeNote('');
    load();
  }

  async function reopen() {
    setBusy(true);
    const { error } = await supabase
      .from('matches')
      .update({ status: 'pending', score_a: 0, score_b: 0, winner_id: null, reported_by: null, reported_at: null })
      .eq('id', matchId);
    setBusy(false);
    if (error) return alerta('Error', error.message);
    load();
  }

  // El juez FALLA el resultado. No lo devuelve a los jugadores: el reglamento
  // dice que la decisión del juez es inapelable, así que el match queda cerrado.
  async function resolve() {
    if (!match || ruledWinner === null) return;
    setBusy(true);
    const { error } = await supabase.rpc('resolve_dispute', {
      p_match_id: match.id,
      p_winner_id: ruledWinner === 'a' ? match.player_a_id : match.player_b_id,
      p_score_a: Number(ruledA) || 0,
      p_score_b: Number(ruledB) || 0,
      p_reason: reason,
    });
    setBusy(false);
    if (error) return alerta('No se pudo resolver', error.message);
    setPanel('none');
    setReason('');
    alerta('Resuelto', 'El resultado quedó firme y el ELO ya se aplicó.');
    load();
  }

  async function sanction() {
    if (!match || offender === null || !pickedCode) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('register_penalty', {
      p_match_id: match.id,
      p_player_id: offender === 'a' ? match.player_a_id : match.player_b_id,
      p_code: pickedCode,
      p_notes: penaltyNote || null,
    });
    setBusy(false);
    if (error) return alerta('No se pudo registrar', error.message);

    const r = data as any;
    alerta(
      'Infracción registrada',
      r?.forfeited_match
        ? 'El infractor pierde el combate. El resultado quedó cerrado.'
        : r?.awarded_point
        ? 'Segunda del mismo tipo: 1 punto al rival.'
        : 'Queda como advertencia.'
    );
    setPanel('none');
    setPickedCode(null);
    setOffender(null);
    setPenaltyNote('');
    load();
  }

  function nameFor(id: string | null) {
    if (!match || !id) return '—';
    return id === match.player_a_id ? match.player_a?.display_name : match.player_b?.display_name;
  }

  if (loading || !match) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const finishes = finishesFor(match.mode);
  const liveA = match.status === 'pending' ? tallyA : match.score_a;
  const liveB = match.status === 'pending' ? tallyB : match.score_b;

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Pill
          label={match.mode === 'casual' ? 'Casual' : 'Ranking'}
          color={match.mode === 'casual' ? colors.streak : colors.blue}
        />
      </View>

      {/* Marcador */}
      <View style={styles.scoreboard}>
        <View style={styles.side}>
          <Avatar
            uri={match.player_a?.avatar_url}
            avatarKey={match.player_a?.avatar_key}
            size={58}
            ring={!mustMarkBlind && match.winner_id === match.player_a_id ? colors.win : colors.line}
          />
          <Text style={styles.sideName} numberOfLines={1}>
            {match.player_a?.display_name}
          </Text>
        </View>

        <View style={styles.scoreMid}>
          <View style={styles.scoreRow}>
            {mustMarkBlind ? (
              <>
                <Text style={styles.score}>?</Text>
                <Text style={styles.dash}>–</Text>
                <Text style={styles.score}>?</Text>
              </>
            ) : (
              <>
                <Text style={[styles.score, liveA > liveB && styles.scoreLead]}>{liveA}</Text>
                <Text style={styles.dash}>–</Text>
                <Text style={[styles.score, liveB > liveA && styles.scoreLead]}>{liveB}</Text>
              </>
            )}
          </View>
          <Text style={styles.target}>a {target} puntos</Text>
        </View>

        <View style={styles.side}>
          <Avatar
            uri={match.player_b?.avatar_url}
            avatarKey={match.player_b?.avatar_key}
            size={58}
            ring={!mustMarkBlind && match.winner_id === match.player_b_id ? colors.win : colors.line}
          />
          <Text style={styles.sideName} numberOfLines={1}>
            {match.player_b?.display_name}
          </Text>
        </View>
      </View>

      {/* Registro round a round */}
      {match.status === 'pending' && isParticipant && (
        <View style={styles.block}>
          <SectionTitle>Registrar la batalla</SectionTitle>
          <Text style={styles.hint}>
            Cada round vale distinto según cómo terminó. Gana quien acumule {target} puntos.
          </Text>

          {rounds.length > 0 && (
            <Card style={{ gap: 8 }}>
              {rounds.map((r, i) => (
                <View key={i} style={styles.roundLine}>
                  <Text style={styles.roundNum}>R{i + 1}</Text>
                  <Text style={styles.roundText} numberOfLines={1}>
                    {r.finish_type === 'void'
                      ? finishLabel(r.finish_type)
                      : `${nameFor(r.winner_id)} · ${finishLabel(r.finish_type)}`}
                  </Text>
                  <Text style={styles.roundPts}>+{finishPoints(r.finish_type)}</Text>
                </View>
              ))}
              <Pressable onPress={() => setRounds(rounds.slice(0, -1))} hitSlop={6}>
                <Text style={styles.undo}>Deshacer último round</Text>
              </Pressable>
            </Card>
          )}

          {!decided && (
            <>
              <Text style={type.label}>
                {needsWinner ? '¿Quién ganó el round?' : 'Empate: no hace falta ganador'}
              </Text>
              <View style={[styles.row, !needsWinner && { opacity: 0.4 }]}>
                {(['a', 'b'] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => needsWinner && setPickedWinner(s)}
                    disabled={!needsWinner}
                    style={[styles.choice, { flex: 1 }, pickedWinner === s && needsWinner && styles.choiceOn]}
                  >
                    <Text style={[styles.choiceText, pickedWinner === s && needsWinner && styles.choiceTextOn]} numberOfLines={1}>
                      {s === 'a' ? match.player_a?.display_name : match.player_b?.display_name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={type.label}>¿Cómo terminó?</Text>
              <View style={styles.finishGrid}>
                {finishes.map((f) => (
                  <Pressable
                    key={f.code}
                    onPress={() => setPickedFinish(f.code)}
                    style={[styles.finish, pickedFinish === f.code && styles.choiceOn]}
                  >
                    <View style={styles.finishTop}>
                      <Text style={[styles.finishName, pickedFinish === f.code && styles.choiceTextOn]}>
                        {f.label}
                      </Text>
                      <Text style={styles.finishPts}>{f.points} pt{f.points > 1 ? 's' : ''}</Text>
                    </View>
                    <Text style={styles.finishDesc} numberOfLines={2}>
                      {f.description}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Reglas de lanzamiento: cuando NO hubo contacto válido. */}
              <Text style={type.label}>Sin contacto válido</Text>
              <View style={styles.finishGrid}>
                {NO_CONTACT_OUTCOMES.map((f) => (
                  <Pressable
                    key={f.code}
                    onPress={() => setPickedFinish(f.code)}
                    style={[styles.finish, pickedFinish === f.code && styles.choiceOn]}
                  >
                    <View style={styles.finishTop}>
                      <Text style={[styles.finishName, pickedFinish === f.code && styles.choiceTextOn]}>
                        {f.label}
                      </Text>
                      <Text style={styles.finishPts}>{f.points > 0 ? `${f.points} pt` : 'repite'}</Text>
                    </View>
                    <Text style={styles.finishDesc} numberOfLines={2}>
                      {f.description}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Button
                label="AGREGAR ROUND"
                variant="ghost"
                onPress={addRound}
                disabled={pickedFinish === null || (needsWinner && pickedWinner === null)}
              />
            </>
          )}

          {/* PARA REPORTAR. El mismo selector vive abajo para quien marca o
              acepta: los dos declaran el suyo, cada uno en su columna. */}
          {/* Sin deck no hay estadística: el rendimiento por combo, las piezas
              más usadas y el historial del jugador se arman con este dato. Se
              podía enviar el resultado sin él y quedaba un combate huérfano
              para siempre — el marcador no se corrige después. */}
          {combos.length === 0 ? (
            <Card style={styles.sinDecks}>
              <Text style={styles.sinDecksTitle}>No tienes decks registrados</Text>
              <Text style={type.soft}>
                Hace falta decir con qué jugaste. Créalo ahora: se guarda para todos tus combates.
              </Text>
              <Button
                label="＋  CREAR MI DECK"
                variant="ghost"
                onPress={() => navigation.navigate('Combos')}
              />
            </Card>
          ) : (
            <>
              <Text style={type.label}>¿Con qué deck jugaste?</Text>
              <View style={styles.row}>
                {combos.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setPickedCombo(pickedCombo === c.id ? null : c.id)}
                    style={[styles.choice, pickedCombo === c.id && styles.choiceOn]}
                  >
                    <Text style={[styles.choiceText, pickedCombo === c.id && styles.choiceTextOn]}>{c.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Button
            label={
              !decided
                ? `FALTAN PUNTOS PARA LLEGAR A ${target}`
                : !pickedCombo
                ? 'ELIGE CON QUÉ DECK JUGASTE'
                : 'ENVIAR RESULTADO'
            }
            onPress={submitReport}
            disabled={!decided || !pickedCombo}
            loading={busy}
          />
        </View>
      )}

      {match.status === 'pending' && !isParticipant && (
        <Card style={styles.block}>
          <Text style={type.soft}>Esperando a que jueguen.</Text>
        </Card>
      )}

      {/* Doble marca: me toca registrar mi versión, sin ver la suya */}
      {mustMarkBlind && !clash && (
        <View style={styles.block}>
          <SectionTitle>Marca tu resultado</SectionTitle>
          <Card style={{ borderColor: colors.blue, gap: 4 }}>
            <Text style={styles.blindTag}>A CIEGAS</Text>
            <Text style={styles.hint}>
              Tu rival ya registró su versión, pero no la vas a ver hasta que marques la tuya. Si
              las dos coinciden, el combate se cierra solo y nadie tiene que arbitrar.
            </Text>
          </Card>

          <Text style={type.label}>¿Quién ganó?</Text>
          <View style={styles.row}>
            {(['a', 'b'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => setMarkWinner(s)}
                style={[styles.choice, { flex: 1 }, markWinner === s && styles.choiceOn]}
              >
                <Text
                  style={[styles.choiceText, markWinner === s && styles.choiceTextOn]}
                  numberOfLines={1}
                >
                  {s === 'a' ? match.player_a?.display_name : match.player_b?.display_name}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={type.label}>¿Cómo quedó el marcador?</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Field
                label={match.player_a?.display_name}
                value={markA}
                onChangeText={setMarkA}
                keyboardType="number-pad"
              />
            </View>
            <Text style={styles.dashSmall}>–</Text>
            <View style={{ flex: 1 }}>
              <Field
                label={match.player_b?.display_name}
                value={markB}
                onChangeText={setMarkB}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Quien marca declara SU deck igual que quien reporta: si no, la
              mitad de la estadística del combate se pierde. */}
          {necesitoDeck && (
            <>
              <Text style={type.label}>¿Con qué deck jugaste?</Text>
              <View style={styles.row}>
                {combos.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setPickedCombo(c.id)}
                    style={[styles.choice, pickedCombo === c.id && styles.choiceOn]}
                  >
                    <Text
                      style={[styles.choiceText, pickedCombo === c.id && styles.choiceTextOn]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Button
            label={necesitoDeck && !pickedCombo ? 'ELIGE CON QUÉ DECK JUGASTE' : 'ENVIAR MI MARCA'}
            onPress={submitMark}
            disabled={markWinner === null || (markA === '' && markB === '') || (necesitoDeck && !pickedCombo)}
            loading={busy}
          />
        </View>
      )}

      {/* Las dos marcas no coincidieron: recién aquí se revela la del rival */}
      {clash && match.status === 'reported' && (
        <View style={styles.block}>
          <SectionTitle>No coinciden</SectionTitle>
          <Card style={{ borderColor: colors.streak, gap: space.md }}>
            <View style={styles.versus}>
              <View style={styles.versusSide}>
                <Text style={styles.versusWho}>TU MARCA</Text>
                <Text style={styles.versusScore}>
                  {Number(markA) || 0}–{Number(markB) || 0}
                </Text>
                <Text style={styles.versusName} numberOfLines={1}>
                  ganó {markWinner === 'a' ? match.player_a?.display_name : match.player_b?.display_name}
                </Text>
              </View>
              <View style={styles.versusDiv} />
              <View style={styles.versusSide}>
                <Text style={styles.versusWho}>LA DE TU RIVAL</Text>
                <Text style={styles.versusScore}>
                  {clash.score_a}–{clash.score_b}
                </Text>
                <Text style={styles.versusName} numberOfLines={1}>
                  ganó {nameFor(clash.winner_id)}
                </Text>
              </View>
            </View>
            <Text style={styles.hint}>
              Puede ser solo una cuenta mal hecha. Si al verlo te suena bien, acéptalo y listo. Si
              de verdad no están de acuerdo, lo resuelve un juez.
            </Text>
          </Card>

          <Button label="ACEPTO SU RESULTADO" onPress={acceptReported} loading={busy} />

          <Field
            label="Si vas a disputar, ¿qué pasó?"
            placeholder="Ej. el tercer round fue burst, no over."
            value={disputeNote}
            onChangeText={setDisputeNote}
            multiline
            hint="Lo lee el juez antes de fallar."
          />
          <Button label="NO ESTOY DE ACUERDO" variant="danger" onPress={dispute} disabled={busy} />
        </View>
      )}

      {/* Ya marqué y quedó esperando, o soy quien reportó */}
      {match.status === 'reported' && !mustMarkBlind && !clash && (
        <View style={styles.block}>
          <Card style={{ gap: 6 }}>
            <Text style={styles.reported}>
              Reportado: ganó {nameFor(match.winner_id)} por {match.score_a}–{match.score_b}
            </Text>
            {match.countermark_by ? (
              marksAgree ? (
                <Text style={[styles.hint, { color: colors.win }]}>
                  Los dos marcaron lo mismo.
                </Text>
              ) : (
                <Text style={styles.hint}>
                  {nameFor(match.countermark_by)} marcó {match.countermark_score_a}–
                  {match.countermark_score_b}, ganó {nameFor(match.countermark_winner_id)}.
                </Text>
              )
            ) : null}
          </Card>

          {isParticipant && isReporter && !match.countermark_by && (
            <Text style={styles.hint}>Esperando que tu rival marque su resultado.</Text>
          )}

          {/* Ningún resultado queda firme sin juez, coincidan o no. */}
          {!canJudge && match.countermark_by && (
            <Card style={{ borderColor: colors.elite }}>
              <Text style={styles.judgeTag}>ESPERANDO AL JUEZ</Text>
              <Text style={styles.hint}>
                El resultado no cuenta para el ELO hasta que un juez lo apruebe.
              </Text>
            </Card>
          )}
        </View>
      )}

      {match.status === 'disputed' && (
        <View style={styles.block}>
          <Card style={{ borderColor: colors.loss, gap: space.md }}>
            <Text style={styles.disputed}>Resultado en disputa</Text>

            {/* El juez llega viendo QUÉ marcó cada uno, no solo que hay pleito. */}
            {match.countermark_by && (
              <View style={styles.versus}>
                <View style={styles.versusSide}>
                  <Text style={styles.versusWho} numberOfLines={1}>
                    {nameFor(match.reported_by)?.toUpperCase()}
                  </Text>
                  <Text style={styles.versusScore}>
                    {match.score_a}–{match.score_b}
                  </Text>
                  <Text style={styles.versusName} numberOfLines={1}>
                    ganó {nameFor(match.winner_id)}
                  </Text>
                </View>
                <View style={styles.versusDiv} />
                <View style={styles.versusSide}>
                  <Text style={styles.versusWho} numberOfLines={1}>
                    {nameFor(match.countermark_by)?.toUpperCase()}
                  </Text>
                  <Text style={styles.versusScore}>
                    {match.countermark_score_a}–{match.countermark_score_b}
                  </Text>
                  <Text style={styles.versusName} numberOfLines={1}>
                    ganó {nameFor(match.countermark_winner_id)}
                  </Text>
                </View>
              </View>
            )}

            {match.dispute_reason ? (
              <View>
                <Text style={type.label}>Lo que dijo {nameFor(match.disputed_by)}</Text>
                <Text style={styles.judgeReason}>{match.dispute_reason}</Text>
              </View>
            ) : null}

            <Text style={styles.hint}>
              {canJudge
                ? 'Te toca decidir. Tu fallo cierra el combate y no vuelve a los jugadores.'
                : 'Un juez tiene que resolverlo. Le llega el aviso en su bandeja.'}
            </Text>
          </Card>
        </View>
      )}

      {/* Panel del juez */}
      {canJudge && (match.status === 'reported' || match.status === 'disputed') && (
        <View style={styles.block}>
          <SectionTitle>Panel del juez</SectionTitle>

          {panel === 'none' && (
            <>
              {/* El camino rápido. Si los dos jugadores marcaron lo mismo, el
                  juez no tiene nada que decidir: solo dar fe. */}
              <Card style={{ borderColor: marksAgree ? colors.win : colors.line, gap: 4 }}>
                <Text style={[styles.judgeTag, marksAgree && { color: colors.win }]}>
                  {marksAgree
                    ? 'LOS DOS MARCARON LO MISMO'
                    : match.countermark_by
                    ? 'LAS MARCAS NO COINCIDEN'
                    : 'FALTA LA MARCA DEL SEGUNDO JUGADOR'}
                </Text>
                <Text style={styles.hint}>
                  Aprobar toma el resultado tal cual: ganó {nameFor(match.winner_id)} por{' '}
                  {match.score_a}–{match.score_b}.
                </Text>
              </Card>

              <Button label="APROBAR TAL CUAL" onPress={approve} loading={busy} />

              <Button
                label="FALLAR OTRO RESULTADO"
                variant="ghost"
                onPress={() => {
                  setRuledA(String(match.score_a));
                  setRuledB(String(match.score_b));
                  setRuledWinner(match.winner_id === match.player_b_id ? 'b' : 'a');
                  setPanel('resolve');
                }}
              />
              <Button label="REGISTRAR INFRACCIÓN" variant="ghost" onPress={() => setPanel('penalty')} />
              {isOrganizer && (
                <Pressable onPress={reopen} hitSlop={6}>
                  <Text style={styles.secondary}>o reabrir para que lo reporten de nuevo</Text>
                </Pressable>
              )}
            </>
          )}

          {panel === 'resolve' && (
            <Card style={{ gap: space.md }}>
              <Text style={type.label}>¿Quién ganó?</Text>
              <View style={styles.row}>
                {(['a', 'b'] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setRuledWinner(s)}
                    style={[styles.choice, { flex: 1 }, ruledWinner === s && styles.choiceOn]}
                  >
                    <Text
                      style={[styles.choiceText, ruledWinner === s && styles.choiceTextOn]}
                      numberOfLines={1}
                    >
                      {s === 'a' ? match.player_a?.display_name : match.player_b?.display_name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={type.label}>Marcador oficial</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Field value={ruledA} onChangeText={setRuledA} keyboardType="number-pad" />
                </View>
                <Text style={styles.dashSmall}>–</Text>
                <View style={{ flex: 1 }}>
                  <Field value={ruledB} onChangeText={setRuledB} keyboardType="number-pad" />
                </View>
              </View>

              <Field
                label="¿Por qué se resuelve así?"
                placeholder="Ej. El burst ocurrió antes que el over, se revisó la repetición."
                value={reason}
                onChangeText={setReason}
                multiline
                hint="Queda escrito en el historial del combate."
              />

              <Button
                label="FALLAR A FAVOR"
                onPress={resolve}
                disabled={ruledWinner === null || reason.trim().length < 3}
                loading={busy}
              />
              <Button label="Cancelar" variant="ghost" onPress={() => setPanel('none')} />
            </Card>
          )}

          {panel === 'penalty' && (
            <Card style={{ gap: space.md }}>
              <Text style={type.label}>¿A quién se sanciona?</Text>
              <View style={styles.row}>
                {(['a', 'b'] as const).map((s) => (
                  <Pressable
                    key={s}
                    onPress={() => setOffender(s)}
                    style={[styles.choice, { flex: 1 }, offender === s && styles.choiceOn]}
                  >
                    <Text style={[styles.choiceText, offender === s && styles.choiceTextOn]} numberOfLines={1}>
                      {s === 'a' ? match.player_a?.display_name : match.player_b?.display_name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={type.label}>Infracción</Text>
              {codes.map((c) => (
                <Pressable
                  key={c.code}
                  onPress={() => setPickedCode(c.code)}
                  style={[
                    styles.infraction,
                    pickedCode === c.code && { borderColor: SEVERITY_COLOR[c.severity] },
                  ]}
                >
                  <View style={styles.infractionTop}>
                    <Text style={styles.infractionName}>{c.label}</Text>
                    <Pill label={SEVERITY_LABEL[c.severity]} color={SEVERITY_COLOR[c.severity]} />
                  </View>
                  <Text style={styles.infractionDesc}>{c.description}</Text>
                  {pickedCode === c.code && (
                    <Text style={[styles.effect, { color: SEVERITY_COLOR[c.severity] }]}>
                      {SEVERITY_EFFECT[c.severity]}
                    </Text>
                  )}
                </Pressable>
              ))}

              <Field
                label="Nota (opcional)"
                placeholder="Lo que viste"
                value={penaltyNote}
                onChangeText={setPenaltyNote}
              />

              <Button
                label="REGISTRAR INFRACCIÓN"
                variant="danger"
                onPress={sanction}
                disabled={offender === null || !pickedCode}
                loading={busy}
              />
              <Button label="Cancelar" variant="ghost" onPress={() => setPanel('none')} />
            </Card>
          )}
        </View>
      )}

      {/* Fallo del juez, ya cerrado */}
      {match.arbitration_reason && (
        <View style={styles.block}>
          <Card style={{ borderColor: colors.elite, gap: 4 }}>
            <Text style={styles.judgeTag}>RESUELTO POR UN JUEZ</Text>
            <Text style={styles.judgeReason}>{match.arbitration_reason}</Text>
          </Card>
        </View>
      )}

      {/* Sanciones del combate */}
      {penalties.length > 0 && (
        <View style={styles.block}>
          <SectionTitle>Infracciones</SectionTitle>
          {penalties.map((p) => (
            <Card key={p.id} style={styles.penaltyRow}>
              <View style={[styles.severityBar, { backgroundColor: SEVERITY_COLOR[p.severity as Severity] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.penaltyName}>{p.penalty_codes?.label ?? p.code}</Text>
                <Text style={styles.hint}>
                  {nameFor(p.player_id)}
                  {p.awarded_point ? ' · 1 punto al rival' : ''}
                  {p.forfeited_match ? ' · pierde el combate' : ''}
                </Text>
                {p.notes ? <Text style={styles.penaltyNote}>{p.notes}</Text> : null}
              </View>
              <Pill label={SEVERITY_LABEL[p.severity as Severity]} color={SEVERITY_COLOR[p.severity as Severity]} />
            </Card>
          ))}
        </View>
      )}

      {match.status === 'confirmed' && (
        <View style={styles.block}>
          <Card style={styles.eloCard}>
            <EloDelta name={match.player_a?.display_name} delta={match.elo_a_change} />
            <View style={styles.eloDiv} />
            <EloDelta name={match.player_b?.display_name} delta={match.elo_b_change} />
          </Card>
        </View>
      )}

      {/* Rounds guardados. Ocultos mientras me toque marcar a ciegas: son la
          versión completa de mi rival, round por round. */}
      {savedRounds.length > 0 && !mustMarkBlind && (
        <View style={styles.block}>
          <SectionTitle>Rounds</SectionTitle>
          <Card style={{ gap: 8 }}>
            {savedRounds.map((r) => (
              <View key={r.id} style={styles.roundLine}>
                <Text style={styles.roundNum}>R{r.round_number}</Text>
                <Text style={styles.roundText} numberOfLines={1}>
                  {nameFor(r.winner_id)} · {finishLabel(r.finish_type)}
                </Text>
                <Text style={styles.roundPts}>+{r.points}</Text>
              </View>
            ))}
          </Card>
        </View>
      )}
    </Screen>
  );
}

function EloDelta({ name, delta }: { name?: string; delta: number | null }) {
  const up = (delta ?? 0) >= 0;
  return (
    <View style={styles.eloSide}>
      <Text style={styles.eloName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[styles.eloVal, { color: up ? colors.win : colors.loss }]}>
        {up ? '+' : ''}
        {delta}
      </Text>
      <Text style={styles.eloLabel}>ELO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sinDecks: { gap: space.md },
  sinDecksTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },

  scoreboard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: space.xl,
  },
  side: { alignItems: 'center', gap: 8, width: 92 },
  sideName: { fontSize: 12.5, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  scoreMid: { alignItems: 'center', paddingTop: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  score: { fontSize: 40, fontWeight: '800', fontStyle: 'italic', color: colors.inkDim, letterSpacing: -1 },
  scoreLead: { color: colors.ink },
  dash: { fontSize: 24, color: colors.inkDim },
  target: { fontSize: 10.5, color: colors.inkDim, marginTop: 2, letterSpacing: 0.4 },

  block: { gap: space.md, marginBottom: space.xl },
  hint: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 17 },
  row: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },

  choice: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: 11,
    paddingHorizontal: space.md,
    alignItems: 'center',
  },
  choiceOn: { borderColor: colors.blue, backgroundColor: colors.blueDeep },
  choiceText: { fontSize: 13, fontWeight: '600', color: colors.inkSoft },
  choiceTextOn: { color: colors.ink },

  finishGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  finish: {
    flexGrow: 1,
    minWidth: 150,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    padding: space.md,
    gap: 3,
  },
  finishTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  finishName: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  finishPts: { fontSize: 11, fontWeight: '800', color: colors.blue },
  finishDesc: { fontSize: 11, color: colors.inkSoft, lineHeight: 15 },

  roundLine: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  roundNum: { fontSize: 11, fontWeight: '800', color: colors.inkDim, width: 24 },
  roundText: { flex: 1, fontSize: 13, color: colors.ink },
  roundPts: { fontSize: 12, fontWeight: '800', color: colors.blue },
  undo: { fontSize: 12, color: colors.loss, fontWeight: '600', marginTop: 2 },

  reported: { fontSize: 14, color: colors.ink, fontWeight: '600' },
  disputed: { fontSize: 15, fontWeight: '800', color: colors.loss, marginBottom: 4 },

  blindTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.blue },
  versus: { flexDirection: 'row', alignItems: 'center' },
  versusSide: { flex: 1, alignItems: 'center', gap: 3 },
  versusDiv: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line, marginHorizontal: space.sm },
  versusWho: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  versusScore: { fontSize: 26, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.5 },
  versusName: { fontSize: 11, color: colors.inkSoft },

  secondary: { fontSize: 12, color: colors.inkDim, textAlign: 'center', paddingVertical: space.sm },
  dashSmall: { fontSize: 20, color: colors.inkDim, alignSelf: 'center' },
  infraction: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space.md,
    gap: 5,
  },
  infractionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  infractionName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.ink },
  infractionDesc: { fontSize: 11.5, color: colors.inkSoft, lineHeight: 16 },
  effect: { fontSize: 11.5, fontWeight: '700', marginTop: 2 },

  judgeTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.elite },
  judgeReason: { fontSize: 13, color: colors.ink, lineHeight: 18 },

  penaltyRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  severityBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  penaltyName: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  penaltyNote: { fontSize: 11.5, color: colors.inkDim, marginTop: 3, fontStyle: 'italic' },

  eloCard: { flexDirection: 'row', alignItems: 'center' },
  eloSide: { flex: 1, alignItems: 'center', gap: 2 },
  eloDiv: { width: 1, height: 40, backgroundColor: colors.line },
  eloName: { fontSize: 12, color: colors.inkSoft },
  eloVal: { fontSize: 22, fontWeight: '800' },
  eloLabel: { fontSize: 9, color: colors.inkDim, letterSpacing: 1 },
});
