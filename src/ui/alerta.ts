import { Alert, Platform } from 'react-native';

// Diálogos que SÍ aparecen en la web.
//
// `react-native-web` implementa `Alert` así, literalmente:
//
//     class Alert { static alert() {} }
//
// Una función vacía. En el navegador, cada aviso de la app —155 repartidos en
// 41 pantallas— no hacía absolutamente nada: ni los errores ni las
// confirmaciones. Y como una confirmación cancelada es indistinguible de una
// que nunca se mostró, el efecto era "el botón no hace nada", que es justo lo
// que fue apareciendo durante el QA.
//
// En teléfono se usa el diálogo nativo de siempre. En web se cae a los del
// navegador: son feos, pero existen — y existir es toda la diferencia.

export type BotonAlerta = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export function alerta(titulo: string, mensaje?: string, botones?: BotonAlerta[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(titulo, mensaje, botones as any);
    return;
  }

  const texto = [titulo, mensaje].filter(Boolean).join('\n\n');
  const accionables = (botones ?? []).filter((b) => b.style !== 'cancel');
  const cancelar = (botones ?? []).find((b) => b.style === 'cancel');

  // Solo informa: no hay nada que decidir.
  if (accionables.length === 0) {
    window.alert(texto);
    botones?.[0]?.onPress?.();
    return;
  }

  // Una acción y su cancelación: es exactamente un confirm.
  if (accionables.length === 1) {
    if (window.confirm(texto)) accionables[0].onPress?.();
    else cancelar?.onPress?.();
    return;
  }

  // Varias acciones. El navegador no tiene diálogo de tres botones, así que se
  // preguntan en orden. Es tosco a propósito: la alternativa era que en web no
  // pasara nada, que es lo que estaba pasando.
  for (const b of accionables) {
    if (window.confirm(`${texto}\n\n¿${b.text}?`)) {
      b.onPress?.();
      return;
    }
  }
  cancelar?.onPress?.();
}
