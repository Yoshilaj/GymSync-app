import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ExerciseCard } from '@/components/ExerciseCard';
import { Pill } from '@/components/Pill';
import { colors, radius, spacing, typography } from '@/theme';
import { mockExercises, muscleGroups } from '@/data/mockExercises';
import { MuscleGroup } from '@/types';
import { ExerciseStackParamList } from '@/navigation/ExerciseStack';

type Nav = NativeStackNavigationProp<ExerciseStackParamList, 'ExerciseLibrary'>;

export function ExerciseLibraryScreen() {
  const nav = useNavigation<Nav>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MuscleGroup | null>(null);

  const filtered = useMemo(() => {
    return mockExercises.filter((e) => {
      if (filter && e.muscleGroup !== filter) return false;
      if (query && !e.name.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [query, filter]);

  return (
    <ScreenContainer padded={false}>
      <View style={styles.header}>
        <Text style={typography.heading}>Exercise Library</Text>
        <Text style={[typography.bodyMuted, { marginTop: 4 }]}>
          HD demos, form cues, and muscle tags.
        </Text>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises…"
            placeholderTextColor={colors.textDim}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterRow}
          contentContainerStyle={styles.filterContent}
        >
          <Pill
            label="All"
            active={filter === null}
            onPress={() => setFilter(null)}
          />
          {muscleGroups.map((g) => (
            <Pill
              key={g}
              label={g}
              active={filter === g}
              onPress={() => setFilter(g)}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        numColumns={2}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View style={styles.cell}>
            <ExerciseCard
              exercise={item}
              onPress={() =>
                nav.navigate('ExerciseDetail', { exerciseId: item.id })
              }
            />
          </View>
        )}
        columnWrapperStyle={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search" size={28} color={colors.textDim} />
            <Text style={[typography.bodyMuted, { marginTop: spacing.sm }]}>
              No exercises match.
            </Text>
          </View>
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    height: 44,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16 },
  filterRow: { marginTop: spacing.md, marginBottom: spacing.md },
  filterContent: { gap: spacing.sm, paddingRight: spacing.lg },
  cell: { flex: 1 },
  empty: { alignItems: 'center', paddingTop: spacing.xxxl },
});
