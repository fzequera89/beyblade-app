import { useState } from 'react';
import { Text, View, Pressable, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Hex } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';

// Marco de escaneo: cuatro esquinas en vez de un recuadro completo. Deja ver el
// código entero y dice dónde apuntar sin taparlo.
function Reticle({ size = 240 }: { size?: number }) {
  const c = 34;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {[
        `M2 ${c} L2 2 L${c} 2`,
        `M${100 - c} 2 L98 2 L98 ${c}`,
        `M98 ${100 - c} L98 98 L${100 - c} 98`,
        `M${c} 98 L2 98 L2 ${100 - c}`,
      ].map((d, i) => (
        <Path key={i} d={d} stroke={colors.blue} strokeWidth="3" fill="none" strokeLinecap="round" />
      ))}
    </Svg>
  );
}

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
        { text: 'Reintentar', onPress: () => setScanned(false) },
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

    Alert.alert('¡Check-in hecho!', `Quedaste registrado en ${venue.name}. Los demás ya te ven aquí.`, [
      { text: 'Listo', onPress: () => navigation.goBack() },
    ]);
  }

  if (!permission) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={type.soft}>Cargando permisos…</Text>
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <View style={styles.center}>
          <Hex size={86} color={colors.blue}>
            <Text style={{ fontSize: 30 }}>📷</Text>
          </Hex>
          <Text style={styles.title}>Necesitamos la cámara</Text>
          <Text style={styles.help}>
            Es para leer el código QR del venue y registrar que llegaste. No se guarda ninguna imagen.
          </Text>
          <Button label="DAR PERMISO" onPress={requestPermission} />
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.cancel}>Cancelar</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : ({ data }) => handleScan(data)}
      />

      <View style={[StyleSheet.absoluteFill, styles.frame]} pointerEvents="none">
        <Reticle />
      </View>

      <View style={styles.top} pointerEvents="none">
        <Text style={styles.topText}>
          {busy ? 'Registrando tu llegada…' : 'Apunta al código QR del venue'}
        </Text>
      </View>

      <View style={styles.bottom}>
        <Pressable style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelBtnText}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, paddingHorizontal: space.xl },
  title: { ...type.display, fontSize: 22, textAlign: 'center' },
  help: { ...type.soft, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  cancel: { color: colors.inkSoft, fontSize: 13 },

  frame: { alignItems: 'center', justifyContent: 'center' },
  top: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  topText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(4,6,12,0.75)',
    paddingVertical: 10,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  bottom: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  cancelBtn: {
    backgroundColor: 'rgba(4,6,12,0.8)',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingVertical: 12,
    paddingHorizontal: space.xxl,
  },
  cancelBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
