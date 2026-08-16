import Svg, { Path, Circle, Ellipse, Defs, RadialGradient, LinearGradient, Stop, G, ClipPath, Rect } from 'react-native-svg';

// Avatares de personaje, dibujados en SVG.
//
// Son retratos estilizados, no ilustraciones: peso cero, escalan a cualquier
// tamaño y se tiñen solos. Están construidos por capas (fondo, hombros, cara,
// ojos, pelo) para que agregar un personaje sea definir un peinado y una paleta,
// no dibujar todo de nuevo.
//
// Si más adelante el cliente genera retratos ilustrados, se sustituye este
// catálogo por imágenes y el resto de la app no se entera: todo lo demás solo
// guarda la llave del avatar.

type Character = {
  key: string;
  name: string;
  skin: string;
  hair: string;
  hairAlt: string;
  accent: string;
  eyes: string;
  // Silueta del pelo. `back` va detrás de la cabeza, `front` es el fleco.
  back?: string;
  front: string;
};

export const CHARACTERS: Character[] = [
  {
    key: 'c1',
    name: 'Dran',
    skin: '#F2C9A8',
    hair: '#2E7DFF',
    hairAlt: '#1B4FB5',
    accent: '#2E7DFF',
    eyes: '#1B4FB5',
    // Pelo puntiagudo hacia arriba, tipo shonen.
    front:
      'M28 44 C26 26, 38 16, 50 16 C62 16, 74 26, 72 44 C70 36, 66 32, 62 34 C60 26, 54 24, 50 30 C46 22, 40 24, 38 32 C34 30, 30 34, 28 44 Z',
  },
  {
    key: 'c2',
    name: 'Hells',
    skin: '#E8B48D',
    hair: '#9B6BFF',
    hairAlt: '#6B3FC9',
    accent: '#9B6BFF',
    eyes: '#4A2A8A',
    // Melena larga con raya al centro.
    back: 'M22 46 C20 22, 34 12, 50 12 C66 12, 80 22, 78 46 L80 82 L68 78 L66 44 L34 44 L32 78 L20 82 Z',
    front: 'M28 42 C28 24, 38 16, 50 16 C62 16, 72 24, 72 42 C66 30, 58 26, 50 30 C42 26, 34 30, 28 42 Z',
  },
  {
    key: 'c3',
    name: 'Wizard',
    skin: '#C98A5E',
    hair: '#35C46A',
    hairAlt: '#1F7A4D',
    accent: '#35C46A',
    eyes: '#144A2E',
    // Corte bajo con flequillo recto.
    front: 'M27 44 C27 24, 37 15, 50 15 C63 15, 73 24, 73 44 C73 36, 70 32, 66 33 L34 33 C30 32, 27 36, 27 44 Z',
  },
  {
    key: 'c4',
    name: 'Knight',
    skin: '#F5D3B3',
    hair: '#F5A524',
    hairAlt: '#B87708',
    accent: '#F5A524',
    eyes: '#7A4E05',
    // Coleta alta.
    back: 'M62 22 C76 20, 84 32, 82 48 C81 60, 76 66, 70 66 C74 54, 72 38, 62 32 Z',
    front: 'M28 44 C26 24, 38 14, 50 14 C64 14, 74 24, 72 42 C64 32, 56 30, 48 32 C40 28, 32 32, 28 44 Z',
  },
  {
    key: 'c5',
    name: 'Shark',
    skin: '#D9A277',
    hair: '#F4525F',
    hairAlt: '#A81E2C',
    accent: '#F4525F',
    eyes: '#7A121C',
    // Melena revuelta, mechones hacia los lados.
    front:
      'M26 46 C24 24, 36 14, 50 14 C64 14, 76 24, 74 46 C70 38, 68 30, 62 32 C58 24, 52 26, 50 32 C46 24, 40 26, 38 32 C32 30, 28 38, 26 46 Z',
  },
  {
    key: 'c6',
    name: 'Leon',
    skin: '#8D5A3B',
    hair: '#4FD6C4',
    hairAlt: '#1E8C7E',
    accent: '#4FD6C4',
    eyes: '#0F5A50',
    // Melena voluminosa tipo león.
    back: 'M18 48 C14 22, 32 8, 50 8 C68 8, 86 22, 82 48 C80 62, 74 70, 68 70 C76 50, 72 28, 50 26 C28 28, 24 50, 32 70 C26 70, 20 62, 18 48 Z',
    front: 'M28 42 C28 24, 38 18, 50 18 C62 18, 72 24, 72 42 C66 32, 58 28, 50 30 C42 28, 34 32, 28 42 Z',
  },
  {
    key: 'c7',
    name: 'Viper',
    skin: '#F2C9A8',
    hair: '#FF7AC8',
    hairAlt: '#C13E90',
    accent: '#FF7AC8',
    eyes: '#8A1F5E',
    // Dos coletas.
    back: 'M20 30 C12 36, 12 54, 18 66 L28 62 C24 52, 26 40, 32 34 Z M80 30 C88 36, 88 54, 82 66 L72 62 C76 52, 74 40, 68 34 Z',
    front: 'M28 42 C28 22, 38 14, 50 14 C62 14, 72 22, 72 42 C68 32, 60 28, 50 34 C40 28, 32 32, 28 42 Z',
  },
  {
    key: 'c8',
    name: 'Phoenix',
    skin: '#E8B48D',
    hair: '#FF9455',
    hairAlt: '#C25A1C',
    accent: '#FF9455',
    eyes: '#8A3A0C',
    // Cresta hacia atrás, tipo llama.
    front:
      'M28 46 C24 28, 34 14, 50 14 C66 14, 78 24, 74 42 C72 34, 66 28, 60 30 C62 22, 56 18, 50 24 C44 18, 38 22, 40 30 C34 30, 30 36, 28 46 Z',
  },
  {
    key: 'c9',
    name: 'Wyvern',
    skin: '#C98A5E',
    hair: '#C3CDDD',
    hairAlt: '#7C8798',
    accent: '#C3CDDD',
    eyes: '#3A4454',
    // Corte al ras con fleco lateral.
    front: 'M27 42 C27 22, 38 15, 50 15 C63 15, 73 23, 73 42 C71 32, 64 28, 56 31 C48 26, 36 28, 27 42 Z',
  },
  {
    key: 'c10',
    name: 'Cobalt',
    skin: '#F5D3B3',
    hair: '#5BA8FF',
    hairAlt: '#2A6BC4',
    accent: '#5BA8FF',
    eyes: '#1B4A85',
    // Media melena hacia un lado.
    back: 'M24 44 C22 22, 36 12, 50 12 C66 12, 78 22, 76 46 L78 70 L68 66 L66 40 L34 42 L30 68 L22 70 Z',
    front: 'M28 42 C28 22, 40 14, 52 14 C64 14, 72 24, 72 40 C66 30, 56 28, 46 32 C38 30, 32 34, 28 42 Z',
  },
  {
    key: 'c11',
    name: 'Silver',
    skin: '#8D5A3B',
    hair: '#8CE05A',
    hairAlt: '#4A9427',
    accent: '#8CE05A',
    eyes: '#2A5A14',
    // Rapado con moño arriba.
    back: 'M44 12 C44 4, 56 4, 56 12 C60 14, 60 22, 50 22 C40 22, 40 14, 44 12 Z',
    front: 'M29 42 C29 26, 38 20, 50 20 C62 20, 71 26, 71 42 C69 34, 62 31, 50 31 C38 31, 31 34, 29 42 Z',
  },
  {
    key: 'c12',
    name: 'Tyranno',
    skin: '#D9A277',
    hair: '#E7B23C',
    hairAlt: '#9C7208',
    accent: '#E7B23C',
    eyes: '#6B4E05',
    // Flequillo largo que cae sobre un ojo.
    front:
      'M27 46 C25 24, 37 14, 50 14 C64 14, 75 24, 73 44 C70 34, 64 30, 58 32 C52 40, 44 44, 38 42 C34 40, 30 42, 27 46 Z',
  },
];

