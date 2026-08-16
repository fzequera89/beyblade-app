import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import Avatar from '../ui/Avatar';
import { Card, Hex, Meter, Pill, SectionTitle, Tabs } from '../ui/primitives';
import Cover, { coverAccent } from '../ui/Cover';
import { CountdownBox, ClosingBar, InfoRow, StatStrip, TournamentName } from '../ui/tournament';
import { pickCoverPhoto, uploadCover } from '../lib/cover';
import { COMBAT_MODES, PHASE_KINDS, Standing } from '../lib/formats';
import {
  Phase,
  CategoryGroup,
  loadPhases,
  generatePhaseRound,
  phaseStandings,
  loadCategoryGroups,
} from '../lib/formatsRepo';
import { categoryLabel, categoryColor } from '../lib/categories';
import { DeckCard, deckSizeFor, usesDeckCard, loadDeckCard, deckCountFor } from '../lib/decks';
import { recordInspection } from '../lib/wear';
import {
  ThemeVote,
  loadThemeVote,
  suggestTheme,
  approveTheme,
  voteTheme,
  openThemeVote,
} from '../lib/themes';
import { fmtDate, fmtDateFull, fmtDateTime } from '../lib/when';
import { IconChevron } from '../ui/icons';
import { colors, space, type, radius, glow } from '../theme';

// Detalle de torneo.
//
// Cuatro caras del mismo torneo, no cuatro pantallas: RESUMEN (qué me toca
// hacer), JUGADORES (quién viene), BRACKET (cómo va) e INFORMACIÓN (la ficha).
// En una sola lista larga, lo que un jugador necesita el día del torneo —el
// botón de check-in y su siguiente combate— quedaba debajo de la lista completa
// de inscritos.

type Tab = 'resumen' | 'jugadores' | 'bracket' | 'info';

type PlayerLite = {
  display_name: string;
  avatar_key: string | null;
  avatar_url: string | null;
};

type Registration = {
  player_id: string;
  checked_in_at: string | null;
  players: (PlayerLite & { elo_rating: number }) | null;
};

type MatchRow = {
  id: string;
  phase_id: string | null;
  bracket_round: number;
  bracket_side: 'winners' | 'losers' | 'final' | null;
  block_number: number | null;
  status: 'pending' | 'reported' | 'confirmed' | 'disputed';
  winner_id: string | null;
  score_a: number;
  score_b: number;
  player_a_id: string;
  player_b_id: string;
  player_a: PlayerLite | null;
  player_b: PlayerLite | null;
};

type Bye = { phase_id: string | null; bracket_round: number; player_id: string };

type Tournament = {
  id: string;
  name: string;
  status: string;
  mode: string | null;
  season_id: string | null;
  league_id: string | null;
  photo_url: string | null;
  combat_mode: string | null;
  deck_order: string | null;
  swiss_tiebreak: string | null;
  created_at: string | null;
  starts_at: string | null;
  registration_closes_at: string | null;
  capacity: number | null;
  level: string | null;
  prize: string | null;
  venues: { name: string; city: string | null; address: string | null } | null;
};

function combatLabel(mode?: string | null): string {
  return COMBAT_MODES.find((m) => m.key === mode)?.label ?? '1 vs 1';
}

// Cómo se juega y con cuántas peonzas, sin decir dos veces lo mismo.
function formatLine(t: Tournament): string {
  const deck = COMBAT_MODES.find((m) => m.key === t.combat_mode)?.deckSize ?? 1;
  const rules = t.combat_mode === 'stock' ? 'Stock de caja' : 'Estándar';
  return `${rules} · ${deck} pieza${deck === 1 ? '' : 's'}`;
}

function phaseLabel(kind: string): string {
  return PHASE_KINDS.find((k) => k.key === kind)?.label ?? kind;
}

// El nombre de la ronda sale de cuántos combates tiene, no de su número: es lo
// que el jugador entiende. Solo aplica en eliminación — en un suizo la ronda 3
// se llama ronda 3.
function roundTitle(kind: string, matchCount: number, round: number, side?: string | null): string {
  if (side === 'final') return 'GRAN FINAL';
  if (kind === 'single_elim' || kind === 'double_elim') {
    if (matchCount === 1) return side === 'losers' ? 'FINAL DE PERDEDORES' : 'FINAL';
    if (matchCount === 2) return 'SEMIFINAL';
    if (matchCount <= 4) return 'CUARTOS DE FINAL';
    if (matchCount <= 8) return 'OCTAVOS DE FINAL';
  }
  return `RONDA ${round}`;
}

const SIDE_LABEL: Record<string, string> = {
  winners: 'LLAVE DE GANADORES',
  losers: 'LLAVE DE PERDEDORES',
  final: 'GRAN FINAL',
};

const MEDAL: Record<number, string> = { 1: '#F5A524', 2: '#C3CDDD', 3: '#C77B45' };

