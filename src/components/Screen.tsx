import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <SafeAreaView style={[{ flex: 1 }, style]}>{children}</SafeAreaView>;
}