export function characterOf(key?: string | null): Character {
  return CHARACTERS.find((c) => c.key === key) ?? CHARACTERS[0];
}

export function CharacterAvatar({ avatarKey, size }: { avatarKey?: string | null; size: number }) {
  const c = characterOf(avatarKey);
  const id = `ch-${c.key}`;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={`${id}-bg`} cx="50%" cy="30%" r="80%">
          <Stop offset="0%" stopColor={c.accent} stopOpacity="0.55" />
          <Stop offset="70%" stopColor={c.accent} stopOpacity="0.12" />
          <Stop offset="100%" stopColor="#05070C" stopOpacity="1" />
        </RadialGradient>
        <LinearGradient id={`${id}-hair`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={c.hair} />
          <Stop offset="100%" stopColor={c.hairAlt} />
        </LinearGradient>
        <LinearGradient id={`${id}-cloth`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={c.hairAlt} stopOpacity="0.9" />
          <Stop offset="100%" stopColor="#05070C" stopOpacity="0.9" />
        </LinearGradient>
        {/* Recorta todo al círculo: sin esto los hombros se salen del avatar. */}
        <ClipPath id={`${id}-clip`}>
          <Circle cx="50" cy="50" r="50" />
        </ClipPath>
      </Defs>

      <G clipPath={`url(#${id}-clip)`}>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${id}-bg)`} />

        {/* Pelo de atrás */}
        {c.back ? <Path d={c.back} fill={`url(#${id}-hair)`} /> : null}

        {/* Hombros y cuello */}
        <Path d="M14 100 C16 80, 32 71, 50 71 C68 71, 84 80, 86 100 Z" fill={`url(#${id}-cloth)`} />
        <Path d="M43 60 L57 60 L57 74 L43 74 Z" fill={c.skin} />

        {/* Cara */}
        <Ellipse cx="50" cy="46" rx="21" ry="24" fill={c.skin} />
        {/* Sombra suave del pelo sobre la frente */}
        <Ellipse cx="50" cy="34" rx="21" ry="11" fill={c.hairAlt} fillOpacity="0.12" />

        {/* Cejas */}
        <Path d={`M39 43 L47 41`} stroke={c.hairAlt} strokeWidth="2" strokeLinecap="round" />
        <Path d={`M61 43 L53 41`} stroke={c.hairAlt} strokeWidth="2" strokeLinecap="round" />

        {/* Ojos grandes, con brillo: es lo que da la lectura anime */}
        <Ellipse cx="42" cy="50" rx="4.4" ry="5.6" fill="#FFFFFF" />
        <Ellipse cx="58" cy="50" rx="4.4" ry="5.6" fill="#FFFFFF" />
        <Ellipse cx="42.4" cy="50.6" rx="3" ry="4.2" fill={c.eyes} />
        <Ellipse cx="58.4" cy="50.6" rx="3" ry="4.2" fill={c.eyes} />
        <Circle cx="43.6" cy="48.6" r="1.3" fill="#FFFFFF" />
        <Circle cx="59.6" cy="48.6" r="1.3" fill="#FFFFFF" />

        {/* Boca */}
        <Path d="M46 60 Q50 63, 54 60" stroke={c.hairAlt} strokeWidth="1.8" strokeLinecap="round" fill="none" />

        {/* Fleco, hasta arriba para que caiga sobre la cara */}
        <Path d={c.front} fill={`url(#${id}-hair)`} />
      </G>

      <Circle cx="50" cy="50" r="49" fill="none" stroke={c.accent} strokeOpacity="0.35" strokeWidth="2" />
    </Svg>
  );
}
