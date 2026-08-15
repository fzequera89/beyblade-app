import { supabase } from './supabase';

// Guía de verificación de desgaste (reglamento DML) y la inspección del juez.
//
// La guía vive en la base y no en el código por la misma razón que los badges y
// las penalizaciones: los criterios de desgaste dependen de qué piezas van
// saliendo, y el cliente tiene que poder corregirlos sin un build.

export type WearCheck = {
  id: string;
  piece: string;
  control_point: string;
  illegal_state: string;
  safety_test: string | null;
};

export async function loadWearChecks(): Promise<WearCheck[]> {
  const { data, error } = await supabase
    .from('wear_checks')
    .select('id, piece, control_point, illegal_state, safety_test')
    .order('sort_order');
  if (error) throw error;
  return (data as any) ?? [];
}

/**
 * Aprobar CONGELA la tarjeta: el reglamento dice que después de revisar y
 * autorizar ya no se cambian piezas ni lanzadores. Rechazar la deja editable,
 * porque el jugador tiene que poder corregir y volver a presentarse.
 */
export async function recordInspection(
  tournamentId: string,
  playerId: string,
  passed: boolean,
  notes?: string
): Promise<void> {
  const { error } = await supabase.rpc('record_deck_inspection', {
    p_tournament_id: tournamentId,
    p_player_id: playerId,
    p_passed: passed,
    p_notes: notes ?? null,
  });
  if (error) throw error;
}
