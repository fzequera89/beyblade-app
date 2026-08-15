import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { supabase } from './supabase';

// Portadas de lo que se crea en la app: ligas, torneos, eventos, clubes.
//
// Apaisada (16:9) porque así se ve en la lista y en el detalle. Vive aquí y no
// en una pantalla porque la usan varias, y el día que cambie la calidad o el
// recorte tiene que cambiar en un solo lugar.

export type CoverKind = 'league' | 'tournament' | 'event' | 'club';

export async function pickCoverPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Sin permiso', 'Necesitamos acceso a tus fotos para poner la portada.');
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

/**
 * Ruta fija <tipo>/<id>/cover.jpg: cambiar la portada pisa la anterior en vez
 * de acumular archivos que nadie va a borrar, y el tipo mantiene separadas las
 * de cada cosa para poder limpiar sin adivinar.
 */
export async function uploadCover(kind: CoverKind, id: string, uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const bytes = await response.arrayBuffer();
    const path = `${kind}/${id}/cover.jpg`;
    const { error } = await supabase.storage
      .from('covers')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;

    const { data } = supabase.storage.from('covers').getPublicUrl(path);
    // El sufijo fuerza a refrescar la caché: la ruta no cambió.
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (e: any) {
    Alert.alert('No se pudo subir la foto', `${e.message ?? e}. Se queda la portada dibujada.`);
    return null;
  }
}
