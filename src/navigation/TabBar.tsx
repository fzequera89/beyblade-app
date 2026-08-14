import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polygon, Defs, LinearGradient, Stop } from 'react-native-svg';
import { BeyMark } from '../ui/Logo';
import { IconHome, IconSwords, IconRanking, IconProfile } from '../ui/icons';
import { colors, space, glow } from '../theme';

// Barra de pestañas propia en vez de la de serie.
//
// El motivo es el botón central: "Play" no es una pestaña más, es LA acción de
// la app — encontrar con quién batallar. Va elevado, en hexágono y con glow,
// porque debe leerse como botón antes que como pestaña. Eso no se consigue
// configurando la barra por defecto.

const ICONS: Record<string, (p: { color: string }) => React.ReactElement> = {
  Inicio: ({ color }) => <IconHome color={color} size={23} />,
  Batallas: ({ color }) => <IconSwords color={color} size={23} />,
  Rankings: ({ color }) => <IconRanking color={color} size={23} />,
  Perfil: ({ color }) => <IconProfile color={color} size={23} />,
};

function PlayButton({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.playWrap}
      accessibilityRole="button"
      accessibilityLabel="Play"
      accessibilityState={{ selected: focused }}
    >
      <View style={[styles.playHex, glow(colors.blue, focused ? 22 : 12)]}>
        <Svg width={62} height={66} viewBox="0 0 100 108" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="playfill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.blue} stopOpacity={focused ? '0.42' : '0.22'} />
              <Stop offset="100%" stopColor={colors.blue} stopOpacity="0.06" />
            </LinearGradient>
          </Defs>
          <Polygon
            points="50,3 94,28 94,80 50,105 6,80 6,28"
            fill="url(#playfill)"
            stroke={colors.blue}
            strokeWidth="3"
          />
        </Svg>
        <BeyMark size={30} color={focused ? colors.blueHi : colors.blue} />
      </View>
      <Text style={[styles.label, styles.playLabel]}>PLAY</Text>
    </Pressable>
  );
}

export default function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const color = focused ? colors.blue : colors.inkDim;

        const go = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        if (route.name === 'Play') {
          return <PlayButton key={route.key} focused={focused} onPress={go} />;
        }

        const Icon = ICONS[route.name];
        return (
          <Pressable
            key={route.key}
            onPress={go}
            style={styles.tab}
            accessibilityRole="button"
            accessibilityLabel={route.name}
            accessibilityState={{ selected: focused }}
          >
            {Icon ? <Icon color={color} /> : null}
            <Text style={[styles.label, { color }]}>{route.name.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: space.sm,
    paddingHorizontal: space.xs,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  playWrap: { flex: 1, alignItems: 'center', gap: 2 },
  // El hexágono sobresale de la barra: es lo que lo convierte en botón.
  playHex: {
    width: 62,
    height: 66,
    marginTop: -28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderRadius: 8,
  },
  playLabel: { color: colors.blue, marginTop: 2 },
});
