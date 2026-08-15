import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Screen from '../ui/Screen';
import { Card } from '../ui/primitives';
import { WearCheck, loadWearChecks } from '../lib/wear';
import { colors, space, type, radius } from '../theme';

// La guía de desgaste, tal como la usa el juez en la mesa.
//
// Se lee de pie y con un Beyblade desarmado en la mano, así que cada pieza va en
// su propia tarjeta y en el mismo orden en que se revisa: qué mirar, qué la hace
// ilegal y qué prueba hacer si hay duda.

export default function WearGuideScreen({ navigation }: any) {
  const [checks, setChecks] = useState<WearCheck[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setChecks(await loadWearChecks());
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>Verificación de desgaste</Text>
        <Text style={styles.sub}>Qué revisa el juez antes del combate</Text>
      </View>

      <Card style={{ marginBottom: space.lg }}>
        <Text style={styles.intro}>
          El juez puede desarmar el Beyblade para revisar el estado de las piezas y el ensamblaje.
          Una vez revisado y autorizado, no se cambian piezas ni lanzadores durante el combate.
        </Text>
      </Card>

      {error ? (
        <Card>
          <Text style={type.soft}>No se pudo cargar la guía: {error}</Text>
        </Card>
      ) : null}

      {checks.map((c) => (
        <Card key={c.id} style={styles.check}>
          <Text style={styles.piece}>{c.piece.toUpperCase()}</Text>

          <View style={styles.field}>
            <Text style={styles.label}>QUÉ SE REVISA</Text>
            <Text style={styles.value}>{c.control_point}</Text>
          </View>

          <View style={[styles.field, styles.illegal]}>
            <Text style={[styles.label, { color: colors.loss }]}>ESTADO ILEGAL</Text>
            <Text style={styles.value}>{c.illegal_state}</Text>
          </View>

          {c.safety_test ? (
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.streak }]}>PRUEBA DE SEGURIDAD</Text>
              <Text style={styles.value}>{c.safety_test}</Text>
            </View>
          ) : null}
        </Card>
      ))}

      <Text style={styles.foot}>
        Los criterios viven en la base: la organización los corrige sin que la app cambie.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  hero: { paddingVertical: space.lg, gap: 3 },
  title: { ...type.display, fontSize: 22 },
  sub: { fontSize: 12.5, color: colors.inkSoft },
  intro: { fontSize: 13, color: colors.ink, lineHeight: 19 },

  check: { gap: space.md, marginBottom: space.md },
  piece: { fontSize: 15, fontWeight: '800', fontStyle: 'italic', color: colors.ink, letterSpacing: -0.3 },
  field: { gap: 3 },
  illegal: {
    borderLeftWidth: 2,
    borderLeftColor: colors.loss,
    paddingLeft: space.md,
    marginLeft: -space.sm,
  },
  label: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8, color: colors.inkDim },
  value: { fontSize: 12.5, color: colors.ink, lineHeight: 18 },

  foot: { fontSize: 11, color: colors.inkDim, textAlign: 'center', marginTop: space.md, lineHeight: 16 },
});
