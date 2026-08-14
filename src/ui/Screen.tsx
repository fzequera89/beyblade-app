import { ReactNode } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import { colors, space } from '../theme';

// Fondo de la app. El halo azul detrás del contenido es lo que evita que el
// negro se sienta plano; es sutil a propósito, se nota sin mirarlo.
function Halo() {
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="halo" cx="50%" cy="0%" r="70%">
          <Stop offset="0%" stopColor={colors.blue} stopOpacity="0.16" />
          <Stop offset="60%" stopColor={colors.blue} stopOpacity="0.03" />
          <Stop offset="100%" stopColor={colors.bg} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#halo)" />
    </Svg>
  );
}

export default function Screen({
  children,
  scroll = false,
  padded = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const inner = padded ? [styles.pad, style] : style;

  return (
    <View style={styles.root}>
      <Halo />
      <SafeAreaView style={styles.safe}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.scroll, inner]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.flex, inner]}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: space.xxxl },
  pad: { paddingHorizontal: space.xl },
});