export default function TournamentDetailScreen({ route, navigation }: any) {
  const {
    tournamentId,
    leagueId: leagueIdParam,
    isOrganizer: isOrganizerParam,
    initialTab,
  } = route.params;
  const { playerId } = useAuth();

  // El rol y la liga se DERIVAN del torneo, no llegan por parámetro. Entrando
  // desde Inicio no viajaban, y el mismo torneo se veía como jugador aunque
  // fueras el organizador — y una ronda generada así habría creado combates
  // sin liga. El parámetro se conserva solo como valor inicial, para que la
  // pantalla no parpadee mientras se consulta.
  const [isOrganizer, setIsOrganizer] = useState(!!isOrganizerParam);

  const [tab, setTab] = useState<Tab>(initialTab ?? 'resumen');
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [byes, setByes] = useState<Bye[]>([]);
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const [groups, setGroups] = useState<CategoryGroup[] | null>(null);
  const [myDeck, setMyDeck] = useState<DeckCard | null>(null);
  const [decks, setDecks] = useState<{ total: number; locked: number }>({ total: 0, locked: 0 });
  const [showQr, setShowQr] = useState(false);
  const [checkinCode, setCheckinCode] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeVote | null>(null);
  const [nuevaTematica, setNuevaTematica] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: t }, { data: regs }, { data: matchRows }, { data: byeRows }] = await Promise.all([
      supabase
        .from('tournaments')
        .select(
          'id, name, status, mode, season_id, league_id, photo_url, combat_mode, deck_order, swiss_tiebreak, created_at, starts_at, registration_closes_at, capacity, level, prize, venues(name, city, address)'
        )
        .eq('id', tournamentId)
        .single(),
      supabase
        .from('tournament_registrations')
        .select('player_id, checked_in_at, players(display_name, elo_rating, avatar_key, avatar_url)')
        .eq('tournament_id', tournamentId),
      supabase
        .from('matches')
        .select(
          'id, phase_id, bracket_round, bracket_side, block_number, status, winner_id, score_a, score_b, player_a_id, player_b_id, player_a:players!matches_player_a_id_fkey(display_name, avatar_key, avatar_url), player_b:players!matches_player_b_id_fkey(display_name, avatar_key, avatar_url)'
        )
        .eq('tournament_id', tournamentId)
        .order('bracket_round', { ascending: true }),
      supabase
        .from('bracket_byes')
        .select('phase_id, bracket_round, player_id')
        .eq('tournament_id', tournamentId),
    ]);

    const row = t as any;

    // La liga sale del torneo; el rol, de la membresía en ESA liga (o de ser
    // administrador). Es la misma respuesta sin importar por dónde entraste.
    if (row?.league_id && playerId) {
      const [{ data: membresia }, { data: yo }] = await Promise.all([
        supabase
          .from('league_members')
          .select('role')
          .eq('league_id', row.league_id)
          .eq('player_id', playerId)
          .maybeSingle(),
        supabase.from('players').select('is_admin').eq('id', playerId).maybeSingle(),
      ]);
      setIsOrganizer((membresia as any)?.role === 'organizer' || (yo as any)?.is_admin === true);
    }

    // El código del QR solo lo devuelve la base a la organización: para un
    // jugador esta consulta viene vacía, y ahí está la gracia — si lo pudiera
    // leer, no haría falta escanear nada.
    const { data: codigo } = await supabase
      .from('tournament_checkin_codes')
      .select('code')
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    setCheckinCode((codigo as any)?.code ?? null);

    setTournament(
      row
        ? { ...row, venues: Array.isArray(row.venues) ? row.venues[0] ?? null : row.venues ?? null }
        : null
    );

    // Por ELO: es el orden con el que se siembra el bracket de ranking, y en
    // casual sigue siendo la forma más útil de leer la lista.
    setRegistrations(
      ((regs as any as Registration[]) ?? []).sort(
        (a, b) => (b.players?.elo_rating ?? 0) - (a.players?.elo_rating ?? 0)
      )
    );
    setMatches((matchRows as any) ?? []);
    setByes((byeRows as any) ?? []);

    // El deck solo existe en las modalidades que lo piden; en 1 vs 1 ni se
    // consulta.
    if (usesDeckCard((row as any)?.combat_mode, (row as any)?.mode) && playerId) {
      try {
        const [card, counts] = await Promise.all([
          loadDeckCard(tournamentId, playerId),
          deckCountFor(tournamentId),
        ]);
        setMyDeck(card);
        setDecks(counts);
      } catch {
        // Si la 0040 todavía no corrió, la pantalla sigue sirviendo para todo
        // lo demás: el deck es una sección, no la pantalla.
        setMyDeck(null);
      }
    }

    // La temática es de la modalidad casual, según el reglamento. En ranking no
    // se pregunta siquiera.
    if ((row as any)?.mode === 'casual' && playerId) {
      try {
        setTheme(await loadThemeVote(tournamentId, playerId));
      } catch {
        setTheme(null);
      }
    }

    try {
      const list = await loadPhases(tournamentId);
      setPhases(list);
      setPhaseId((current) => {
        if (current && list.some((p) => p.id === current)) return current;
        // La fase que se está jugando; si ninguna, la primera sin terminar.
        const live = list.find((p) => p.status === 'in_progress');
        const next = list.find((p) => p.status !== 'completed');
        return (live ?? next ?? list[list.length - 1])?.id ?? null;
      });
    } catch (e: any) {
      alerta('No se pudieron cargar las fases', e.message ?? String(e));
    }

    setLoading(false);
  }, [tournamentId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const phase = phases.find((p) => p.id === phaseId) ?? null;

  // La tabla la calcula el motor de formatos, no la pantalla: es la MISMA
  // función que decide el corte hacia la fase siguiente. Dos cálculos distintos
  // para lo mismo terminan mostrando una tabla que no corresponde a quién pasó.
  useEffect(() => {
    let alive = true;
    if (!phase || phases.length === 0 || phase.kind === 'single_elim' || phase.kind === 'double_elim') {
      setStandings(null);
      return;
    }
    setStandings(null);
    phaseStandings(phase, phases)
      .then((s) => {
        if (alive) setStandings(s);
      })
      .catch(() => {
        if (alive) setStandings([]);
      });
    return () => {
      alive = false;
    };
  }, [phase, phases]);

  // En una fase por categoría la tabla NO es una: es una por rango. Mezclarlas
  // en un solo listado diría que un Porcelana va arriba de un Oro, cuando ni
  // siquiera jugaron entre ellos.
  useEffect(() => {
    let alive = true;
    if (phase?.kind !== 'category_rr') {
      setGroups(null);
      return;
    }
    loadCategoryGroups(tournamentId)
      .then((g) => {
        if (alive) setGroups(g);
      })
      .catch(() => {
        if (alive) setGroups([]);
      });
    return () => {
      alive = false;
    };
  }, [phase, tournamentId, registrations.length]);

  const nameOf = useMemo(() => {
    const map = new Map<string, PlayerLite>();
    for (const r of registrations) if (r.players) map.set(r.player_id, r.players);
    return map;
  }, [registrations]);

  const mine = registrations.find((r) => r.player_id === playerId) ?? null;
  const checkedIn = registrations.filter((r) => r.checked_in_at).length;
  const myPosition = registrations.findIndex((r) => r.player_id === playerId) + 1;
  const full = !!tournament?.capacity && registrations.length >= tournament.capacity;
  const closed =
    !!tournament?.registration_closes_at && new Date(tournament.registration_closes_at) < new Date();
  const accent = coverAccent(tournamentId);

  // El campeón: el ganador del combate de ronda más alta, con la gran final por
  // encima del número de ronda (en eliminación doble abajo se juegan más rondas
  // que arriba, así que la última no es la que decide).
  const champion = useMemo(() => {
    if (tournament?.status !== 'completed') return null;
    const confirmed = matches.filter((m) => m.status === 'confirmed' && m.winner_id);
    if (confirmed.length === 0) return null;
    const weight = (m: MatchRow) => (m.bracket_side === 'final' ? 1 : 0);
    const best = confirmed.reduce((acc, m) => {
      if (weight(m) !== weight(acc)) return weight(m) > weight(acc) ? m : acc;
      return m.bracket_round > acc.bracket_round ? m : acc;
    });
    return best.winner_id === best.player_a_id ? best.player_a : best.player_b;
  }, [matches, tournament?.status]);

  const myNextMatch = useMemo(
    () =>
      matches.find(
        (m) => (m.player_a_id === playerId || m.player_b_id === playerId) && m.status !== 'confirmed'
      ) ?? null,
    [matches, playerId]
  );

  async function changePhoto() {
    const uri = await pickCoverPhoto();
    if (!uri) return;
    setUploading(true);
    const url = await uploadCover('tournament', tournamentId, uri);
    if (url) {
      const { error } = await supabase.from('tournaments').update({ photo_url: url }).eq('id', tournamentId);
      if (error) alerta('No se pudo guardar', error.message);
    }
    setUploading(false);
    load();
  }

  // Por RPC y no por insert directo: el cupo se hace valer en el servidor, con
  // la fila del torneo bloqueada. Contando desde la app, dos personas que tocan
  // "Inscribirme" a la vez con un solo lugar libre entrarían las dos.
  async function register() {
    const { error } = await supabase.rpc('register_for_tournament', { p_tournament_id: tournamentId });
    if (error) return alerta('No te pudimos inscribir', error.message);
    load();
  }

  async function toggleCheckIn(target: string, current: boolean) {
    const { error } = await supabase
      .from('tournament_registrations')
      .update({ checked_in_at: current ? null : new Date().toISOString() })
      .eq('tournament_id', tournamentId)
      .eq('player_id', target);
    if (error) return alerta('Error', error.message);
    load();
  }

  // El torneo inicial (G3) del reglamento: su resultado fija la posición de
  // arranque de cada quien DENTRO de su categoría. No cambia de categoría a
  // nadie — para eso está el reto de ascenso.
  async function seedSeason() {
    if (!tournament?.season_id) return;
    alerta(
      'Fijar posiciones de la temporada',
      'El orden de llegada de este torneo pasa a ser la posición inicial de cada jugador dentro de su categoría. Se puede volver a correr si el torneo se corrige.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Fijar posiciones',
          onPress: async () => {
            setBusy(true);
            const { data, error } = await supabase.rpc('seed_season_from_tournament', {
              p_season_id: tournament.season_id,
              p_tournament_id: tournamentId,
            });
            setBusy(false);
            if (error) return alerta('No se pudo sembrar', error.message);
            alerta('Escalafón sembrado', `${data ?? 0} jugador(es) quedaron colocados.`);
          },
        },
      ]
    );
  }

  // La revisión del deck en la mesa: el juez desarma, compara contra la guía de
  // desgaste y deja constancia. Aprobar congela la tarjeta; rechazar la deja
  // editable para que el jugador corrija y vuelva.
  function inspect(target: string, name: string) {
    alerta(
      `Revisión de deck · ${name}`,
      'Compara las piezas contra la guía de desgaste. Al aprobar, su deck queda congelado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Rechazar',
          style: 'destructive',
          onPress: async () => {
            try {
              await recordInspection(tournamentId, target, false, 'Rechazado en revisión de desgaste');
              load();
            } catch (e: any) {
              alerta('No se pudo', e.message ?? String(e));
            }
          },
        },
        {
          text: 'Aprobar',
          onPress: async () => {
            try {
              await recordInspection(tournamentId, target, true);
              load();
            } catch (e: any) {
              alerta('No se pudo', e.message ?? String(e));
            }
          },
        },
      ]
    );
  }

  async function conTematica(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      load();
    } catch (e: any) {
      alerta('No se pudo', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function lockDecks() {
    alerta(
      'Bloquear los decks',
      'Después de esto nadie puede cambiar su deck en este torneo. Hazlo al cerrar el registro.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          onPress: async () => {
            setBusy(true);
            const { data, error } = await supabase.rpc('lock_tournament_decks', {
              p_tournament_id: tournamentId,
            });
            setBusy(false);
            if (error) return alerta('No se pudo', error.message);
            alerta('Decks bloqueados', `${data ?? 0} tarjeta(s) quedaron congeladas.`);
            load();
          },
        },
      ]
    );
  }

  async function advance() {
    if (!phase) return;
    setBusy(true);
    try {
      const liga = tournament?.league_id ?? leagueIdParam;
      if (!liga) throw new Error('Este torneo no tiene liga: no se pueden crear combates.');
      const r = await generatePhaseRound(phase, phases, liga);
      if (r.finished) {
        const champ = r.championId ? nameOf.get(r.championId)?.display_name : null;
        alerta(
          'Fase terminada',
          champ ? `${champ} se lleva esta fase.` : 'Ya se jugaron todas las rondas de esta fase.'
        );
      } else {
        const byeNames = r.byes.map((b) => nameOf.get(b)?.display_name ?? '—');
        alerta(
          `Ronda ${r.round} lista`,
          [
            `${r.created} combate(s) creados.`,
            byeNames.length > 0 ? `Pasa(n) directo: ${byeNames.join(', ')}.` : null,
            r.note ?? null,
          ]
            .filter(Boolean)
            .join('\n')
        );
      }
      load();
    } catch (e: any) {
      alerta('No se pudo avanzar', e.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !tournament) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  if (!tournament) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Este torneo ya no existe.</Text>
        </View>
      </Screen>
    );
  }

  const openTag =
    tournament.status === 'pending'
      ? { label: 'REGISTRO ABIERTO', color: colors.win }
      : tournament.status === 'completed'
      ? { label: 'COMPLETADO', color: colors.inkSoft }
      : { label: 'EN JUEGO', color: accent.warm };

  const header = (
    <View style={{ gap: space.md }}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        {isOrganizer && (
          <Pressable style={styles.iconBtn} onPress={changePhoto} disabled={uploading} hitSlop={6}>
            <Text style={styles.iconBtnText}>{uploading ? '…' : '🖼️'}</Text>
          </Pressable>
        )}
      </View>

      {/* La cabecera es el torneo visto de cerca: la misma información con la
          que se anuncia en el lobby, para que se reconozca al entrar. */}
      <View style={[styles.headCard, { borderColor: accent.neon }]}>
        <View style={styles.absFill} pointerEvents="none">
          <Cover
            id={tournamentId}
            photoUrl={tournament.photo_url}
            live={tournament.status !== 'completed'}
            height={236}
          />
        </View>

        <View style={styles.headTop}>
          <View style={[styles.tag, { borderColor: openTag.color, backgroundColor: 'rgba(4,6,12,0.6)' }]}>
            <Text style={[styles.tagText, { color: openTag.color }]}>{openTag.label}</Text>
          </View>
          <CountdownBox startsAt={tournament.starts_at} accent={accent.warm} />
        </View>

        <View style={{ gap: space.md }}>
          <TournamentName name={tournament.name} color={accent.warm} size={24} />
          <View style={{ gap: 5 }}>
            <InfoRow
              glyph="📅"
              value={fmtDateFull(tournament.starts_at) ?? 'Fecha por confirmar'}
              accent={accent.warm}
            />
            <InfoRow
              glyph="📍"
              value={
                tournament.venues
                  ? [tournament.venues.name, tournament.venues.city].filter(Boolean).join(', ')
                  : 'Sede por confirmar'
              }
              accent={accent.warm}
            />
            <InfoRow
              glyph="👥"
              label="Formato"
              value={`${formatLine(tournament)} · ${tournament.mode === 'casual' ? 'casual' : 'ranking'}`}
              accent={accent.warm}
            />
          </View>
        </View>
      </View>

      <View style={styles.tabCard}>
        <Tabs
          tabs={[
            { key: 'resumen' as Tab, label: 'RESUMEN' },
            { key: 'jugadores' as Tab, label: 'JUGADORES' },
            { key: 'bracket' as Tab, label: 'BRACKET' },
            { key: 'info' as Tab, label: 'INFORMACIÓN' },
          ]}
          current={tab}
          onChange={setTab}
          color={accent.neon}
        />

        {tab === 'resumen' && (
          <View style={styles.tabBody}>
            <StatStrip
              items={[
                {
                  glyph: '👥',
                  label: 'INSCRITOS',
                  value: tournament.capacity
                    ? `${registrations.length} / ${tournament.capacity}`
                    : String(registrations.length),
                  tint: full ? colors.loss : undefined,
                },
                { glyph: '✅', label: 'CHECK-IN', value: String(checkedIn), tint: colors.win },
                { glyph: '🛡️', label: 'NIVEL', value: tournament.level ?? 'Abierto' },
                { glyph: '🏆', label: 'PREMIO', value: tournament.prize ?? 'Sin premio' },
              ]}
            />

            <ClosingBar
              createdAt={tournament.created_at}
              closesAt={tournament.registration_closes_at}
              accent={accent.neon}
            />

            {/* En modalidad con deck, registrar la tarjeta es un paso propio
                del torneo y con fecha límite: después de que se bloquea, ya no
                se toca. Por eso vive aquí y no en "mis combos". */}
            {usesDeckCard(tournament.combat_mode, tournament.mode) && (mine || isOrganizer) && (
              <Pressable
                style={[styles.linkRow, { borderColor: myDeck?.locked_at ? colors.streak : colors.lineHi }]}
                onPress={() =>
                  navigation.navigate('Deck', {
                    tournamentId,
                    tournamentName: tournament.name,
                    combatMode: tournament.combat_mode,
                    status: tournament.status,
                  })
                }
              >
                <Text style={styles.linkGlyph}>🎴</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkText}>TU DECK</Text>
                  <Text style={styles.meta}>
                    {myDeck?.locked_at
                      ? `Bloqueado · ${myDeck.combos.length} combinaciones`
                      : myDeck
                      ? `Registrado · ${myDeck.combos.length} de ${deckSizeFor(tournament.combat_mode)}`
                      : `Sin registrar · ${deckSizeFor(tournament.combat_mode)} principales y 1 extra`}
                  </Text>
                </View>
                <IconChevron />
              </Pressable>
            )}

            {isOrganizer && usesDeckCard(tournament.combat_mode, tournament.mode) && (
              <View style={{ gap: space.sm }}>
                <Button
                  label={`🔒  BLOQUEAR DECKS (${decks.total} registrados)`}
                  variant="ghost"
                  onPress={lockDecks}
                  disabled={busy || decks.total === 0 || decks.locked === decks.total}
                />
                <Text style={styles.hintCenter}>
                  {decks.locked === decks.total && decks.total > 0
                    ? 'Los decks ya están bloqueados: nadie los puede cambiar.'
                    : 'Bloquéalos al cerrar el registro: después nadie puede cambiar su deck.'}
                </Text>
              </View>
            )}

            <MyAction
              tournament={tournament}
              accent={accent}
              mine={mine}
              full={full}
              closed={closed}
              isOrganizer={isOrganizer}
              onRegister={register}
              onScan={() => navigation.navigate('ScanCheckIn')}
              onQr={() => (isOrganizer ? setShowQr((v) => !v) : navigation.navigate('ScanCheckIn'))}
            />

            {/* El QR lo muestra quien organiza y lo escanea quien llega: es el
                check-in de la puerta, y se usa con el torneo abierto en la mano. */}
            {isOrganizer && showQr && checkinCode && (
              <View style={styles.qrWrap}>
                <View style={styles.qrBox}>
                  <QRCode value={`torneo:${tournamentId}:${checkinCode}`} size={168} />
                </View>
                <Text style={styles.hintCenter}>
                  Muéstralo en la entrada: quien lo escanea desde la app queda con check-in.
                </Text>
                {/* El organizador también juega: sin esto, desde aquí nunca
                    podía abrir la cámara para hacer SU propio check-in. */}
                <Pressable onPress={() => navigation.navigate('ScanCheckIn')} hitSlop={6}>
                  <Text style={[styles.sectionLink, { color: accent.warm }]}>
                    📷  ESCANEAR OTRO QR ›
                  </Text>
                </Pressable>
              </View>
            )}

            <Pressable
              style={styles.linkRow}
              onPress={() => navigation.navigate('Judges', { tournamentId, title: tournament.name })}
            >
              <Text style={styles.linkGlyph}>⚖️</Text>
              <Text style={styles.linkText}>CUERPO DE JUECES</Text>
              <IconChevron />
            </Pressable>
          </View>
        )}

        {tab === 'jugadores' && (
          <View style={styles.tabBody}>
            {mine ? (
              <View style={[styles.youCard, { borderColor: accent.neon }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.youLabel}>TU POSICIÓN</Text>
                  <Text style={[styles.youValue, { color: accent.warm }]}>
                    #{myPosition} de {registrations.length}
                  </Text>
                </View>
                <Pill
                  label={mine.checked_in_at ? 'Presente' : 'Falta tu check-in'}
                  color={mine.checked_in_at ? colors.win : colors.streak}
                />
              </View>
            ) : null}
            <Text style={styles.listTitle}>
              {isOrganizer
                ? `JUGADORES INSCRITOS (${registrations.length}) · TOCA PARA DAR CHECK-IN`
                : `JUGADORES INSCRITOS (${registrations.length})`}
            </Text>
          </View>
        )}

        {tab === 'bracket' && (
          <View style={styles.tabBody}>
            <BracketTab
              phases={phases}
              phase={phase}
              onPickPhase={setPhaseId}
              matches={matches}
              byes={byes}
              nameOf={nameOf}
              standings={standings}
              groups={groups}
              playerId={playerId}
              accent={accent}
              champion={champion}
              checkedIn={checkedIn}
              isOrganizer={isOrganizer}
              busy={busy}
              onAdvance={advance}
              canSeedSeason={!!tournament.season_id && phase?.kind === 'single_elim'}
              onSeedSeason={seedSeason}
              onOpenMatch={(id: string) => navigation.navigate('MatchDetail', { matchId: id })}
            />
          </View>
        )}

        {tab === 'info' && (
          <View style={styles.tabBody}>
            <InfoTab
              tournament={tournament}
              phases={phases}
              accent={accent}
              onJudges={() => navigation.navigate('Judges', { tournamentId, title: tournament.name })}
              onWearGuide={() => navigation.navigate('WearGuide')}
            />
          </View>
        )}
      </View>

      {/* Los inscritos también se asoman en el resumen: quién viene es parte de
          decidir si vas, y mandarlo a otra pestaña lo esconde. */}
      {tab === 'resumen' && registrations.length > 0 && (
        <View style={{ gap: space.sm }}>
          <View style={styles.sectionRow}>
            <Text style={styles.listTitle}>JUGADORES INSCRITOS ({registrations.length})</Text>
            <Pressable onPress={() => setTab('jugadores')} hitSlop={6}>
              <Text style={[styles.sectionLink, { color: accent.warm }]}>VER TODOS ›</Text>
            </Pressable>
          </View>
          {registrations.slice(0, 5).map((r, i) => (
            <PlayerRow
              key={r.player_id}
              reg={r}
              index={i}
              me={r.player_id === playerId}
              accent={accent}
              onPress={
                isOrganizer ? () => toggleCheckIn(r.player_id, !!r.checked_in_at) : undefined
              }
            />
          ))}
        </View>
      )}

      {tab === 'resumen' && champion && (
        <Card style={styles.champ}>
          <Text style={styles.champTag}>CAMPEÓN DEL TORNEO</Text>
          <View style={styles.champRow}>
            <Avatar uri={champion.avatar_url} avatarKey={champion.avatar_key} size={58} ring={colors.streak} />
            <View style={{ flex: 1 }}>
              <Text style={styles.champName} numberOfLines={1}>
                {champion.display_name}
              </Text>
              <Text style={styles.meta}>Ganó la final</Text>
            </View>
            <Text style={{ fontSize: 26 }}>🏆</Text>
          </View>
        </Card>
      )}

      {tab === 'resumen' && myNextMatch && (
        <Card
          style={[styles.next, { borderColor: accent.neon }]}
          onPress={() => navigation.navigate('MatchDetail', { matchId: myNextMatch.id })}
        >
          <Text style={[styles.nextTag, { color: accent.warm }]}>TU SIGUIENTE COMBATE</Text>
          <Text style={styles.nextText}>
            {myNextMatch.player_a?.display_name ?? '—'} vs {myNextMatch.player_b?.display_name ?? '—'}
          </Text>
          <Text style={styles.meta}>Ronda {myNextMatch.bracket_round} · toca para reportar</Text>
        </Card>
      )}

      {tab === 'resumen' && tournament.mode === 'casual' && theme ? (
        <Card style={{ gap: space.md }}>
          <View style={styles.sectionRow}>
            <Text style={styles.listTitle}>TEMÁTICA DEL TORNEO</Text>
            {theme.closesAt && !theme.theme ? (
              <Text style={styles.meta}>Cierra el {fmtDate(theme.closesAt)}</Text>
            ) : null}
          </View>

          {theme.theme ? (
            // Ya se votó: la temática es una regla del torneo, no una encuesta.
            <View style={[styles.themeWinner, { borderColor: accent.neon }]}>
              <Text style={styles.themeWinnerLabel}>GANÓ LA VOTACIÓN</Text>
              <Text style={[styles.themeWinnerText, { color: accent.warm }]}>{theme.theme}</Text>
              <Text style={styles.hint}>Solo se puede jugar con lo que permita esta temática.</Text>
            </View>
          ) : !theme.closesAt ? (
            <>
              <Text style={styles.hint}>
                Un torneo casual puede jugarse con una restricción votada por la comunidad. La
                votación cierra una semana antes del torneo.
              </Text>
              {isOrganizer ? (
                <Button
                  label="ABRIR VOTACIÓN DE TEMÁTICA"
                  variant="ghost"
                  onPress={() => conTematica(() => openThemeVote(tournamentId, tournament.starts_at))}
                  disabled={busy}
                />
              ) : (
                <Text style={styles.hint}>La abre un moderador de la liga.</Text>
              )}
            </>
          ) : (
            <>
              {theme.options.filter((o) => o.approved).length === 0 ? (
                <Text style={styles.hint}>
                  Todavía no hay opciones en la boleta. Propón una: un moderador la acepta y queda
                  para votar.
                </Text>
              ) : null}

              {theme.options.map((o) => {
                const total = theme.options.reduce((n, x) => n + x.votes, 0) || 1;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => (o.approved ? conTematica(() => voteTheme(o.id)) : undefined)}
                    style={[
                      styles.themeOption,
                      o.mine && { borderColor: accent.neon, backgroundColor: colors.surface },
                      !o.approved && { opacity: 0.6 },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 5 }}>
                      <Text style={styles.themeLabel}>
                        {o.label}
                        {!o.approved ? '  · por aceptar' : ''}
                      </Text>
                      <Meter value={o.votes} max={total} color={o.mine ? accent.neon : colors.lineHi} />
                    </View>
                    <Text style={[styles.themeVotes, o.mine && { color: accent.warm }]}>{o.votes}</Text>
                    {isOrganizer && !o.approved ? (
                      <Pressable
                        onPress={() => conTematica(() => approveTheme(o.id, true))}
                        style={styles.themeApprove}
                        hitSlop={6}
                      >
                        <Text style={styles.themeApproveText}>ACEPTAR</Text>
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })}

              <Field
                label="Proponer una temática"
                placeholder="Solo Blades de metal"
                value={nuevaTematica}
                onChangeText={setNuevaTematica}
              />
              <Button
                label="PROPONER"
                variant="ghost"
                disabled={nuevaTematica.trim().length < 3 || busy}
                onPress={() =>
                  conTematica(async () => {
                    await suggestTheme(tournamentId, nuevaTematica.trim());
                    setNuevaTematica('');
                  })
                }
              />
              <Text style={styles.hint}>
                Propone cualquier miembro de la liga y un moderador la acepta. Votan los miembros de
                la liga, un voto cada quien, y se puede cambiar hasta el cierre.
              </Text>
            </>
          )}
        </Card>
      ) : null}

      {tab === 'resumen' && tournament.prize ? (
        <Card style={styles.prize} onPress={() => setTab('info')}>
          <Hex size={46} color={colors.elite}>
            <Text style={{ fontSize: 17 }}>🏆</Text>
          </Hex>
          <View style={{ flex: 1 }}>
            <Text style={styles.prizeTag}>PREMIO DEL TORNEO</Text>
            <Text style={styles.prizeText}>{tournament.prize}</Text>
          </View>
          <IconChevron />
        </Card>
      ) : null}
    </View>
  );

  return (
    <Screen padded={false}>
      <FlatList
        data={tab === 'jugadores' ? registrations : []}
        keyExtractor={(r) => r.player_id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <PlayerRow
            reg={item}
            index={index}
            me={item.player_id === playerId}
            accent={accent}
            onPress={isOrganizer ? () => toggleCheckIn(item.player_id, !!item.checked_in_at) : undefined}
            onInspect={
              isOrganizer && usesDeckCard(tournament.combat_mode, tournament.mode)
                ? () => inspect(item.player_id, item.players?.display_name ?? 'jugador')
                : undefined
            }
          />
        )}
        ListEmptyComponent={
          tab === 'jugadores' && !loading ? (
            <Card>
              <Text style={type.soft}>Nadie inscrito todavía. Sé el primero.</Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

/* ─────────────────────────── Lo que me toca hacer ─────────────────────────── */

function MyAction({
  tournament,
  accent,
  mine,
  full,
  closed,
  isOrganizer,
  onRegister,
  onScan,
  onQr,
}: {
  tournament: Tournament;
  accent: { neon: string; warm: string };
  mine: Registration | null;
  full: boolean;
  closed: boolean;
  isOrganizer: boolean;
  onRegister: () => void;
  onScan: () => void;
  onQr: () => void;
}) {
  const canRegister = tournament.status === 'pending' && !full && !closed;

  if (mine?.checked_in_at && !isOrganizer) {
    return (
      <View style={[styles.doneCard, { borderColor: colors.win }]}>
        <Text style={styles.doneText}>✓ Ya hiciste check-in</Text>
      </View>
    );
  }

  // La presencia se PRUEBA, no se declara: ya no hay botón que marque check-in
  // sin escanear. El servidor tampoco lo acepta (0048), así que quitarlo de
  // aquí no es solo cosmética.
  const label = !mine
    ? 'INSCRIBIRME'
    : mine.checked_in_at
    ? 'CHECK-IN HECHO'
    : '📷  ESCANEAR QR PARA CHECK-IN';
  const action = !mine ? onRegister : mine.checked_in_at ? () => {} : onScan;
  const off = !mine ? !canRegister : !!mine.checked_in_at;

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.actionRow}>
        <Pressable
          onPress={action}
          disabled={off}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: off ? colors.surface : accent.neon },
            !off && glow(accent.neon, 12),
            pressed && !off && { opacity: 0.9 },
          ]}
        >
          <Text style={[styles.actionText, off && { color: colors.inkDim }]}>{label}</Text>
        </Pressable>

        {/* El cuadrito del QR: el organizador lo enseña, el jugador lo escanea. */}
        <Pressable onPress={onQr} style={[styles.qrBtn, { borderColor: accent.neon }]} hitSlop={4}>
          <Text style={{ fontSize: 19 }}>▣</Text>
        </Pressable>
      </View>

      {mine && !mine.checked_in_at && (
        <Text style={styles.hintCenter}>
          El QR lo muestra la organización en la entrada. Si tu teléfono no puede escanear, pide que
          te marquen a mano.
        </Text>
      )}

      {!mine && !canRegister && (
        <Text style={styles.hintCenter}>
          {tournament.status !== 'pending'
            ? 'Este torneo ya empezó.'
            : full
            ? 'Ya no quedan lugares.'
            : 'Las inscripciones ya cerraron.'}
        </Text>
      )}
    </View>
  );
}

