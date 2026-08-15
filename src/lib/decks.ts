import { supabase } from './supabase';
import { COMBAT_MODES } from './formats';

// Deck cards: el "3+1" del reglamento.
//
// La validación de "no repetir piezas" vive DOS veces a propósito: aquí para
// que el jugador la vea mientras arma el deck, y en `save_deck_card` (0040)
// para que sea cierta. La del cliente es una cortesía; la del servidor es la
// regla. Si solo estuviera aquí, cualquiera guardaría un deck ilegal con la
// anon key.

export type ComboParts = { blade?: string; ratchet?: string; bit?: string } | null;

export type Combo = { id: string; name: string; parts: ComboParts };

export type DeckCard = {
  id: string;
  locked_at: string | null;
  inspected_at: string | null;
  inspection_passed: boolean | null;
  inspection_notes: string | null;
  combos: { slot: number; is_spare: boolean; combo: Combo }[];
};

export function deckSizeFor(combatMode?: string | null): number {
  return COMBAT_MODES.find((m) => m.key === combatMode)?.deckSize ?? 1;
}

/**
 * El "+1" del reglamento: además de los principales se puede registrar UN
 * extra, que se juega completo o se desarma para dar piezas a los otros. Es
 * opcional — no todos lo llevan — pero nunca más de uno.
 */
export const SPARE_SLOTS = 1;

/** ¿Este torneo lleva deck card? Solo los de ranking con más de una peonza. */
export function usesDeckCard(combatMode?: string | null, mode?: string | null): boolean {
  return deckSizeFor(combatMode) > 1 && mode === 'ranking';
}

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

export function piecesOf(combo: Combo): string[] {
  return [combo.parts?.blade, combo.parts?.ratchet, combo.parts?.bit]
    .map(norm)
    .filter((p) => p.length > 0);
}

/**
 * Las piezas repetidas entre los combos elegidos, con el nombre tal como se
 * escribió la primera vez — decirle al jugador "repites una pieza" sin decirle
 * cuál lo deja adivinando entre nueve.
 */
export function repeatedPieces(combos: Combo[]): string[] {
  const seen = new Map<string, string>();
  const repeated = new Set<string>();
  for (const c of combos) {
    for (const raw of [c.parts?.blade, c.parts?.ratchet, c.parts?.bit]) {
      const key = norm(raw);
      if (!key) continue;
      if (seen.has(key)) repeated.add(seen.get(key)!);
      else seen.set(key, (raw ?? '').trim());
    }
  }
  return [...repeated];
}

/** Combos sin ninguna pieza anotada: no se pueden validar contra la regla. */
export function incompleteCombos(combos: Combo[]): Combo[] {
  return combos.filter((c) => piecesOf(c).length === 0);
}

export async function loadMyCombos(playerId: string): Promise<Combo[]> {
  const { data, error } = await supabase
    .from('combos')
    .select('id, name, parts')
    .eq('player_id', playerId)
    .order('created_at');
  if (error) throw error;
  return (data as any) ?? [];
}

export async function loadDeckCard(tournamentId: string, playerId: string): Promise<DeckCard | null> {
  const { data, error } = await supabase
    .from('deck_cards')
    .select('id, locked_at, inspected_at, inspection_passed, inspection_notes, deck_card_combos(slot, is_spare, combos(id, name, parts))')
    .eq('tournament_id', tournamentId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rows = ((data as any).deck_card_combos ?? []) as any[];
  return {
    id: (data as any).id,
    locked_at: (data as any).locked_at ?? null,
    inspected_at: (data as any).inspected_at ?? null,
    inspection_passed: (data as any).inspection_passed ?? null,
    inspection_notes: (data as any).inspection_notes ?? null,
    combos: rows
      .map((r) => ({
        slot: r.slot,
        is_spare: !!r.is_spare,
        combo: Array.isArray(r.combos) ? r.combos[0] : r.combos,
      }))
      .filter((r) => r.combo)
      .sort((a, b) => a.slot - b.slot),
  };
}

export async function saveDeckCard(tournamentId: string, comboIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('save_deck_card', {
    p_tournament_id: tournamentId,
    p_combo_ids: comboIds,
  });
  if (error) throw error;
}

/** Cuántos registraron su deck: lo que la organización necesita ver antes de bloquear. */
export async function deckCountFor(tournamentId: string): Promise<{ total: number; locked: number }> {
  const { data, error } = await supabase
    .from('deck_cards')
    .select('locked_at')
    .eq('tournament_id', tournamentId);
  if (error) throw error;
  const rows = ((data as any[]) ?? []);
  return { total: rows.length, locked: rows.filter((r) => r.locked_at).length };
}
