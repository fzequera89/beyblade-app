import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { pickAvatarPhoto, uploadAvatar } from '../lib/avatar';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { AvatarPicker } from '../ui/Avatar';
import { Card, Checkbox, OptionCard } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';

const EXPERIENCE = [
  { key: 'rookie', glyph: '🌱', title: 'Rookie' },
  { key: 'blader', glyph: '🌀', title: 'Blader' },
  { key: 'pro', glyph: '⚡', title: 'Pro' },
  { key: 'elite', glyph: '👑', title: 'Elite' },
];

function normalizeCity(v: string) {
  return v
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

export default function EditProfileScreen({ navigation }: any) {
  const { session, playerId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [avatarKey, setAvatarKey] = useState('a1');
  const [savedPhoto, setSavedPhoto] = useState<string | null>(null);
  const [newPhoto, setNewPhoto] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    city: '',
    country: '',
    mainBeyblade: '',
    playStyle: '',
  });
  const [experience, setExperience] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(true);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('players')
      .select(
        'display_name, city, country, main_beyblade, play_style, avatar_key, avatar_url, experience_level, notifications_enabled'
      )
      .eq('id', playerId)
      .single();
    setLoading(false);
    if (error || !data) return;

    setForm({
      name: data.display_name ?? '',
      city: data.city ?? '',
      country: data.country ?? '',
      mainBeyblade: data.main_beyblade ?? '',
      playStyle: data.play_style ?? '',
    });
    setAvatarKey(data.avatar_key ?? 'a1');
    setSavedPhoto(data.avatar_url ?? null);
    setExperience(data.experience_level ?? null);
    setNotifications(data.notifications_enabled ?? true);
  }, [playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function choosePhoto() {
    const uri = await pickAvatarPhoto();
    if (uri) setNewPhoto(uri);
  }

  async function save() {
    if (!form.name.trim()) return alerta('Falta tu nombre', 'No puedes quedarte sin nombre de blader.');
    if (!form.city.trim()) return alerta('Falta tu ciudad', 'La usamos para encontrarte rivales cerca.');

    setSaving(true);
    // Solo se sube si eligió una foto nueva en esta sesión de edición.
    const uploaded = newPhoto ? await uploadAvatar(session!.user.id, newPhoto) : undefined;

    const { error } = await supabase
      .from('players')
      .update({
        display_name: form.name.trim(),
        city: normalizeCity(form.city),
        country: form.country.trim() || null,
        main_beyblade: form.mainBeyblade.trim() || null,
        play_style: form.playStyle.trim() || null,
        avatar_key: avatarKey,
        // undefined deja el valor anterior; null lo borra a propósito.
        ...(uploaded !== undefined ? { avatar_url: uploaded } : {}),
        experience_level: experience,
        notifications_enabled: notifications,
      })
      .eq('id', playerId);
    setSaving(false);

    if (error) {
      alerta('No se pudo guardar', error.message);
      return;
    }
    navigation.goBack();
  }

  function removePhoto() {
    setNewPhoto(null);
    setSavedPhoto(null);
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.loading}>
          <Text style={type.soft}>Cargando…</Text>
        </View>
      </Screen>
    );
  }

  const shownPhoto = newPhoto ?? savedPhoto;

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Editar perfil</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.form}>
        <AvatarPicker
          value={avatarKey}
          photoUri={shownPhoto}
          onSelect={(k) => {
            setAvatarKey(k);
            setNewPhoto(null);
            setSavedPhoto(null);
          }}
          onUpload={choosePhoto}
        />

        {shownPhoto ? (
          <Pressable onPress={removePhoto} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
            <Text style={styles.removeLink}>Quitar foto y usar un avatar de la app</Text>
          </Pressable>
        ) : null}

        {/* El correo se ve pero no se edita: es la llave de la cuenta y

            cambiarlo es otra operación (verificación incluida). Antes

            no aparecía en ningún lado y no había forma de saber con

            qué cuenta estabas dentro. */}

        <View style={styles.correoBox}>

          <Text style={styles.correoLabel}>CORREO DE LA CUENTA</Text>

          <Text style={styles.correoValor}>{session?.user?.email ?? '—'}</Text>

        </View>

        <Field
          label="Nombre de blader"
          counter={`${form.name.length}/20`}
          maxLength={20}
          value={form.name}
          onChangeText={(v) => setForm({ ...form, name: v })}
        />

        <Field
          label="Ciudad"
          value={form.city}
          onChangeText={(v) => setForm({ ...form, city: v })}
          hint="Con ella te conectamos con bladers de tu zona."
        />

        <Field
          label="País"
          value={form.country}
          onChangeText={(v) => setForm({ ...form, country: v })}
        />

        <Field
          label="Beyblade principal"
          placeholder="Dran Sword 3-60"
          value={form.mainBeyblade}
          onChangeText={(v) => setForm({ ...form, mainBeyblade: v })}
        />

        <Field
          label="Estilo de juego"
          placeholder="Ataque, Defensa, Resistencia, Balance"
          value={form.playStyle}
          onChangeText={(v) => setForm({ ...form, playStyle: v })}
        />

        <View>
          <Text style={type.label}>Nivel de experiencia</Text>
          <View style={styles.grid}>
            {EXPERIENCE.map((e) => (
              <OptionCard
                key={e.key}
                glyph={e.glyph}
                title={e.title}
                selected={experience === e.key}
                onPress={() => setExperience(e.key)}
              />
            ))}
          </View>
        </View>

        <Card active={notifications}>
          <Checkbox checked={notifications} onToggle={() => setNotifications((n) => !n)}>
            <Text style={styles.optTitle}>Recibir notificaciones</Text>
            <Text style={styles.optDesc}>Desafíos, eventos y novedades de la liga.</Text>
          </Checkbox>
        </Card>

        <Button label="GUARDAR CAMBIOS" onPress={save} loading={saving} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  correoBox: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: 2,
  },
  correoLabel: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  correoValor: { fontSize: 13.5, color: colors.inkSoft },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space.md,
    marginBottom: space.xl,
  },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 19 },
  form: { gap: space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  optTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  optDesc: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  removeLink: { color: colors.loss, fontSize: 12, fontWeight: '600' },
});
