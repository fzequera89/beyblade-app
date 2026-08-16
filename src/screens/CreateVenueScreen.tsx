import { useState } from 'react';
import { Text, View, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card, Hex } from '../ui/primitives';
import { IconPin } from '../ui/icons';
import { colors, space, type } from '../theme';

// La ciudad se normaliza igual que en el perfil: el matchmaking la compara
// letra por letra, así que "monterrey " y "Monterrey" serían lugares distintos.
function normalizeCity(v: string) {
  return v
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

export default function CreateVenueScreen({ navigation }: any) {
  const [form, setForm] = useState({ name: '', address: '', city: '' });
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!form.name.trim()) {
      alerta('Falta el nombre', 'Ponle el nombre del lugar.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('venues')
      .insert({
        name: form.name.trim(),
        address: form.address.trim() || null,
        city: form.city.trim() ? normalizeCity(form.city) : null,
        // El código del QR se genera aquí y es único: es lo que se escanea
        // para hacer check-in.
        qr_code: `venue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })
      .select('id')
      .single();
    setLoading(false);
    if (error) return alerta('No se pudo crear', error.message);
    navigation.replace('VenueDetail', { venueId: data.id });
  }

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Nueva locación</Text>
      </View>

      <View style={styles.hero}>
        <Hex size={72} color={colors.blue}>
          <IconPin size={26} color={colors.blue} />
        </Hex>
        <Text style={styles.lead}>
          Un venue es un lugar donde se batalla: una tienda, un club, una plaza. Al crearlo se genera
          su código QR para los check-ins.
        </Text>
      </View>

      <View style={styles.form}>
        <Field
          label="Nombre del lugar"
          placeholder="Hobby Center Cumbres"
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
        />
        <Field
          label="Dirección"
          placeholder="Av. Paseo de los Leones 2500"
          value={form.address}
          onChangeText={(v) => setForm({ ...form, address: v })}
        />
        <Field
          label="Ciudad"
          placeholder="Monterrey"
          value={form.city}
          onChangeText={(v) => setForm({ ...form, city: v })}
          hint="Con ella aparece para los bladers de esa ciudad."
        />

        <Button label="CREAR VENUE" onPress={create} loading={loading} />
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={{ alignSelf: 'center' }}>
          <Text style={styles.cancel}>Cancelar</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  hero: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  lead: { ...type.soft, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  form: { gap: space.lg },
  cancel: { color: colors.inkSoft, fontSize: 13 },
});
