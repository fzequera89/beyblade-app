import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // En web, Google devuelve a la app con el código en la URL y supabase-js lo
    // canjea solo al arrancar. En teléfono no hay URL de arranque —la app ya
    // estaba abierta— y el canje lo hace `entrarConGoogle` a mano; dejarlo
    // encendido ahí solo haría buscar algo que nunca va a estar.
    detectSessionInUrl: Platform.OS === 'web',
    flowType: 'pkce',
  },
});
