import { useState } from 'react';
import { Text, View, Pressable, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

export default function ScanCheckInScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleScan(data: string) {
    if (scanned || busy) return;
    setScanned(true);
    setBusy(true);
    const { data: venue, error } = await supabase
      .from('venues')
      .select('id, name')
      .eq('qr_code', data)
      .maybeSingle();
    if (error || !venue) {
      Alert.alert('QR no reconocido', 'Este código no corresponde a ningún venue registrado.', [
        { text: 'OK', onPress: () => setScanned(false) },
      ]);
      setBusy(false);
      return;
    }
    const { error: insertError } = await supabase
      .from('check_ins')
      .insert({ player_id: playerId, venue_id: venue.id });
    setBusy(false);
    if (insertError) {
      Alert.alert('Error', insertError.message, [{ text: 'OK', onPress: () => setScanned(false) }]);
      return;
    }
    Alert.alert('Check-in hecho', `Quedaste registrado en ${venue.name}.`, [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  if (!permission) {
    return (
      <Screen style={styles.center}>
        <Text>Cargando permisos…</Text>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen style={styles.center}>
        <Text style={styles.message}>Necesitamos permiso de cámara para escanear el QR.</Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Dar permiso</Text>
        </Pressable>
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Cancelar</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : ({ data }) => handleScan(data)}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayText}>Apunta al código QR del venue</Text>
        <Pressable style={styles.back} onPress={() => navigation.goBack()}>
          <Text style={styles.overlayBack}>‹ Cancelar</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16, backgroundColor: '#fff' },
  message: { textAlign: 'center', color: '#333' },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 14, alignItems: 'center', width: '100%' },
  buttonText: { color: '#fff', fontWeight: '600' },
  back: { marginTop: 8 },
  backText: { color: '#6b6b64' },
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    gap: 8,
  },
  overlayText: { color: '#fff', fontWeight: '600' },
  overlayBack: { color: '#fff' },
});
