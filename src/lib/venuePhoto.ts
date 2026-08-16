import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { alerta } from '../ui/alerta';
import { supabase } from './supabase';

// Foto de una locación. Mismo patrón que la foto de perfil (lib/avatar.ts),
// pero apaisada: la portada se ve en formato 16:9 en la lista y en el detalle.

export async function pickVenuePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    alerta('Sin permiso', 'Necesitamos acceso a tus fotos para poner la portada del lugar.');
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [16, 9],
    quality: 0.7,
  });
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0].uri;
}

// Ruta fija <venueId>/cover.jpg: cambiar la foto pisa la anterior en vez de
// acumular archivos que nadie va a borrar.
export async function uploadVenuePhoto(venueId: string, uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const bytes = await response.arrayBuffer();
    const path = `${venueId}/cover.jpg`;
    const { error } = await supabase.storage
      .from('venues')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from('venues').getPublicUrl(path);
    // El sufijo fuerza a refrescar la caché: la ruta no cambió.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (e: any) {
    alerta('No se pudo subir la foto', `${e.message ?? e}. El lugar se queda con su arena generada.`);
    return null;
  }
}
