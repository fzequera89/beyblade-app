// Tipos de finish de Beyblade X. El `code` es lo que se guarda en
// match_rounds.finish_type y lo que valida report_match_result (migración 0014);
// agregar uno nuevo obliga a actualizar también esa función.
export const FINISH_TYPES = [
  { code: 'spin', label: 'Spin', description: 'El rival deja de girar' },
  { code: 'over', label: 'Over', description: 'El rival sale del estadio' },
  { code: 'burst', label: 'Burst', description: 'El rival estalla' },
  { code: 'xtreme', label: 'Xtreme', description: 'Golpe por la zona Xtreme' },
] as const;

export type FinishCode = (typeof FINISH_TYPES)[number]['code'];

export function finishLabel(code: string | null): string {
  return FINISH_TYPES.find((f) => f.code === code)?.label ?? '—';
}
