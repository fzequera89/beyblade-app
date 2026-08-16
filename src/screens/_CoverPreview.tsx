import { View, Text, ScrollView } from 'react-native';
import Cover from '../ui/Cover';
import { colors, space } from '../theme';

const FAKE = [
  { id: 'a1b2c3', name: 'Comic Store Central', live: true },
  { id: 'zzz999', name: 'Arena Norte', live: false },
  { id: 'kk4412', name: 'Hobby Land Chapalita', live: false },
  { id: 'mmm777', name: 'Club Satélite', live: false },
  { id: 'qq0011', name: 'Beystation Roma', live: true },
];

export default function CoverPreview() {
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.xl, gap: space.lg }}>
      {FAKE.map((v) => (
        <View key={v.id} style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.line }}>
          <Cover id={v.id} live={v.live} height={128} />
          <Text style={{ color: colors.ink, padding: 12, fontWeight: '800' }}>{v.name}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
