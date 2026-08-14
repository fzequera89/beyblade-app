// Sistema de diseño — Beyblade League
//
// Fuente: las pantallas propuestas por el cliente (dirección azul).
// Todo color, tamaño y espacio de la app sale de aquí. Antes había 329 colores
// escritos a mano en 34 pantallas; si algo necesita un color nuevo, se agrega
// a este archivo, no a la pantalla.
//
// La app es SOLO OSCURA por decisión de identidad, no por omisión: el negro es
// el fondo del estadio y hace que el azul brille. No hay tema claro.

export const colors = {
  // Fondos, del más profundo al más elevado
  bg: '#04060C',
  surface: '#0A0F1A',
  card: '#101827',
  cardHi: '#16203247',

  // Líneas
  line: '#1B2434',
  lineHi: '#26344A',

  // Azul de marca. `glow` es el halo, siempre detrás de algo, nunca como relleno.
  blue: '#2E7DFF',
  blueHi: '#5B9AFF',
  blueDeep: '#0E2A5E',
  glow: 'rgba(46,125,255,0.35)',

  // Texto
  ink: '#EDF2FA',
  inkSoft: '#8A97AC',
  inkDim: '#556076',

  // Semánticos. NO se usan para decorar: cada uno significa algo.
  win: '#35C46A',
  winSoft: '#0F2A1B',
  loss: '#F4525F',
  lossSoft: '#2C1218',
  streak: '#F5A524',
  streakSoft: '#2A1F0B',
  elite: '#9B6BFF',
  eliteSoft: '#1C1430',
} as const;

// Rangos de la liga. El orden es el del reglamento de la Dark Masters League,
// de menor a mayor. Contender es el top 5 global y por eso va aparte.
export const RANKS = [
  { key: 'porcelana', label: 'Porcelana', color: '#B8C4D9' },
  { key: 'hierro', label: 'Hierro', color: '#8C93A1' },
  { key: 'bronce', label: 'Bronce', color: '#C77B45' },
  { key: 'plata', label: 'Plata', color: '#C3CDDD' },
  { key: 'oro', label: 'Oro', color: '#E7B23C' },
  { key: 'platino', label: 'Platino', color: '#4FD6C4' },
  { key: 'diamante', label: 'Diamante', color: '#5BA8FF' },
  { key: 'challenger', label: 'Challenger', color: '#9B6BFF' },
] as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

// Tipografía. La itálica pesada en los titulares es la firma de la identidad:
// comunica movimiento, que es de lo que trata un beyblade. No es decorativa —
// si se quita, la app deja de sentirse del producto.
export const type = {
  display: {
    fontSize: 30,
    fontWeight: '800' as const,
    fontStyle: 'italic' as const,
    letterSpacing: -0.8,
    color: colors.ink,
  },
  title: {
    fontSize: 22,
    fontWeight: '800' as const,
    fontStyle: 'italic' as const,
    letterSpacing: -0.4,
    color: colors.ink,
  },
  section: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: colors.ink,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    color: colors.ink,
  },
  soft: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: colors.inkSoft,
  },
  // Etiquetas en versalitas: rangos, encabezados de dato, pestañas.
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: colors.inkSoft,
  },
  // Para números que se comparan en columna (ELO, marcador, posiciones).
  stat: {
    fontSize: 26,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    color: colors.ink,
  },
} as const;

// El glow es la textura de la marca. Se aplica al elemento activo de una
// pantalla, nunca a varios: si todo brilla, nada destaca.
export const glow = (color: string = colors.blue, radiusPx = 16) => ({
  shadowColor: color,
  shadowOpacity: 0.55,
  shadowRadius: radiusPx,
  shadowOffset: { width: 0, height: 0 },
  elevation: 8,
});
