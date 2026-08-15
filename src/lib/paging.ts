// Paginación de listas.
//
// **12 no es un número redondo cualquiera.** Las filas de esta app miden entre
// 72 y 88 pt (un avatar de 40 con su padding), y el área visible de una lista
// ronda los 600 pt una vez descontadas la cabecera y la barra de pestañas: caben
// 7 u 8. Doce es una pantalla y media, que es justo lo que se pidió: se ve que
// la lista sigue, pero el botón de "ver más" queda al alcance sin volverse un
// scroll infinito donde nadie llega al final.
//
// Es a propósito que NO haya carga automática al llegar abajo. Un ranking que se
// alarga solo mientras lo lees no deja saber en qué lugar vas, y el pulgar nunca
// alcanza el final.

export const PAGE_SIZE = 12;

/** El rango que le toca a la página N (0-indexada), para `.range()` de Supabase. */
export function pageRange(page: number): [number, number] {
  const from = page * PAGE_SIZE;
  return [from, from + PAGE_SIZE - 1];
}

/**
 * Cuántos elementos se piden hasta la página N inclusive.
 *
 * Al refrescar una lista ya expandida hay que volver a traer TODO lo que estaba
 * a la vista, no solo la última página: si no, al recargar se encoge sola y el
 * jugador pierde el lugar donde iba.
 */
export function upToPage(page: number): [number, number] {
  return [0, (page + 1) * PAGE_SIZE - 1];
}
