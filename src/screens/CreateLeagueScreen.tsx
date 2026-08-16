import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { alerta } from '../ui/alerta';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Cover from '../ui/Cover';
import { pickCoverPhoto, uploadCover } from '../lib/cover';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card } from '../ui/primitives';
import { colors, space, type, radius } from '../theme';

export default function CreateLeagueScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name.trim()) {
      alerta('Falta el nombre de la liga');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('leagues')
      .insert({ name: name.trim(), description: description.trim() || null, owner_player_id: playerId })
      .select('id')
      .single();
    setLoading(false);
    if (error) {
      alerta('Error', error.message);
      return;
    }
    // La foto se sube DESPUÉS de crear porque la ruta lleva el id de la liga.
    // Si falla, la liga ya existe y se queda con su portada dibujada: se pierde
    // la foto, no la liga.
    if (photoUri) {
      const url = await uploadCover('league', data.id, photoUri);
      if (url) await supabase.from('leagues').update({ photo_url: url }).eq('id', data.id);
    }

    navigation.replace('LeagueDetail', { leagueId: data.id });
  }

  return (
    <Screen scroll padded={false}>
      <View style={styles.pad}>
        <View style={styles.headRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.back}>‹</Text>
          </Pressable>
        </View>

        <View style={styles.coverWrap}>
          <Cover id={name || 'liga-nueva'} photoUrl={photoUri} height={132} />
          <Pressable
            style={styles.coverBtn}
            onPress={async () => {
              const uri = await pickCoverPhoto();
              if (uri) setPhotoUri(uri);
            }}
          >
            <Text style={styles.coverBtnText}>
              {photoUri ? '🖼️ Cambiar portada' : '🖼️ Poner foto de portada'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={styles.title}>Nueva liga</Text>
          <Text style={styles.sub}>
            Una liga agrupa a sus miembros, sus torneos y su ranking. Tú quedas como moderador.
          </Text>
        </View>

        <Card style={{ gap: space.lg }}>
          <Field
            label="Nombre de la liga"
            placeholder="Ej. DML Ciudad de México"
            value={name}
            onChangeText={setName}
            counter={`${name.length}/40`}
            maxLength={40}
          />
          <Field
            label="Descripción (opcional)"
            placeholder="Quiénes son, dónde y cada cuándo juegan"
            value={description}
            onChangeText={setDescription}
            multiline
            hint="Es lo primero que ve un blader que no te conoce."
          />
        </Card>

        <View style={styles.actions}>
          <Button label="CREAR LIGA" onPress={create} disabled={loading || !name.trim()} loading={loading} />
          <Button label="Cancelar" variant="ghost" onPress={() => navigation.goBack()} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.xl, paddingBottom: space.xxxl },
  headRow: { paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },

  coverWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    marginTop: space.md,
  },
  coverBtn: { paddingVertical: space.md, alignItems: 'center', backgroundColor: colors.card },
  coverBtnText: { color: colors.blue, fontSize: 12.5, fontWeight: '700' },
  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  title: { ...type.display, fontSize: 24, textAlign: 'center' },
  sub: { fontSize: 12.5, color: colors.inkSoft, textAlign: 'center', lineHeight: 18 },

  actions: { marginTop: space.xl, gap: space.sm },
});
