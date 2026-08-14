import { View, Text, Pressable, StyleSheet } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BeyMark } from '../ui/Logo';
import { Hex } from '../ui/primitives';
import { IconHome, IconSwords, IconRanking, IconProfile } from '../ui/icons';
import { colors, space } from '../theme';

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
      {/* El hexágono se dibuja entero en SVG y su relleno opaco ya tapa la línea
          de la barra por detrás. Antes tenía un fondo cuadrado para eso y se
          notaba como un recuadro negro. */}
      <View style={styles.playHex}>
        <Hex size={62} color={focused ? colors.blueHi : colors.blue} solid>
          <BeyMark size={30} color={focused ? colors.blueHi : colors.blue} />
        </Hex>
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
  playHex: { marginTop: -28 },
  playLabel: { color: colors.blue, marginTop: 2 },
});
