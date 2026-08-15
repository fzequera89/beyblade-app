import { RANKS, colors } from '../theme';

// Las 8 categorías del reglamento DML. Los colores ya vivían en `theme.ts`
// desde el rediseño, pero ninguna pantalla los usaba — eran decoración. Desde
// 0030 el escalafón existe de verdad en la base y estas llaves son las mismas
// que la tabla `categories`.

export type CategoryCode = (typeof RANKS)[number]['key'];

export function categoryLabel(code?: string | null): string {
  return RANKS.find((r) => r.key === code)?.label ?? '—';
}

export function categoryColor(code?: string | null): string {
  return RANKS.find((r) => r.key === code)?.color ?? colors.inkDim;
}

// De más alta a más baja, que es como se lee una tabla de posiciones.
export const CATEGORIES_TOP_DOWN = [...RANKS].reverse();

// Cuánto vale cada categoría en VP del INTERCLUBES (no de la tabla local, que
// se ordena por victorias desde 0037). Es el mismo valor que la columna
// `vp_value` de la base — aquí solo para pintarlo sin pedir otra consulta. La
// base manda: si el cliente lo cambia allá, esto es solo un rótulo.
export const VP_BY_CATEGORY: Record<string, number> = {
  challenger: 5,
  diamante: 4,
  platino: 4,
  oro: 3,
  plata: 3,
  bronce: 2,
  hierro: 2,
  porcelana: 1,
};

export function formatVp(vp: number): string {
  return vp > 0 ? `+${vp}` : String(vp);
}
