// El escudo de una liga: las letras que van dentro del hexágono.
//
// Dos trampas que solo se ven con nombres reales:
//   "Liga CML Central" → las tres primeras letras dan "LIG", y "liga" la
//   llevan todas, así que no distingue nada.
//   "Liga CML Central" y "Liga CML Norte" → quedarse con la primera palabra
//   útil da "CML" en las dos: dos ligas con el mismo escudo.
//
// Por eso se usan dos renglones cuando hay dos palabras que aportan.

const FILLER = /^(liga|league|la|el|los|las|de|del|the|of)$/i;

export function leagueEmblem(name: string): { top: string; bottom: string | null } {
  const words = (name ?? '').split(/\s+/).filter((w) => w && !FILLER.test(w));

  if (words.length === 0) return { top: (name ?? '?').slice(0, 3).toUpperCase(), bottom: null };
  if (words.length === 1) return { top: words[0].slice(0, 8).toUpperCase(), bottom: null };

  return {
    top: words[0].slice(0, 8).toUpperCase(),
    bottom: words[1].slice(0, 9).toUpperCase(),
  };
}

/**
 * Cuánto puede medir la letra del escudo sin salirse del hexágono.
 *
 * La palabra NO se recorta a cuatro letras: "PRUEBA" partido en "PRUE" no es un
 * escudo, es un error de dedo. Se encoge la tipografía en su lugar, que es lo
 * que hace un escudo real cuando el nombre es largo.
 */
export function emblemFont(text: string, base: number): number {
  const len = text.length;
  if (len <= 4) return base;
  if (len <= 6) return base - 2;
  if (len <= 7) return base - 3.5;
  return base - 5;
}
