import { useCallback, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, StyleSheet, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Screen from '../components/Screen';

type Season = { id: string; name: string; start_date: string | null; end_date: string | null };
type League = { id: string; name: string; description: string | null };

export default function LeagueDetailScreen({ route, navigation }: any) {
  const { leagueId } = route.params;
  const { playerId } = useAuth();
  const [league, setLeague] = useState<League | null>(null);
  const [role, setRole] = useState<'member' | 'organizer' | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: leagueData }, { data: membership }, { data: seasonRows }, { count }] = await Promise.all([
      supabase.from('leagues').select('id, name, description').eq('id', leagueId).single(),
      supabase
        .from('league_members')
        .select('role')
        .eq('league_id', leagueId)
        .eq('player_id', playerId)
        .maybeSingle(),
      supabase
        .from('seasons')
        .select('id, name, start_date, end_date')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false }),
      supabase.from('league_members').select('*', { count: 'exact', head: true }).eq('league_id', leagueId),
    ]);
    setLoading(false);
    setLeague(leagueData ?? null);
    setRole((membership?.role as 'member' | 'organizer' | undefined) ?? null);
    setSeasons(seasonRows ?? []);
    setMemberCount(count ?? 0);
  }, [leagueId, playerId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function join() {
    const { error } = await supabase
      .from('league_members')
      .insert({ league_id: leagueId, player_id: playerId, role: 'member' });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    load();
  }

  async function createSeason() {
    if (!newSeasonName.trim()) return;
    const { error } = await supabase
      .from('seasons')
      .insert({ league_id: leagueId, name: newSeasonName.trim() });
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setNewSeasonName('');
    setShowNewSeason(false);
    load();
  }

  if (loading || !league) {
    return (
      <Screen style={styles.container}>
        <Text>Cargando…</Text>
      </Screen>
    );
  }

  return (
    <Screen style={styles.container}>
      <FlatList
        style={{ flex: 1 }}
        data={seasons}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ gap: 8, paddingBottom: 24 }}
        ListHeaderComponent={
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.title}>{league.name}</Text>
            {league.description ? <Text style={styles.sub}>{league.description}</Text> : null}
            <Text style={styles.meta}>
              {memberCount} miembro{memberCount === 1 ? '' : 's'}
            </Text>

            {!role ? (
              <Pressable style={styles.button} onPress={join}>
                <Text style={styles.buttonText}>Unirme a esta liga</Text>
              </Pressable>
            ) : (
              <Text style={styles.roleTag}>
                {role === 'organizer' ? 'Eres moderador de esta liga' : 'Eres miembro'}
              </Text>
            )}

            {role && (
              <Pressable
                style={styles.button}
                onPress={() => navigation.navigate('Tournaments', { leagueId, isOrganizer: role === 'organizer' })}
              >
                <Text style={styles.buttonText}>Torneos</Text>
              </Pressable>
            )}

            {role && (
              <Pressable
                style={[styles.button, styles.secondaryButton]}
                onPress={() => navigation.navigate('LeagueStandings', { leagueId })}
              >
                <Text style={styles.buttonText}>Ranking / Reporte</Text>
              </Pressable>
            )}

            <Text style={styles.sectionTitle}>Temporadas</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.seasonCard}>
            <Text style={styles.seasonName}>{item.name}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Sin temporadas todavía.</Text>}
        ListFooterComponent={
          <View>
            {role === 'organizer' &&
              (showNewSeason ? (
                <View style={styles.newSeasonRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Nombre de la temporada"
                    placeholderTextColor="#8a8a8a"
                    value={newSeasonName}
                    onChangeText={setNewSeasonName}
                  />
                  <Pressable style={styles.button} onPress={createSeason}>
                    <Text style={styles.buttonText}>Crear</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable style={styles.linkButton} onPress={() => setShowNewSeason(true)}>
                  <Text style={styles.link}>+ Nueva temporada</Text>
                </Pressable>
              ))}

            <Pressable style={styles.back} onPress={() => navigation.navigate('Leagues')}>
              <Text style={styles.backText}>‹ Volver a ligas</Text>
            </Pressable>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { color: '#6b6b64', marginTop: 4 },
  meta: { color: '#6b6b64', fontSize: 12, marginTop: 6 },
  roleTag: { color: '#2f5ad6', fontWeight: '600', marginTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 20, marginBottom: 8 },
  seasonCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12 },
  seasonName: { fontWeight: '600' },
  empty: { color: '#6b6b64' },
  newSeasonRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10 },
  button: { backgroundColor: '#2f5ad6', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 10 },
  secondaryButton: { backgroundColor: '#444' },
  buttonText: { color: '#fff', fontWeight: '600' },
  linkButton: { marginTop: 12 },
  link: { color: '#2f5ad6', fontWeight: '600' },
  back: { marginTop: 20 },
  backText: { color: '#6b6b64' },
});
