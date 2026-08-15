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
  if (words.length === 1) return { top: words[0].slice(0, 4).toUpperCase(), bottom: null };

  return {
    top: words[0].slice(0, 4).toUpperCase(),
    bottom: words[1].slice(0, 7).toUpperCase(),
  };
}