function PlayerRow({
  reg,
  index,
  me,
  accent,
  onPress,
  onInspect,
}: {
  reg: Registration;
  index: number;
  me: boolean;
  accent: { neon: string; warm: string };
  onPress?: () => void;
  onInspect?: () => void;
}) {
  const p = reg.players;
  const here = !!reg.checked_in_at;
  const medal = MEDAL[index + 1];

  const body = (
    <View style={[styles.playerRow, me && { borderColor: accent.neon, backgroundColor: colors.surface }]}>
      <View style={[styles.seedBox, medal ? { borderColor: medal } : null]}>
        <Text style={[styles.seedText, medal ? { color: medal } : null]}>{index + 1}</Text>
      </View>
      <Avatar uri={p?.avatar_url} avatarKey={p?.avatar_key} size={40} ring={here ? colors.win : undefined} />
      <View style={{ flex: 1 }}>
        <Text style={styles.playerName} numberOfLines={1}>
          {me ? 'Tú' : p?.display_name ?? '—'}
        </Text>
        <Text style={styles.meta}>{Math.round(p?.elo_rating ?? 1000)} ELO</Text>
      </View>
      {me ? (
        <View style={[styles.tag, { borderColor: accent.neon }]}>
          <Text style={[styles.tagText, { color: accent.warm }]}>TU POSICIÓN</Text>
        </View>
      ) : (
        <Text style={[styles.checkText, here && { color: colors.win }]}>
          {here ? '✓ Presente' : 'Check-in pendiente'}
        </Text>
      )}

      {/* La lupa va aparte del resto de la fila: tocar la fila da check-in, y
          confundir las dos cosas congelaría un deck sin querer. */}
      {onInspect ? (
        <Pressable onPress={onInspect} style={styles.inspectBtn} hitSlop={6}>
          <Text style={{ fontSize: 15 }}>🔍</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return onPress ? <Pressable onPress={onPress}>{body}</Pressable> : body;
}

/* ─────────────────────────── BRACKET ─────────────────────────── */

function BracketTab({
  phases,
  phase,
  onPickPhase,
  matches,
  byes,
  nameOf,
  standings,
  groups,
  playerId,
  accent,
  champion,
  checkedIn,
  isOrganizer,
  busy,
  onAdvance,
  onOpenMatch,
  canSeedSeason,
  onSeedSeason,
}: any) {
  if (!phase) {
    return (
      <Card>
        <Text style={type.soft}>Este torneo no tiene estructura todavía.</Text>
      </Card>
    );
  }

  const phaseMatches: MatchRow[] = matches.filter((m: MatchRow) => m.phase_id === phase.id);
  const rounds = [...new Set(phaseMatches.map((m) => m.bracket_round))].sort((a, b) => a - b);
  const lastRound = rounds[rounds.length - 1] ?? 0;
  const openMatches = phaseMatches.filter(
    (m) => m.bracket_round === lastRound && m.status !== 'confirmed'
  );

  const index = phases.findIndex((p: Phase) => p.id === phase.id);
  const previous: Phase | null = index > 0 ? phases[index - 1] : null;
  const previousPending = !!previous && previous.status !== 'completed';

  const notStarted = rounds.length === 0;
  const enoughPlayers = phase.phase_number > 1 || checkedIn >= 2;
  const canAdvance =
    isOrganizer &&
    phase.status !== 'completed' &&
    openMatches.length === 0 &&
    !previousPending &&
    enoughPlayers;

  const advanceLabel = notStarted
    ? phase.phase_number === 1
      ? `GENERAR PRIMERA RONDA (${checkedIn} con check-in)`
      : 'ABRIR ESTA FASE'
    : `GENERAR RONDA ${lastRound + 1}`;

  const blocked = previousPending
    ? `Primero tiene que terminar la fase ${previous!.phase_number}.`
    : openMatches.length > 0
    ? openMatches.length === 1
      ? `Falta 1 resultado por aprobar en la ronda ${lastRound}.`
      : `Faltan ${openMatches.length} resultados por aprobar en la ronda ${lastRound}.`
    : !enoughPlayers
    ? 'Hacen falta al menos 2 jugadores con check-in.'
    : null;

  return (
    <View style={{ gap: space.md }}>
      {phases.length > 1 && (
        <View style={styles.phaseRow}>
          {phases.map((p: Phase) => {
            const on = p.id === phase.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => onPickPhase(p.id)}
                style={[styles.phaseChip, on && { borderColor: accent.neon, backgroundColor: colors.surface }]}
              >
                <Text style={[styles.phaseChipText, on && { color: colors.ink }]}>FASE {p.phase_number}</Text>
                <Text style={styles.phaseChipSub}>{phaseLabel(p.kind)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.phaseHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.phaseTitle}>{phaseLabel(phase.kind)}</Text>
          <Text style={styles.meta}>
            {[
              `a ${phase.points_to_win} puntos`,
              phase.kind === 'swiss' && phase.rounds ? `${phase.rounds} rondas` : null,
              phase.kind === 'blocks' && phase.block_count ? `${phase.block_count} grupos` : null,
              phase.cut_size ? `pasan ${phase.cut_size}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <Pill
          label={
            phase.status === 'completed'
              ? 'Terminada'
              : phase.status === 'in_progress'
              ? 'En juego'
              : 'Sin empezar'
          }
          color={
            phase.status === 'completed'
              ? colors.inkDim
              : phase.status === 'in_progress'
              ? accent.neon
              : colors.streak
          }
        />
      </View>

      {champion && (
        <Card style={styles.champ}>
          <Text style={styles.champTag}>CAMPEÓN DEL TORNEO</Text>
          <View style={styles.champRow}>
            <Avatar uri={champion.avatar_url} avatarKey={champion.avatar_key} size={52} ring={colors.streak} />
            <Text style={[styles.champName, { flex: 1 }]} numberOfLines={1}>
              {champion.display_name}
            </Text>
            <Text style={{ fontSize: 24 }}>🏆</Text>
          </View>
        </Card>
      )}

      {/* La tabla solo tiene sentido donde todos siguen jugando. En eliminación
          la posición es "hasta dónde llegó", y eso lo cuenta la llave. */}
      {standings && standings.length > 0 && (
        <View style={{ gap: space.md }}>
          {/* Por categoría son VARIAS tablas. Una sola diría que un Porcelana va
              arriba de un Oro, cuando ni siquiera se enfrentaron. */}
          {groups && groups.length > 0 ? (
            groups.map((g: CategoryGroup) => {
              const inGroup = standings.filter((s: Standing) => g.players.includes(s.player_id));
              if (inGroup.length === 0) return null;
              const tint = categoryColor(g.category_code);
              return (
                <View key={g.key} style={{ gap: space.sm }}>
                  <View style={styles.groupHead}>
                    <View style={[styles.groupDot, { backgroundColor: tint }]} />
                    <Text style={[styles.groupName, { color: tint }]}>
                      {categoryLabel(g.category_code)}
                      {g.division ? ` · División ${g.division}` : ''}
                    </Text>
                  </View>
                  <StandingsTable
                    rows={inGroup}
                    nameOf={nameOf}
                    playerId={playerId}
                    accent={accent}
                    cutSize={null}
                  />
                </View>
              );
            })
          ) : (
            <View style={{ gap: space.sm }}>
              <Text style={styles.listTitle}>TABLA DE LA FASE</Text>
              <StandingsTable
                rows={standings}
                nameOf={nameOf}
                playerId={playerId}
                accent={accent}
                cutSize={phase.cut_size}
              />
              {phase.cut_size ? (
                <Text style={styles.hint}>
                  La línea verde marca a los {phase.cut_size} que pasan a la fase siguiente.
                </Text>
              ) : null}
            </View>
          )}
        </View>
      )}

      {rounds.length === 0 ? (
        <Card style={styles.empty}>
          <Hex size={50} color={colors.inkDim}>
            <Text style={{ fontSize: 18 }}>🗺️</Text>
          </Hex>
          <Text style={styles.emptyTitle}>Esta fase no ha empezado</Text>
          <Text style={styles.hintCenter}>
            {isOrganizer
              ? 'La primera ronda se arma con quienes tengan check-in.'
              : 'La arma un moderador cuando cierre el check-in.'}
          </Text>
        </Card>
      ) : (
        rounds.map((round) => {
          const roundMatches = phaseMatches.filter((m) => m.bracket_round === round);
          const roundByes = byes.filter((b: Bye) => b.phase_id === phase.id && b.bracket_round === round);

          // Una ronda puede traer varios frentes a la vez y hay que separarlos o
          // no se entiende: en eliminación doble, las dos llaves; por categoría
          // o por grupos, un bloque por cada uno. El criterio cambia, el
          // problema es el mismo.
          const byBlock = phase.kind === 'category_rr' || phase.kind === 'blocks';
          const sections = [
            ...new Set(
              roundMatches.map((m) => (byBlock ? String(m.block_number ?? '') : m.bracket_side ?? 'none'))
            ),
          ];
          const sectionLabel = (key: string) => {
            if (!byBlock) return SIDE_LABEL[key] ?? '';
            if (phase.kind === 'blocks') return `GRUPO ${key}`;
            // El bloque de una fase por categoría ES el tier de la categoría.
            const g = (groups ?? []).find((x: CategoryGroup) => String(x.tier) === key);
            return g
              ? `${categoryLabel(g.category_code).toUpperCase()}${g.division ? ` · DIVISIÓN ${g.division}` : ''}`
              : 'CATEGORÍA';
          };

          return (
            <View key={round} style={{ gap: space.sm }}>
              <View style={styles.roundHead}>
                <View style={styles.roundLine} />
                <Text style={styles.roundTitle}>{roundTitle(phase.kind, roundMatches.length, round)}</Text>
                <View style={styles.roundLine} />
              </View>

              {sections.map((key) =>
                roundMatches
                  .filter(
                    (m) => (byBlock ? String(m.block_number ?? '') : m.bracket_side ?? 'none') === key
                  )
                  .map((m, i) => (
                    <View key={m.id} style={{ gap: space.sm }}>
                      {i === 0 && sections.length > 1 && key !== 'none' && key !== '' ? (
                        <Text style={styles.sideLabel}>{sectionLabel(key)}</Text>
                      ) : null}
                      <MatchCard match={m} onPress={() => onOpenMatch(m.id)} />
                    </View>
                  ))
              )}

              {roundByes.map((b: Bye) => (
                <Card key={`bye-${round}-${b.player_id}`} style={styles.bye}>
                  <Hex size={32} color={colors.streak}>
                    <Text style={{ fontSize: 12 }}>➜</Text>
                  </Hex>
                  <Text style={styles.byeText}>
                    <Text style={styles.byeName}>{nameOf.get(b.player_id)?.display_name ?? '—'}</Text> pasa
                    directo (bye)
                  </Text>
                </Card>
              ))}
            </View>
          );
        })
      )}

      {isOrganizer && phase.status !== 'completed' && (
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Button label={advanceLabel} onPress={onAdvance} disabled={!canAdvance || busy} loading={busy} />
          {blocked ? <Text style={styles.hintCenter}>{blocked}</Text> : null}
        </View>
      )}

      {/* El torneo inicial (G3) no reparte VP: reparte PUESTOS. Por eso el
          sembrado es un acto aparte, y del organizador. */}
      {isOrganizer && canSeedSeason && rounds.length > 0 && (
        <View style={{ gap: space.sm, marginTop: space.sm }}>
          <Button
            label="🎯  FIJAR POSICIONES DE LA TEMPORADA"
            variant="ghost"
            onPress={onSeedSeason}
            disabled={busy}
          />
          <Text style={styles.hintCenter}>
            El orden de llegada de este torneo pasa a ser la posición inicial de cada quien dentro de
            su categoría.
          </Text>
        </View>
      )}
    </View>
  );
}

function StandingsTable({
  rows,
  nameOf,
  playerId,
  accent,
  cutSize,
}: {
  rows: Standing[];
  nameOf: Map<string, PlayerLite>;
  playerId: string;
  accent: { neon: string; warm: string };
  cutSize: number | null;
}) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHead}>
        <Text style={[styles.thNum, { width: 24 }]}>#</Text>
        <Text style={[styles.th, { flex: 1 }]}>JUGADOR</Text>
        <Text style={[styles.thNum, { width: 30 }]}>G</Text>
        <Text style={[styles.thNum, { width: 30 }]}>P</Text>
        <Text style={[styles.thNum, { width: 42 }]}>DIF</Text>
      </View>
      {rows.map((s, i) => {
        const me = s.player_id === playerId;
        const cut = cutSize && i < cutSize;
        return (
          <View
            key={s.player_id}
            style={[
              styles.tableRow,
              me && { backgroundColor: colors.surface },
              cut ? { borderLeftWidth: 2, borderLeftColor: colors.win } : null,
            ]}
          >
            <Text style={[styles.tdNum, { width: 24 }, me && { color: accent.warm }]}>{i + 1}</Text>
            <Text
              style={[styles.td, { flex: 1 }, me && { color: colors.ink, fontWeight: '800' }]}
              numberOfLines={1}
            >
              {me ? 'Tú' : nameOf.get(s.player_id)?.display_name ?? '—'}
            </Text>
            <Text style={[styles.tdNum, { width: 30, color: colors.win }]}>{s.wins}</Text>
            <Text style={[styles.tdNum, { width: 30, color: colors.loss }]}>{s.losses}</Text>
            <Text style={[styles.tdNum, { width: 42 }]}>{s.diff > 0 ? `+${s.diff}` : s.diff}</Text>
          </View>
        );
      })}
    </View>
  );
}

function MatchCard({ match, onPress }: { match: MatchRow; onPress: () => void }) {
  const aWon = match.winner_id === match.player_a_id;
  const bWon = match.winner_id === match.player_b_id;
  const done = match.status === 'confirmed';

  return (
    <Card style={[styles.match, !done && { borderColor: colors.lineHi }]} onPress={onPress}>
      <Side player={match.player_a} won={aWon} dim={done && !aWon} />
      <View style={styles.matchCenter}>
        {done ? (
          <Text style={styles.score}>
            {match.score_a}–{match.score_b}
          </Text>
        ) : (
          <Text style={styles.vs}>VS</Text>
        )}
        {!done && (
          <Pill
            label={
              match.status === 'disputed'
                ? 'Disputa'
                : match.status === 'reported'
                ? 'Por aprobar'
                : 'En juego'
            }
            color={match.status === 'disputed' ? colors.loss : colors.blue}
            align="center"
          />
        )}
      </View>
      <Side player={match.player_b} won={bWon} dim={done && !bWon} right />
    </Card>
  );
}

function Side({
  player,
  won,
  dim,
  right,
}: {
  player: PlayerLite | null;
  won: boolean;
  dim: boolean;
  right?: boolean;
}) {
  return (
    <View style={[styles.side, right && { flexDirection: 'row-reverse' }]}>
      <Avatar uri={player?.avatar_url} avatarKey={player?.avatar_key} size={36} ring={won ? colors.win : undefined} />
      <Text
        style={[
          styles.sideName,
          right && { textAlign: 'right' },
          won && { color: colors.win },
          dim && { color: colors.inkDim },
        ]}
        numberOfLines={2}
      >
        {player?.display_name ?? '—'}
      </Text>
    </View>
  );
}

/* ─────────────────────────── INFORMACIÓN ─────────────────────────── */

function InfoTab({
  tournament,
  phases,
  accent,
  onJudges,
  onWearGuide,
}: {
  tournament: Tournament;
  phases: Phase[];
  accent: { neon: string; warm: string };
  onJudges: () => void;
  onWearGuide: () => void;
}) {
  const venue = tournament.venues;
  const deckSize = COMBAT_MODES.find((m) => m.key === tournament.combat_mode)?.deckSize ?? 1;

  return (
    <View style={{ gap: space.md }}>
      <Text style={styles.listTitle}>CUÁNDO Y DÓNDE</Text>
      <Card style={{ gap: space.md }}>
        <InfoLine glyph="📅" label="Fecha" value={fmtDateTime(tournament.starts_at) ?? 'Por confirmar'} />
        <InfoLine
          glyph="📍"
          label="Sede"
          value={venue ? [venue.name, venue.city, venue.address].filter(Boolean).join(' · ') : 'Por confirmar'}
        />
        <InfoLine
          glyph="👥"
          label="Cupo"
          value={tournament.capacity ? `${tournament.capacity} jugadores` : 'Sin límite'}
        />
        <InfoLine
          glyph="🔒"
          label="Cierre de inscripciones"
          value={fmtDate(tournament.registration_closes_at) ?? 'Hasta que empiece'}
        />
        {tournament.prize ? <InfoLine glyph="🏅" label="Premio" value={tournament.prize} /> : null}
      </Card>

      <Text style={styles.listTitle}>CÓMO SE JUEGA</Text>
      <Card style={{ gap: space.md }}>
        <InfoLine glyph="⚔️" label="Modalidad" value={combatLabel(tournament.combat_mode)} />
        {deckSize > 1 ? (
          <InfoLine
            glyph="🎴"
            label="Orden del deck"
            value={
              tournament.deck_order === 'blind'
                ? 'A ciegas: cada quien elige en secreto y se revela a la vez'
                : 'Decidido antes y respetado'
            }
          />
        ) : null}
        <InfoLine
          glyph="📈"
          label="Cuenta para el ranking"
          value={
            tournament.mode === 'casual'
              ? 'No. Emparejamiento al azar, Aerial permitido, no mueve el ELO'
              : 'Sí. Siembra por ELO, sin Aerial'
          }
        />
        {phases.some((p) => p.kind === 'swiss') ? (
          <InfoLine
            glyph="⚖️"
            label="Desempate del suizo"
            value={
              tournament.swiss_tiebreak === 'opponents'
                ? 'Fuerza de rivales (Buchholz)'
                : 'Reglamento DML: diferencia de puntos, luego enfrentamiento directo'
            }
          />
        ) : null}
      </Card>

      <Text style={styles.listTitle}>ESTRUCTURA</Text>
      {phases.map((p) => (
        <Card key={p.id} style={styles.phaseInfo}>
          <View style={[styles.phaseNum, { borderColor: accent.neon }]}>
            <Text style={[styles.phaseNumText, { color: accent.warm }]}>{p.phase_number}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.playerName}>{phaseLabel(p.kind)}</Text>
            <Text style={styles.meta}>
              {[
                `a ${p.points_to_win} puntos`,
                p.kind === 'swiss' && p.rounds ? `${p.rounds} rondas` : null,
                p.kind === 'blocks' && p.block_count ? `${p.block_count} grupos` : null,
                p.cut_size ? `entran ${p.cut_size}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pill
            label={p.status === 'completed' ? 'Terminada' : p.status === 'in_progress' ? 'En juego' : 'Pendiente'}
            color={p.status === 'completed' ? colors.inkDim : p.status === 'in_progress' ? accent.neon : colors.streak}
          />
        </Card>
      ))}

      {/* Un cuerpo arbitral se convoca para el evento: sin jueces nombrados, los
          resultados de este torneo se quedan esperando. */}
      <Button label="⚖️  CUERPO DE JUECES" variant="ghost" onPress={onJudges} />
      <Button label="🔍  GUÍA DE VERIFICACIÓN DE DESGASTE" variant="ghost" onPress={onWearGuide} />
    </View>
  );
}

function InfoLine({ glyph, label, value }: { glyph: string; label: string; value: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoGlyph}>{glyph}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label.toUpperCase()}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  absFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { fontSize: 15 },

  headCard: {
    height: 236,
    borderWidth: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
    padding: space.lg,
    justifyContent: 'space-between',
  },
  headTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.sm },

  tabCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  tabBody: { padding: space.lg, gap: space.md },

  actionRow: { flexDirection: 'row', gap: space.sm },
  action: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 13.5, fontWeight: '800', letterSpacing: 1, color: '#fff' },
  qrBtn: {
    width: 54,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrWrap: { alignItems: 'center', gap: space.sm },
  qrBox: { backgroundColor: '#fff', padding: space.md, borderRadius: radius.md },

  doneCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    alignItems: 'center',
    backgroundColor: colors.winSoft,
  },
  doneText: { color: colors.win, fontWeight: '800', fontSize: 13.5 },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
  },
  linkGlyph: { fontSize: 16 },
  linkText: { flex: 1, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.ink },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionLink: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  listTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1, color: colors.inkSoft },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    padding: space.md,
  },
  inspectBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedBox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seedText: { fontSize: 11, fontWeight: '800', color: colors.inkSoft },
  playerName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  checkText: { fontSize: 10.5, color: colors.inkDim },

  youCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    backgroundColor: colors.surface,
  },
  youLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  youValue: { fontSize: 19, fontWeight: '800' },

  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },

  meta: { fontSize: 11.5, color: colors.inkSoft, marginTop: 2 },

  phaseRow: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  phaseChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: 1,
  },
  phaseChipText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, color: colors.inkSoft },
  phaseChipSub: { fontSize: 9.5, color: colors.inkDim },
  phaseHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  phaseTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },

  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  groupDot: { width: 8, height: 8, borderRadius: 4 },
  groupName: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },

  table: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  th: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  thNum: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim, textAlign: 'center' },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  td: { fontSize: 12.5, color: colors.inkSoft },
  tdNum: { fontSize: 12.5, fontWeight: '700', color: colors.inkSoft, textAlign: 'center' },

  roundHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  roundLine: { flex: 1, height: 1, backgroundColor: colors.line },
  roundTitle: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1.4, color: colors.inkSoft },
  sideLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.inkDim },

  match: { flexDirection: 'row', alignItems: 'center' },
  matchCenter: { alignItems: 'center', gap: 4, paddingHorizontal: space.sm },
  vs: { fontSize: 10, fontWeight: '800', fontStyle: 'italic', color: colors.inkDim, letterSpacing: 1 },
  score: { fontSize: 15, fontWeight: '800', color: colors.ink },
  side: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sideName: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.ink },

  bye: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  byeText: { flex: 1, fontSize: 12, color: colors.inkSoft },
  byeName: { color: colors.ink, fontWeight: '700' },

  champ: { gap: space.md, borderColor: colors.streak },
  champTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: colors.streak },
  champRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  champName: { ...type.display, fontSize: 19 },

  next: { gap: 3 },
  nextTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  nextText: { fontSize: 14.5, fontWeight: '800', color: colors.ink },

  themeWinner: { borderWidth: 1, borderRadius: radius.md, padding: space.lg, gap: 3 },
  themeWinnerLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  themeWinnerText: { fontSize: 17, fontWeight: '800', fontStyle: 'italic' },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
  },
  themeLabel: { fontSize: 13, fontWeight: '700', color: colors.ink },
  themeVotes: { fontSize: 15, fontWeight: '800', color: colors.inkSoft, minWidth: 20, textAlign: 'right' },
  themeApprove: {
    borderWidth: 1,
    borderColor: colors.win,
    borderRadius: 7,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  themeApproveText: { fontSize: 9, fontWeight: '800', color: colors.win, letterSpacing: 0.5 },

  prize: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  prizeTag: { fontSize: 9, fontWeight: '800', letterSpacing: 1, color: colors.elite },
  prizeText: { fontSize: 13, color: colors.ink, lineHeight: 19, marginTop: 2 },

  infoLine: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  infoGlyph: { fontSize: 16, width: 22, textAlign: 'center' },
  infoLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  infoValue: { fontSize: 13, color: colors.ink, lineHeight: 18, marginTop: 1 },

  phaseInfo: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  phaseNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseNumText: { fontSize: 13, fontWeight: '800' },

  hint: { fontSize: 11, color: colors.inkDim, lineHeight: 16 },
  hintCenter: { fontSize: 11, color: colors.inkDim, textAlign: 'center', lineHeight: 16 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
});
