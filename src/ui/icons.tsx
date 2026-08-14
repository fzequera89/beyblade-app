import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../theme';

// Iconos propios en SVG. No se usa librería de iconos a propósito: react-native-svg
// ya era dependencia, así que estos no cuestan nada nuevo y se pueden teñir según
// el estado (pestaña activa, rango del jugador, semántica de un resultado).

type P = { size?: number; color?: string };

export function IconHome({ size = 24, color = colors.inkSoft }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 10.5 12 3l9 7.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.5 9.5V20h13V9.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10 20v-5h4v5" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </Svg>
  );
}

// Espadas cruzadas: el símbolo de "batalla" en toda la app.
export function IconSwords({ size = 24, color = colors.inkSoft }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 4l10 10M4 4v3l9 9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 4L10 14M20 4v3l-9 9" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 17l3 3M10 17l-3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

// Podio de tres lugares — más específico que un trofeo para un ranking.
export function IconRanking({ size = 24, color = colors.inkSoft }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="9.5" y="6" width="5" height="14" rx="1" stroke={color} strokeWidth="1.8" />
      <Rect x="3" y="11" width="5" height="9" rx="1" stroke={color} strokeWidth="1.8" />
      <Rect x="16" y="13" width="5" height="7" rx="1" stroke={color} strokeWidth="1.8" />
      <Path d="M12 3.2l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7L9.5 5l1.7-.2z" fill={color} />
    </Svg>
  );
}

export function IconProfile({ size = 24, color = colors.inkSoft }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth="1.8" />
      <Path
        d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconBell({ size = 22, color = colors.inkSoft }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 10a5.5 5.5 0 1 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <Path d="M10 18.5a2 2 0 0 0 4 0" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function IconSearch({ size = 22, color = colors.inkSoft }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth="1.8" />
      <Path d="M16 16l4 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function IconPin({ size = 22, color = colors.inkSoft }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"
        stroke={color}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="10" r="2.5" stroke={color} strokeWidth="1.8" />
    </Svg>
  );
}

export function IconCalendar({ size = 22, color = colors.inkSoft }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="5.5" width="17" height="15" rx="2.5" stroke={color} strokeWidth="1.8" />
      <Path d="M3.5 10h17M8 3.5v4M16 3.5v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export function IconFlame({ size = 20, color = colors.streak }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 22c4 0 6.5-2.6 6.5-6 0-4.5-4.5-6-4-10.5C11 7 10 9 9 10.5 8.4 9.7 8 8.8 8 8c-1.7 1.6-2.5 3.8-2.5 6 0 3.4 2.5 6 6.5 6z"
        fill={color}
        fillOpacity="0.9"
      />
    </Svg>
  );
}

export function IconChevron({ size = 18, color = colors.inkDim }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 5l7 7-7 7" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
