import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// Registro de notificaciones push.
//
// **Todo aquí está protegido por plataforma.** `expo-notifications` es
// dependencia nativa y en el navegador no existe: si se importara arriba, el
// preview web —que es donde se hace todo el QA de este proyecto— dejaría de
// compilar. Por eso el import es dinámico y dentro del guardia.
//
// Tampoco funciona en Expo Go desde SDK 53: las push remotas exigen un build
// real. En el preview y en Expo Go esto simplemente no hace nada, sin ruido.

let yaRegistrado = false;

/**
 * Qué pasó en el último intento. Existe porque la primera prueba en aparato
 * real falló **en silencio**: el `catch` de aquí abajo está para que un fallo de
 * notificaciones nunca impida usar la app, pero eso mismo dejó sin rastro el
 * error. Un diagnóstico que solo se ve con la app conectada a un depurador no
 * sirve cuando el teléfono está en la mano de otra persona.
 */
export let estadoPush = 'sin intentar';

/**
 * El identificador del proyecto en EAS.
 *
 * En un build real `Constants.expoConfig` puede venir vacío —lo llena el
 * servidor de desarrollo, que ahí no existe— y entonces `getExpoPushTokenAsync`
 * revienta con "No projectId found". Por eso se busca en los dos lugares y se
 * pasa explícito, que es lo que Expo pide desde el SDK 49.
 */
function projectId(): string | undefined {
  const desdeConfig = (Constants.expoConfig as any)?.extra?.eas?.projectId;
  const desdeEas = (Constants as any)?.easConfig?.projectId;
  return desdeConfig ?? desdeEas;
}

export async function registerForPush(playerId: string | null): Promise<void> {
  if (!playerId || Platform.OS === 'web' || yaRegistrado) return;

  try {
    const Notifications = await import('expo-notifications');
    const Device = await import('expo-device');

    // Un emulador no tiene a dónde entregar: pedir permiso ahí solo asusta.
    if (!Device.isDevice) return;

    estadoPush = 'pidiendo permiso';
    const actual = await Notifications.getPermissionsAsync();
    let concedido = actual.granted;

    // Se pregunta UNA vez. Quien dijo que no, no vuelve a ver el diálogo: en
    // iOS ni siquiera aparecería, y en Android sería insistir.
    if (!concedido && actual.canAskAgain) {
      const pedido = await Notifications.requestPermissionsAsync();
      concedido = pedido.granted;
    }
    if (!concedido) {
      estadoPush = 'permiso denegado';
      return;
    }

    // En Android el canal define cómo suena y vibra. Sin canal, el sistema
    // entrega en silencio y parece que la notificación no llegó.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Combates y torneos',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const id = projectId();
    if (!id) {
      estadoPush = 'sin projectId en la configuración';
      return;
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    if (!token) {
      estadoPush = 'Expo no devolvió token';
      return;
    }

    // upsert por token: el mismo aparato puede cambiar de jugador si alguien
    // presta el teléfono, y el token tiene que quedar apuntando al último.
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { token, player_id: playerId, platform: Platform.OS, updated_at: new Date().toISOString() },
        { onConflict: 'token' }
      );

    if (error) {
      estadoPush = 'no se pudo guardar: ' + error.message;
      return;
    }

    estadoPush = 'registrado';
    yaRegistrado = true;
  } catch (e: any) {
    // Que fallen las notificaciones no puede impedir usar la app — pero sí tiene
    // que quedar dicho por qué fallaron.
    estadoPush = 'error: ' + (e?.message ?? String(e));
  }
}

/** Al cerrar sesión: este aparato deja de recibir los avisos de esa cuenta. */
export async function unregisterPush(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const Notifications = await import('expo-notifications');
    const id = projectId();
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      id ? { projectId: id } : undefined
    );
    if (token) await supabase.from('push_tokens').delete().eq('token', token);
    yaRegistrado = false;
  } catch {
    /* sin token que borrar */
  }
}

/**
 * Qué hacer cuando tocan la notificación. Devuelve la función de limpieza.
 *
 * El `data` del aviso lo arma la base (`push_outbox.data`), así que la pantalla
 * de destino se decide del lado del servidor: agregar un aviso nuevo no obliga a
 * publicar una versión de la app.
 */
export async function onNotificationTap(
  ir: (screen: string, params: Record<string, unknown>) => void
): Promise<() => void> {
  if (Platform.OS === 'web') return () => {};
  try {
    const Notifications = await import('expo-notifications');
    const sub = Notifications.addNotificationResponseReceivedListener((res: any) => {
      const data = res?.notification?.request?.content?.data ?? {};
      if (typeof data.screen === 'string') ir(data.screen, data);
    });
    return () => sub.remove();
  } catch {
    return () => {};
  }
}
