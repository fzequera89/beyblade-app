import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from './supabase';

// Selección y subida de la foto de perfil. Vive aquí y no en una pantalla
// porque lo usan dos: el onboarding y la edición de perfil.

export async function pickAvatarPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Sin permiso', 'Necesitamos acceso a tus fotos para poner tu avatar.');
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0].uri;
}

// La ruta siempre es <uid>/avatar.jpg: la política de Storage exige que la
// primera carpeta sea el uid, y el nombre fijo evita acumular archivos viejos
// cada vez que alguien cambia su foto.
export async function uploadAvatar(userId: string, uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const bytes = await response.arrayBuffer();
    const path = `${userId}/avatar.jpg`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // El sufijo obliga a refrescar la caché: sin él, la foto nueva no se ve
    // porque la ruta no cambió.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (e: any) {
    Alert.alert('No se pudo subir la foto', `${e.message ?? e}. Se usará tu avatar de la app.`);
    return null;
  }
}
