import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme';
import { MuscleIcon } from '@/components/MuscleIcon';
import { mockExercises, muscleGroups } from '@/data/mockExercises';
import { ProgressStackParamList } from '@/navigation/ProgressStack';
import { Exercise, MuscleGroup } from '@/types';

type Nav = NativeStackNavigationProp<ProgressStackParamList, 'ExerciseList'>;
type Rt = RouteProp<ProgressStackParamList, 'ExerciseList'>;

const ALL: MuscleGroup | 'All' = 'All';

export function ExerciseListScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const mode = route.params?.mode ?? 'browse';
  const returnKey = route.params?.returnKey;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MuscleGroup | 'All'>(ALL);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mockExercises.filter((e) => {
      const matchesQ =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.muscleGroup.toLowerCase().includes(q) ||
        e.equipment.toLowerCase().includes(q);
      const matchesF = filter === ALL || e.muscleGroup === filter;
      return matchesQ && matchesF;
    });
  }, [query, filter]);

  const handlePress = (ex: Exercise) => {
    if (mode === 'picker' && returnKey) {
      nav.navigate({
        name: 'ProgressHome',
        params: { pickedExercise: ex.id, returnKey },
        merge: true,
      } as never);
    } else {
      nav.navigate('ExerciseDetail', { exerciseId: ex.id });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {mode === 'picker' ? 'Select exercise' : 'Exercise library'}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercise, muscle, equipment"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <FilterChip
          label="All"
          count={mockExercises.length}
          active={filter === ALL}
          onPress={() => setFilter(ALL)}
        />
        {muscleGroups.map((m) => {
          const count = mockExercises.filter((e) => e.muscleGroup === m).length;
          if (count === 0) return null;
          return (
            <FilterChip
              key={m}
              label={m}
              count={count}
              active={filter === m}
              onPress={() => setFilter(m)}
            />
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && { backgroundColor: colors.accentSoft },
            ]}
            onPress={() => handlePress(item)}
          >
            <View style={styles.iconBubble}>
              <MuscleIcon muscle={item.muscleGroup} size={40} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.exName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaMuscle}>{item.muscleGroup}</Text>
                <View style={styles.metaDot} />
                <Text style={styles.metaText}>{item.equipment}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="search" size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>No exercises match.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function FilterChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
      <Text
        style={[
          styles.chipCount,
          active && { color: 'rgba(255,255,255,0.8)' },
        ]}
      >
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.1,
  },
  chipTextActive: { color: '#fff' },
  chipCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaMuscle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.textDim,
  },
  metaText: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
