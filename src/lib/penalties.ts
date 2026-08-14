import { supabase } from './supabase';
import { colors } from '../theme';

// Infracciones del reglamento DML.
//
// El catálogo vive en la base (`penalty_codes`), no aquí: la severidad de cada
// falta decide el efecto en el marcador, y esa decisión la toma el servidor.
// Duplicar la tabla en el cliente sería pedir que un día digan cosas distintas.

export type Severity = 'leve' | 'grave' | 'critica';

export type PenaltyCode = {
  code: string;
  label: string;
  severity: Severity;
  description: string;
};

export type Penalty = {
  id: string;
  player_id: string;
  code: string;
  severity: Severity;
  notes: string | null;
  awarded_point: boolean;
  forfeited_match: boolean;
  created_at: string;
  penalty_codes: { label: string } | null;
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  leve: 'Leve',
  grave: 'Grave',
  critica: 'Crítica',
};

export const SEVERITY_COLOR: Record<Severity, string> = {
  leve: colors.streak,
  grave: colors.loss,
  critica: colors.elite,
};

// Qué le pasa al combate según el nivel. Es el texto que ve el juez ANTES de
// sancionar, para que sepa lo que va a provocar.
export const SEVERITY_EFFECT: Record<Severity, string> = {
  leve: 'Dos del mismo tipo en un combate dan 1 punto al rival.',
  grave: 'El infractor pierde el combate de inmediato.',
  critica: 'Pierde el combate y queda registrado para expulsión o suspensión.',
};

export async function loadPenaltyCodes(): Promise<PenaltyCode[]> {
  const { data } = await supabase
    .from('penalty_codes')
    .select('code, label, severity, description')
    .order('sort_order');
  return (data as any) ?? [];
}

export async function loadMatchPenalties(matchId: string): Promise<Penalty[]> {
  const { data } = await supabase
    .from('penalties')
    .select('id, player_id, code, severity, notes, awarded_point, forfeited_match, created_at, penalty_codes(label)')
    .eq('match_id', matchId)
    .order('created_at');
  return (data as any) ?? [];
}
