import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card, Hex } from '../ui/primitives';
import { colors, space, type } from '../theme';

export default function CreateLeagueScreen({ navigation }: any) {
  const { playerId } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!name.trim()) {
      Alert.alert('Falta el nombre de la liga');
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
      Alert.alert('Error', error.message);
      return;
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

        <View style={styles.hero}>
          <Hex size={80} color={colors.blue}>
            <Text style={{ fontSize: 30 }}>🏅</Text>
          </Hex>
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

  hero: { alignItems: 'center', gap: space.sm, paddingVertical: space.lg },
  title: { ...type.display, fontSize: 24, textAlign: 'center' },
  sub: { fontSize: 12.5, color: colors.inkSoft, textAlign: 'center', lineHeight: 18 },

  actions: { marginTop: space.xl, gap: space.sm },
});
