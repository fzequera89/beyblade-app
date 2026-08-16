import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { supabase } from '../lib/supabase';
import { pickAvatarPhoto, uploadAvatar } from '../lib/avatar';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { AvatarPicker } from '../ui/Avatar';
import { Hex, OptionCard, Chip, Checkbox, Stepper, Card } from '../ui/primitives';
import { colors, space, type } from '../theme';

const STEPS = ['Cuenta', 'Perfil', 'Preferencias', 'Listo'];

const EXPERIENCE = [
  { key: 'rookie', glyph: '🌱', title: 'Rookie', desc: 'Nuevo en el blading' },
  { key: 'blader', glyph: '🌀', title: 'Blader', desc: 'Ya tengo experiencia' },
  { key: 'pro', glyph: '⚡', title: 'Pro', desc: 'Compito seguido' },
  { key: 'elite', glyph: '👑', title: 'Elite', desc: 'Compito en torneos' },
];

const COMPETITION = [
  { key: 'casual', glyph: '🙂', title: 'Casual', desc: 'Juego por diversión' },
  { key: 'intermedio', glyph: '🎯', title: 'Intermedio', desc: 'Quiero mejorar' },
  { key: 'competitivo', glyph: '🏆', title: 'Competitivo', desc: 'Compito en serio' },
  { key: 'profesional', glyph: '💎', title: 'Profesional', desc: 'Busco estar en lo más alto' },
];

const INTERESTS = [
  { key: 'batallas', label: 'Batallas 1v1', desc: 'Desafíos individuales' },
  { key: 'torneos', label: 'Eventos y torneos', desc: 'Competir en torneos oficiales' },
  { key: 'cerca', label: 'Bladers cerca de mí', desc: 'Encontrar jugadores y comunidad' },
  { key: 'venues', label: 'Tiendas y locaciones', desc: 'Descubrir lugares para batallar' },
];

