import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, EmptyState, Entering } from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ExerciseImage } from '@/components/ExerciseImage';
import {
  mockExercises,
  categories,
  getCategory,
  Category,
} from '@/data/mockExercises';
import { useTabBarClearance } from '@/hooks';
import { Exercise } from '@/types';

// Mounted in both PlanStack (browse) and ProgressStack (browse + picker) —
// type against the minimal structural params this screen actually navigates.
type ExerciseListParams = {
  ExerciseList: { mode?: 'browse' | 'picker'; returnKey?: 'strength' | 'volume' };
  ExerciseDetail: { exerciseId: string };
  ProgressHome:
    | { pickedExercise?: string; returnKey?: 'strength' | 'volume' }
    | undefined;
};

type Nav = NativeStackNavigationProp<ExerciseListParams, 'ExerciseList'>;
type Rt = RouteProp<ExerciseListParams, 'ExerciseList'>;

const ALL: Category | 'All' = 'All';

export function ExerciseListScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const nav = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const mode = route.params?.mode ?? 'browse';
  const returnKey = route.params?.returnKey;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Category | 'All'>(ALL);
  const clearance = useTabBarClearance();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mockExercises.filter((e) => {
      const matchesQ =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.muscleGroup.toLowerCase().includes(q) ||
        e.equipment.toLowerCase().includes(q);
      const matchesF = filter === ALL || getCategory(e.muscleGroup) === filter;
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
      <ScreenHeader
        variant="detail"
        title={mode === 'picker' ? 'Select exercise' : 'Exercise library'}
      />

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search exercise, muscle, equipment"
          placeholderTextColor={colors.textTertiary}
          style={styles.searchInput}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        <FilterChip
          label="All"
          count={mockExercises.length}
          active={filter === ALL}
          onPress={() => setFilter(ALL)}
        />
        {categories.map((c) => {
          const count = mockExercises.filter(
            (e) => getCategory(e.muscleGroup) === c,
          ).length;
          if (count === 0) return null;
          return (
            <FilterChip
              key={c}
              label={c}
              count={count}
              active={filter === c}
              onPress={() => setFilter(c)}
            />
          );
        })}
      </ScrollView>

      <FlatList
        // Remount on category change so the rows' mount animation (Entering)
        // replays — FlatList otherwise recycles cells and never re-triggers it.
        key={filter}
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={[styles.listContent, { paddingBottom: clearance.scroll }]}
        renderItem={({ item, index }) => (
          <Entering index={index}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => handlePress(item)}
          >
            <ExerciseImage
              exerciseId={item.id}
              muscle={item.muscleGroup}
              size={52}
              radius="md"
            />
            <View style={{ flex: 1 }}>
              <AppText variant="h3" numberOfLines={1}>
                {item.name}
              </AppText>
              <View style={styles.metaRow}>
                <AppText variant="caption" color="accentText">
                  {item.muscleGroup}
                </AppText>
                <View style={styles.metaDot} />
                <AppText variant="caption">{item.equipment}</AppText>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          </Pressable>
          </Entering>
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon="search"
            title="No matches"
            message={
              query
                ? `Nothing matches "${query}". Try another term or clear your filters.`
                : 'No exercises in this group.'
            }
            action={{
              label: 'Clear filters',
              onPress: () => {
                setQuery('');
                setFilter(ALL);
              },
            }}
          />
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
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <AppText variant="caption" color={active ? 'textInverse' : 'textPrimary'}>
        {label}
      </AppText>
      <AppText
        variant="caption"
        color={active ? 'rgba(255,255,255,0.8)' : 'textTertiary'}
        style={styles.chipCount}
      >
        {count}
      </AppText>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: t.colors.card,
    marginHorizontal: layout.SCREEN_H_PADDING,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.pill,
    ...t.shadows.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: t.colors.textPrimary,
    padding: 0,
  },
  filterScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingVertical: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: t.colors.card,
    marginRight: spacing.sm,
    ...t.shadows.xs,
  },
  chipActive: { backgroundColor: t.colors.accent },
  chipCount: { fontSize: 12 },
  listContent: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: t.colors.card,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...t.shadows.xs,
  },
  rowPressed: { backgroundColor: t.colors.accentFaint },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: t.colors.textTertiary,
  },
}));
