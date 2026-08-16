import { useState } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { Field } from './Field';
import { colors, space, radius } from '../theme';

// Campo de fecha.
//
// En teléfono abre el calendario del sistema; en web se queda como texto. No es
// pereza: `@react-native-community/datetimepicker` es una dependencia NATIVA y
// en el navegador no existe, así que importarlo arriba tumbaría el preview web
// —que es donde se hace todo el QA de este proyecto—. Por eso el import es
// dinámico y solo ocurre del lado donde el módulo existe.
//
// El formato de intercambio sigue siendo AAAA-MM-DD en los dos casos: lo que
// cambia es cómo se escribe, no lo que se guarda.

function aTexto(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function aFecha(texto: string): Date {
  const [y, m, d] = (texto || '').split('-').map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function DateField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  hint?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [Picker, setPicker] = useState<any>(null);

  if (Platform.OS === 'web') {
    return (
      <Field
        label={label}
        placeholder="2026-09-27"
        value={value}
        onChangeText={onChange}
        hint={hint}
      />
    );
  }

  async function abrir() {
    if (!Picker) {
      const mod: any = await import('@react-native-community/datetimepicker');
      setPicker(() => mod?.default ?? mod);
    }
    setAbierto(true);
  }

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>

      <Pressable style={styles.caja} onPress={abrir}>
        <Text style={[styles.valor, !value && { color: colors.inkDim }]}>
          {value || 'Elegir fecha'}
        </Text>
        <Text style={styles.glifo}>📅</Text>
      </Pressable>

      {hint ? <Text style={styles.hint}>{hint}</Text> : null}

      {abierto && Picker ? (
        <Picker
          value={aFecha(value)}
          mode="date"
          display="calendar"
          onChange={(_: any, elegida?: Date) => {
            // En Android el diálogo se cierra solo, y cancelar no trae fecha.
            setAbierto(false);
            if (elegida) onChange(aTexto(elegida));
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  valor: { fontSize: 14, color: colors.ink },
  glifo: { fontSize: 16 },
  hint: { fontSize: 11, color: colors.inkDim, lineHeight: 16 },
});