// DD/MM/AAAA -> ISO. Se captura como texto porque un selector de fecha nativo
// exigiría una dependencia más; es el mismo criterio que en eventos.
function parseBirth(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (Number.isNaN(date.getTime())) return null;
  if (date > new Date()) return null;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// La ciudad se compara letra por letra para el matchmaking, así que aquí se
// normaliza: sin espacios de sobra y con mayúscula inicial. Sin esto,
// "monterrey " y "Monterrey" quedan como ciudades distintas.
function normalizeCity(v: string) {
  return v
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

export default function OnboardingScreen() {
  const { session, refreshPlayer } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [avatarKey, setAvatarKey] = useState<string>('a1');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState((session?.user.user_metadata?.username as string) ?? '');
  const [country, setCountry] = useState('México');
  const [city, setCity] = useState('');
  const [birth, setBirth] = useState('');
  const [experience, setExperience] = useState<string | null>(null);

  const [competition, setCompetition] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[]>(['batallas', 'cerca']);
  const [notifications, setNotifications] = useState(true);

  const [knownCities, setKnownCities] = useState<string[]>([]);

  // Las ciudades donde ya hay actividad se ofrecen como opción para que el
  // jugador no las escriba distinto y quede aislado del matchmaking.
  const loadCities = useCallback(async () => {
    const [{ data: venues }, { data: players }] = await Promise.all([
      supabase.from('venues').select('city'),
      supabase.from('players').select('city').not('city', 'is', null).limit(200),
    ]);
    const all = [
      ...((venues as any[]) ?? []).map((v) => v.city),
      ...((players as any[]) ?? []).map((p) => p.city),
    ].filter(Boolean) as string[];
    setKnownCities([...new Set(all.map(normalizeCity))].sort().slice(0, 8));
  }, []);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  async function pickPhoto() {
    const uri = await pickAvatarPhoto();
    if (uri) setPhotoUri(uri);
  }

  // La foto se sube hasta el final: si el jugador abandona el onboarding, no
  // dejamos archivos huérfanos en Storage.
  async function uploadPhoto(): Promise<string | null> {
    if (!photoUri) return null;
    setUploading(true);
    const url = await uploadAvatar(session!.user.id, photoUri);
    setUploading(false);
    return url;
  }

  function nextFromProfile() {
    if (!name.trim()) return alerta('Falta tu nombre', 'Elige el nombre con el que vas a competir.');
    if (!city.trim()) return alerta('Falta tu ciudad', 'La usamos para encontrarte rivales cerca.');
    if (birth.trim() && !parseBirth(birth))
      return alerta('Fecha inválida', 'Usa el formato DD/MM/AAAA.');
    if (!experience) return alerta('Falta un dato', 'Dinos tu nivel de experiencia.');
    setStep(2);
  }

  async function finish() {
    setSaving(true);
    const avatarUrl = await uploadPhoto();

    const { error } = await supabase.from('players').insert({
      auth_user_id: session!.user.id,
      display_name: name.trim(),
      city: normalizeCity(city),
      country: country.trim() || null,
      birth_date: birth.trim() ? parseBirth(birth) : null,
      avatar_key: avatarKey,
      avatar_url: avatarUrl,
      experience_level: experience,
      competition_level: competition,
      interests,
      notifications_enabled: notifications,
      onboarded_at: new Date().toISOString(),
    });
    setSaving(false);

    if (error) {
      alerta('No pudimos guardar tu perfil', error.message);
      return;
    }
    await refreshPlayer();
  }

  function toggleInterest(key: string) {
    setInterests((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  return (
    <Screen scroll>
      <View style={styles.top}>
        <Stepper steps={STEPS} current={step} />
      </View>

      {step === 1 && (
        <>
          <Text style={styles.title}>
            Cuéntanos <Text style={{ color: colors.blue }}>sobre ti</Text>
          </Text>
          <Text style={styles.sub}>
            Este es tu perfil blader. Todo se puede cambiar después.
          </Text>

          <View style={styles.form}>
            <AvatarPicker
              value={avatarKey}
              photoUri={photoUri}
              onSelect={(k) => {
                setAvatarKey(k);
                setPhotoUri(null);
              }}
              onUpload={pickPhoto}
              uploading={uploading}
            />

            <Field
              label="Nombre de blader"
              counter={`${name.length}/20`}
              maxLength={20}
              placeholder="BladerX"
              value={name}
              onChangeText={setName}
            />

            <Field label="País" placeholder="México" value={country} onChangeText={setCountry} />

            <Field
              label="Ciudad"
              placeholder="Monterrey"
              value={city}
              onChangeText={setCity}
              hint="Con ella te conectamos con bladers de tu zona."
            />

            {knownCities.length > 0 && (
              <View style={styles.chips}>
                {knownCities.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    selected={normalizeCity(city) === c}
                    onPress={() => setCity(c)}
                  />
                ))}
              </View>
            )}

            <Field
              label="Fecha de nacimiento (opcional)"
              placeholder="DD/MM/AAAA"
              value={birth}
              onChangeText={setBirth}
            />

            <View>
              <Text style={type.label}>Nivel de experiencia</Text>
              <View style={styles.grid}>
                {EXPERIENCE.map((e) => (
                  <OptionCard
                    key={e.key}
                    glyph={e.glyph}
                    title={e.title}
                    desc={e.desc}
                    selected={experience === e.key}
                    onPress={() => setExperience(e.key)}
                  />
                ))}
              </View>
            </View>

            <Button label="CONTINUAR" onPress={nextFromProfile} />
          </View>
        </>
      )}

      {step === 2 && (
        <>
          <Text style={styles.title}>
            ¿Cómo quieres <Text style={{ color: colors.blue }}>competir?</Text>
          </Text>
          <Text style={styles.sub}>Con esto te mostramos mejores batallas y eventos.</Text>

          <View style={styles.form}>
            <View>
              <Text style={type.label}>Nivel de competencia</Text>
              <View style={styles.grid}>
                {COMPETITION.map((c) => (
                  <OptionCard
                    key={c.key}
                    glyph={c.glyph}
                    title={c.title}
                    desc={c.desc}
                    selected={competition === c.key}
                    onPress={() => setCompetition(c.key)}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: space.md }}>
              <Text style={type.label}>¿Qué te interesa más?</Text>
              {INTERESTS.map((i) => (
                <Card key={i.key} active={interests.includes(i.key)}>
                  <Checkbox checked={interests.includes(i.key)} onToggle={() => toggleInterest(i.key)}>
                    <Text style={styles.interestTitle}>{i.label}</Text>
                    <Text style={styles.interestDesc}>{i.desc}</Text>
                  </Checkbox>
                </Card>
              ))}
            </View>

            <Card active={notifications}>
              <Checkbox checked={notifications} onToggle={() => setNotifications((n) => !n)}>
                <Text style={styles.interestTitle}>Recibir notificaciones</Text>
                <Text style={styles.interestDesc}>Desafíos, eventos y novedades de la liga.</Text>
              </Checkbox>
            </Card>

            <Button label="CONTINUAR" onPress={() => setStep(3)} />
            <Pressable onPress={() => setStep(1)} style={styles.back} hitSlop={6}>
              <Text style={styles.backText}>‹ Volver</Text>
            </Pressable>
          </View>
        </>
      )}

      {step === 3 && (
        <View style={styles.done}>
          <Hex size={110} color={colors.blue}>
            <Text style={styles.hexCheck}>✓</Text>
          </Hex>

          <Text style={styles.doneTitle}>¡Todo listo, Blader!</Text>
          <Text style={styles.doneSub}>Tu cuenta está configurada y lista para competir.</Text>

          <Card style={{ alignSelf: 'stretch', gap: space.md }}>
            <Text style={type.label}>Resumen</Text>
            <Row k="Nombre" v={name} />
            <Row k="Ubicación" v={[city, country].filter(Boolean).join(', ')} />
            <Row k="Experiencia" v={EXPERIENCE.find((e) => e.key === experience)?.title ?? '—'} />
            <Row
              k="Competencia"
              v={COMPETITION.find((c) => c.key === competition)?.title ?? 'Sin definir'}
            />
            <Row k="Notificaciones" v={notifications ? 'Activadas' : 'Desactivadas'} />
          </Card>

          <Button
            label="¡COMENCEMOS!"
            onPress={finish}
            loading={saving || uploading}
          />
          <Pressable onPress={() => setStep(2)} style={styles.back} hitSlop={6}>
            <Text style={styles.backText}>‹ Volver</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowKey}>{k}</Text>
      <Text style={styles.rowVal} numberOfLines={1}>
        {v || '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { marginTop: space.xl, marginBottom: space.xxl },
  title: { ...type.display, fontSize: 27 },
  sub: { ...type.soft, marginTop: 6, marginBottom: space.xl },
  form: { gap: space.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: -space.sm },
  interestTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  interestDesc: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  back: { alignSelf: 'center' },
  backText: { color: colors.inkSoft, fontSize: 13 },

  done: { alignItems: 'center', gap: space.lg, paddingTop: space.xl },
  hexCheck: { color: colors.blue, fontSize: 42, fontWeight: '800' },
  doneTitle: { ...type.display, fontSize: 28, textAlign: 'center' },
  doneSub: { ...type.soft, textAlign: 'center', marginTop: -8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: space.lg },
  rowKey: { fontSize: 13, color: colors.inkSoft },
  rowVal: { fontSize: 13, color: colors.ink, fontWeight: '600', flexShrink: 1 },
});
