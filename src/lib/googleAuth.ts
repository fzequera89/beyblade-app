import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

// Entrar con Google.
//
// Son DOS flujos, no uno con un detalle distinto, y por eso vive aquí en vez de
// repetido en las dos pantallas de acceso:
//
//   · En teléfono se abre un navegador de sesión encima de la app, Google vuelve
//     a `beybladeapp://auth/callback` y la app cambia el código por la sesión a
//     mano. La app nunca se cierra.
//   · En web NO hay ventana emergente: la página entera se va a Google y
//     regresa. Un popup lo bloquea el navegador la mitad de las veces, y el
//     regreso a una pestaña hija que tiene que hablar con la madre falla en
//     cuanto el navegador aísla orígenes. La página completa siempre funciona.
//
// El canje del código lo hace supabase-js solo en web (`detectSessionInUrl`),
// porque la sesión llega en la URL con la que arranca la app.

export type ResultadoGoogle = { ok: boolean; error?: string; cancelado?: boolean };

export async function entrarConGoogle(): Promise<ResultadoGoogle> {
  if (Platform.OS === 'web') {
    // Sin `skipBrowserRedirect`: queremos justamente que se vaya la página.
    // `window.location.origin` sirve igual en localhost que en producción, y es
    // lo que hay que tener permitido en Supabase → URL Configuration.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    // Si no hubo error el navegador ya se está yendo; lo que devolvamos aquí
    // casi nunca llega a pintarse.
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.url) return { ok: false, error: 'Google no devolvió a dónde ir.' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  // Cerrar el navegador a medias no es un error: es alguien que se arrepintió.
  if (result.type !== 'success' || !result.url) return { ok: false, cancelado: true };

  const { queryParams } = Linking.parse(result.url);
  const code = queryParams?.code;

  // Google devuelve el motivo en la URL cuando algo se le atraviesa —consentimiento
  // denegado, cliente mal configurado—. Sin esto solo veríamos "no hay código".
  const motivo = queryParams?.error_description ?? queryParams?.error;
  if (motivo) return { ok: false, error: String(motivo) };

  // `exchangeCodeForSession` recibe el CÓDIGO, no la URL entera. Pasarle la URL
  // no falla en la llamada: falla después, sin sesión y sin explicación.
  if (typeof code !== 'string') {
    return { ok: false, error: 'Google volvió sin código de acceso.' };
  }

  const { error: errorCanje } = await supabase.auth.exchangeCodeForSession(code);
  return errorCanje ? { ok: false, error: errorCanje.message } : { ok: true };
}
