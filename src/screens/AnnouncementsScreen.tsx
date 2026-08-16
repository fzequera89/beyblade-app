import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import Screen from '../ui/Screen';
import Button from '../ui/Button';
import { Field } from '../ui/Field';
import { Card, SectionTitle } from '../ui/primitives';
import { alerta } from '../ui/alerta';
import { haceCuanto } from '../lib/notifications';
import { colors, space, type, radius } from '../theme';

// Anuncios de la administración.
//
// No es un sistema de mensajería nuevo: cada anuncio se reparte como una copia
// en la bandeja de notificaciones de cada destinatario, la misma donde ya viven
// los avisos del juego. Lo único propio es el texto y a quién iba dirigido.

type Alcance = 'global' | 'league' | 'club' | 'player';

type Opcion = { id: string; nombre: string };

const ALCANCES: { key: Alcance; label: string; desc: string }[] = [
  { key: 'global', label: 'Todos', desc: 'Toda la comunidad' },
  { key: 'league', label: 'Una liga', desc: 'Sus miembros' },
  { key: 'club', label: 'Un club', desc: 'Su roster' },
  { key: 'player', label: 'Un jugador', desc: 'Solo a esa persona' },
];

export default function AnnouncementsScreen({ navigation }: any) {
  const [titulo, setTitulo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [alcance, setAlcance] = useState<Alcance>('global');
  const [destino, setDestino] = useState<string | null>(null);
  const [opciones, setOpciones] = useState<Opcion[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [nombreDestino, setNombreDestino] = useState<string | null>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('announcements')
      .select('id, title, body, scope, recipients, created_at')
      .order('created_at', { ascending: false })
      .limit(12);
    setHistorial((data as any) ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Las opciones se piden al elegir el alcance, no antes: cargar ligas, clubes y
  // jugadores de entrada serían tres consultas para usar una.
  //
  // Y se BUSCAN en el servidor, no se filtran aquí. Traer la lista completa y
  // filtrarla en la app funciona con 22 jugadores y se rompe con mil: la
  // consulta traía 60 y el resto sencillamente no existía para quien buscaba.
  const buscarOpciones = useCallback(
    async (nuevo: Alcance, texto: string) => {
      if (nuevo === 'global') {
        setOpciones([]);
        return;
      }
      const tabla = nuevo === 'league' ? 'leagues' : nuevo === 'club' ? 'clubs' : 'players';
      const campo = nuevo === 'player' ? 'display_name' : 'name';

      let q = supabase.from(tabla).select(`id, ${campo}`).order(campo).limit(30);
      if (texto.trim().length > 0) q = q.ilike(campo, `%${texto.trim()}%`);

      const { data } = await q;
      setOpciones(((data as any[]) ?? []).map((o) => ({ id: o.id, nombre: o[campo] })));
    },
    []
  );

  async function cambiarAlcance(nuevo: Alcance) {
    setAlcance(nuevo);
    setDestino(null);
    setNombreDestino(null);
    setBusqueda('');
    setOpciones([]);
    await buscarOpciones(nuevo, '');
  }

  async function enviar() {
    if (alcance !== 'global' && !destino) {
      return alerta('Falta el destinatario', 'Elige a quién va dirigido.');
    }

    const aQuien =
      alcance === 'global'
        ? 'TODA la comunidad'
        : nombreDestino ?? 'el destinatario elegido';

    alerta('Enviar anuncio', `Va a ${aQuien}. Les llega como notificación y no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar',
        onPress: async () => {
          setBusy(true);
          const { data, error } = await supabase.rpc('send_announcement', {
            p_title: titulo,
            p_body: mensaje,
            p_scope: alcance,
            p_target_id: alcance === 'global' ? null : destino,
          });
          setBusy(false);
          if (error) return alerta('No se pudo enviar', error.message);
          alerta('Enviado', `Le llegó a ${data ?? 0} persona(s).`);
          setTitulo('');
          setMensaje('');
          load();
        },
      },
    ]);
  }

  const listo = titulo.trim().length >= 3 && mensaje.trim().length >= 3;

  return (
    <Screen scroll>
      <View style={styles.head}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.title}>Anuncios</Text>
        <Text style={styles.sub}>Llegan como notificación y quedan en su bandeja.</Text>
      </View>

      <View style={{ gap: space.md }}>
        <Field label="Título" placeholder="Cambio de sede" value={titulo} onChangeText={setTitulo} />
        <Field
          label="Mensaje"
          placeholder="El torneo del sábado se mueve a Arena Norte."
          value={mensaje}
          onChangeText={setMensaje}
          multiline
        />

        <SectionTitle>¿A quién?</SectionTitle>
        <View style={styles.alcances}>
          {ALCANCES.map((a) => (
            <Pressable
              key={a.key}
              onPress={() => cambiarAlcance(a.key)}
              style={[styles.alcance, alcance === a.key && styles.alcanceOn]}
            >
              <Text style={[styles.alcanceLabel, alcance === a.key && { color: colors.ink }]}>
                {a.label}
              </Text>
              <Text style={styles.alcanceDesc}>{a.desc}</Text>
            </Pressable>
          ))}
        </View>

        {alcance !== 'global' && (
          <View style={{ gap: space.sm }}>
            <Field
              label="Buscar"
              placeholder={alcance === 'player' ? 'Nombre del jugador' : 'Nombre'}
              value={busqueda}
              onChangeText={(t: string) => {
                setBusqueda(t);
                buscarOpciones(alcance, t);
              }}
            />

            {/* El elegido se queda a la vista aunque la búsqueda cambie: si no,
                escribir otra cosa parecería haber borrado la selección. */}
            {destino && nombreDestino ? (
              <View style={[styles.opcion, styles.opcionOn]}>
                <Text style={[styles.opcionText, { color: colors.ink }]}>
                  ✓ {nombreDestino}
                </Text>
              </View>
            ) : null}

            {opciones.length === 0 ? (
              <Text style={styles.hint}>
                {busqueda.trim() ? 'Nadie con ese nombre.' : 'Cargando…'}
              </Text>
            ) : (
              opciones
                .filter((o) => o.id !== destino)
                .map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => {
                      setDestino(o.id);
                      setNombreDestino(o.nombre);
                    }}
                    style={styles.opcion}
                  >
                    <Text style={styles.opcionText}>{o.nombre}</Text>
                  </Pressable>
                ))
            )}

            {opciones.length === 30 && (
              <Text style={styles.hint}>
                Se muestran los primeros 30. Escribe para acotar la búsqueda.
              </Text>
            )}
          </View>
        )}

        <Button
          label={listo ? 'ENVIAR ANUNCIO' : 'ESCRIBE TÍTULO Y MENSAJE'}
          onPress={enviar}
          disabled={!listo || busy}
          loading={busy}
        />
      </View>

      <View style={{ marginTop: space.xxl, gap: space.sm }}>
        <SectionTitle>Enviados</SectionTitle>
        {historial.length === 0 ? (
          <Card>
            <Text style={type.soft}>Todavía no has mandado ninguno.</Text>
          </Card>
        ) : (
          historial.map((a) => (
            <Card key={a.id} style={{ gap: 3 }}>
              <Text style={styles.histTitle}>{a.title}</Text>
              <Text style={styles.histBody} numberOfLines={2}>
                {a.body}
              </Text>
              <Text style={styles.histMeta}>
                {a.scope === 'global'
                  ? 'A todos'
                  : a.scope === 'league'
                  ? 'A una liga'
                  : a.scope === 'club'
                  ? 'A un club'
                  : 'A un jugador'}{' '}
                · {a.recipients} destinatario(s) · {haceCuanto(a.created_at)}
              </Text>
            </Card>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: space.md },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  hero: { paddingVertical: space.lg, gap: 3 },
  title: { ...type.display, fontSize: 22 },
  sub: { fontSize: 12.5, color: colors.inkSoft },
  hint: { fontSize: 12, color: colors.inkDim },

  alcances: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  alcance: {
    flexGrow: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    gap: 2,
  },
  alcanceOn: { borderColor: colors.blue, backgroundColor: colors.surface },
  alcanceLabel: { fontSize: 13.5, fontWeight: '800', color: colors.inkSoft },
  alcanceDesc: { fontSize: 11, color: colors.inkDim },

  opcion: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  opcionOn: { borderColor: colors.blue, backgroundColor: colors.surface },
  opcionText: { fontSize: 13.5, color: colors.inkSoft },

  histTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  histBody: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },
  histMeta: { fontSize: 10.5, color: colors.inkDim, marginTop: 2 },
});
