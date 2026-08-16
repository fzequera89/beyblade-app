import { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Screen from '../ui/Screen';
import { Card, Hex } from '../ui/primitives';
import { alerta } from '../ui/alerta';
import { Notificacion, loadNotifications, markRead, haceCuanto, iconoDe } from '../lib/notifications';
import { colors, space, type } from '../theme';

// Todo lo que la app te dijo, en un solo lugar.
//
// Antes la campana solo contaba retos: el resto de los avisos —te toca marcar,
// tienes combate, aprobaron tu resultado— solo existían como push, y una push
// que no llegó no dejaba rastro en ninguna parte.

export default function NotificationsScreen({ navigation }: any) {
  const [items, setItems] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await loadNotifications());
    } catch (e: any) {
      alerta('No se pudieron cargar', e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const sinLeer = items.filter((n) => !n.read_at).length;

  // Al tocar: se marca leída y se va a donde apunte. El destino lo manda el
  // servidor en `data.screen`, así que un aviso nuevo no obliga a publicar una
  // versión de la app.
  async function abrir(n: Notificacion) {
    if (!n.read_at) {
      await markRead([n.id]);
      setItems((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
      );
    }
    const destino = n.data?.screen;
    if (typeof destino === 'string') {
      navigation.navigate(destino, n.data ?? {});
    }
  }

  async function leerTodas() {
    await markRead();
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headRow}>
              <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
                <Text style={styles.back}>‹</Text>
              </Pressable>
              <Text style={styles.title}>Notificaciones</Text>
            </View>
            {sinLeer > 0 && (
              <Pressable onPress={leerTodas} hitSlop={6}>
                <Text style={styles.leerTodas}>Marcar todas como leídas ({sinLeer})</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const nueva = !item.read_at;
          return (
            <Card
              onPress={() => abrir(item)}
              style={[styles.row, nueva && { borderColor: colors.blue, backgroundColor: colors.surface }]}
            >
              <Text style={styles.icono}>{iconoDe(item)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, nueva && { color: colors.ink }]}>{item.title}</Text>
                <Text style={styles.body}>{item.body}</Text>
                <Text style={styles.cuando}>{haceCuanto(item.created_at)}</Text>
              </View>
              {nueva && <View style={styles.punto} />}
            </Card>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Card style={styles.empty}>
              <Hex size={52} color={colors.inkDim}>
                <Text style={{ fontSize: 20 }}>🔔</Text>
              </Hex>
              <Text style={styles.emptyTitle}>Nada por aquí</Text>
              <Text style={styles.hint}>
                Aquí van a aparecer los retos, los combates que te tocan y los resultados aprobados.
              </Text>
            </Card>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.xl, paddingBottom: space.xxxl, gap: space.sm },
  header: { gap: space.sm, paddingTop: space.md, marginBottom: space.sm },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  back: { color: colors.ink, fontSize: 30, lineHeight: 32, width: 22 },
  title: { ...type.title, fontSize: 20 },
  leerTodas: { fontSize: 12, fontWeight: '700', color: colors.blueHi },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  icono: { fontSize: 20, marginTop: 2 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: colors.inkSoft },
  body: { fontSize: 12.5, color: colors.inkSoft, lineHeight: 18, marginTop: 2 },
  cuando: { fontSize: 10.5, color: colors.inkDim, marginTop: 4 },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue, marginTop: 6 },

  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  hint: { fontSize: 12, color: colors.inkSoft, textAlign: 'center', lineHeight: 17 },
});
