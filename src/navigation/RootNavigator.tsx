import { useEffect, useRef } from 'react';
import { NavigationContainer, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import SignInScreen from '../screens/SignInScreen';
import SignUpScreen from '../screens/SignUpScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import TabNavigator from './TabNavigator';
import { onNotificationTap } from '../lib/push';
import { colors } from '../theme';

const Stack = createNativeStackNavigator();

// Tocar una notificación tiene que llevar al combate, no solo abrir la app. La
// navegación se dispara desde fuera de un componente —el aviso puede llegar con
// la app cerrada—, y para eso hace falta la referencia del contenedor.
export const navigationRef = createNavigationContainerRef();

// Sin esto, React Navigation pinta su tema claro (#f2f2f2) detrás de cada
// pantalla y se ve un destello blanco en cada transición.
const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    text: colors.ink,
    border: colors.line,
    primary: colors.blue,
  },
};

// Tres estados, no tres pantallas: sin sesión, con sesión pero sin perfil, y
// dentro. El onboarding no se puede saltar porque no está registrado en el
// tercer estado — no hay ruta que lleve a él una vez completado.
export default function RootNavigator() {
  const { session, hasPlayer, loading } = useAuth();
  const limpiar = useRef<() => void>(() => {});

  useEffect(() => {
    // La pantalla de destino la manda el servidor en `data.screen`, así que un
    // aviso nuevo no obliga a publicar una versión de la app.
    onNotificationTap((screen, params) => {
      if (!navigationRef.isReady()) return;
      // El destino vive dentro de las pilas de pestañas, así que se navega a
      // Main con la pantalla anidada como parámetro.
      (navigationRef.navigate as any)('Main', { screen, params });
    }).then((off) => {
      limpiar.current = off;
    });
    return () => limpiar.current();
  }, []);

  if (loading || (session && hasPlayer === null)) {
    return null;
  }

  return (
    <NavigationContainer theme={theme} ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
      >
        {!session ? (
          <>
            <Stack.Screen name="SignIn" component={SignInScreen} />
            <Stack.Screen name="SignUp" component={SignUpScreen} />
          </>
        ) : !hasPlayer ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <Stack.Screen name="Main" component={TabNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
