import { useCallback, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { layout, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Card, Chip, EmptyState } from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ExerciseImage } from '@/components/ExerciseImage';
import { getExerciseById, mockExercises } from '@/data/mockExercises';
import { getExerciseDetails } from '@/data/exerciseDetails.gen';
import { getExerciseHowTo } from '@/data/exerciseHowTo';
import { useTabBarClearance } from '@/hooks';

// Registered in both PlanStack and ProgressStack — keep the typing local.
type DetailParams = { ExerciseDetail: { exerciseId: string } };
type Rt = RouteProp<DetailParams, 'ExerciseDetail'>;
type Nav = NativeStackNavigationProp<DetailParams, 'ExerciseDetail'>;

type Section = 'howto' | 'alternatives';

const EQUIPMENT_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Barbell: 'barbell-outline',
  Dumbbell: 'barbell-outline',
  Machine: 'cog-outline',
  Cable: 'git-commit-outline',
  Bodyweight: 'body-outline',
  Kettlebell: 'fitness-outline',
};

/** "Calves · Forearms · Glutes +5" — always fits one quiet line. */
function formatSupporting(muscles: string[]): string {
  const shown = muscles.slice(0, 3).join(' · ');
  const extra = muscles.length - 3;
  return extra > 0 ? `${shown} +${extra}` : shown;
}

export function ExerciseDetailScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const route = useRoute<Rt>();
  const nav = useNavigation<Nav>();
  const clearance = useTabBarClearance();
  const [scrolledPastHero, setScrolledPastHero] = useState(false);
  const [section, setSection] = useState<Section>('howto');

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrolledPastHero(e.nativeEvent.contentOffset.y > 180);
  }, []);

  const ex = getExerciseById(route.params.exerciseId);

  if (!ex) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader variant="detail" title="Exercise" />
        <EmptyState
          icon="help-circle-outline"
          title="Exercise not found"
          message="This exercise may have been removed."
        />
      </SafeAreaView>
    );
  }

  const details = getExerciseDetails(ex.id);
  const howTo =
    getExerciseHowTo(ex.id) ?? details?.instructions ?? ex.cues;
  const alternatives = mockExercises
    .filter((e) => e.muscleGroup === ex.muscleGroup && e.id !== ex.id)
    .slice(0, 5);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {/* Title only appears once the hero has scrolled away — no duplication. */}
      <ScreenHeader
        variant="detail"
        title={scrolledPastHero ? ex.name : undefined}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: clearance.scroll }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Hero: the exercise's body-part-highlight illustration */}
        <Card variant="floating" radius="xl" padded={false} style={styles.heroCard}>
          <ExerciseImage
            exerciseId={ex.id}
            muscle={ex.muscleGroup}
            aspectRatio={3 / 2}
            radius={0}
            style={styles.heroImage}
          />
        </Card>

        {/* Title block */}
        <View style={styles.titleBlock}>
          <AppText variant="h1">{ex.name}</AppText>
          <View style={styles.chipRow}>
            <Chip label={ex.muscleGroup} selected />
            <Chip
              label={ex.equipment}
              tone="accent"
              icon={EQUIPMENT_ICON[ex.equipment]}
            />
          </View>
          {/* Target muscles — primary large, supporting quiet */}
          <View style={styles.targetBlock}>
            <View style={styles.targetCol}>
              <AppText variant="label">Primary</AppText>
              <AppText variant="h3">{ex.muscleGroup}</AppText>
            </View>
            {details && details.secondaryMuscles.length > 0 && (
              <>
                <View style={styles.targetDivider} />
                <View style={styles.targetColWide}>
                  <AppText variant="label">Supporting</AppText>
                  <AppText variant="caption" numberOfLines={1}>
                    {formatSupporting(details.secondaryMuscles)}
                  </AppText>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Section switcher */}
        <View style={styles.segmented}>
          {(
            [
              ['howto', 'How to'],
              ['alternatives', 'Alternatives'],
            ] as [Section, string][]
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setSection(key)}
              style={[styles.segment, section === key && styles.segmentActive]}
            >
              <AppText
                variant="bodyMedium"
                color={section === key ? 'textPrimary' : 'textSecondary'}
              >
                {label}
              </AppText>
            </Pressable>
          ))}
        </View>

        {section === 'howto' ? (
          <>
            {/* Short, plain-language steps — written to fit one line each */}
            <Card style={styles.sectionCard}>
              <View style={styles.steps}>
                {howTo.map((step, i) => (
                  <View key={i} style={styles.stepRow}>
                    <View style={styles.bullet} />
                    <AppText variant="body" style={styles.stepText}>
                      {step}
                    </AppText>
                  </View>
                ))}
              </View>
            </Card>
          </>
        ) : (
          <View style={styles.alternatives}>
            {alternatives.length === 0 ? (
              <AppText variant="caption" align="center">
                No alternatives for this muscle group yet.
              </AppText>
            ) : (
              alternatives.map((alt) => (
                <Card key={alt.id} padded={false} style={styles.altCard}>
                  <Pressable
                    style={styles.altRow}
                    onPress={() => nav.push('ExerciseDetail', { exerciseId: alt.id })}
                  >
                    <ExerciseImage
                      exerciseId={alt.id}
                      muscle={alt.muscleGroup}
                      size={52}
                      radius="md"
                    />
                    <View style={{ flex: 1 }}>
                      <AppText variant="h3" numberOfLines={1}>
                        {alt.name}
                      </AppText>
                      <AppText variant="caption">{alt.equipment}</AppText>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.textTertiary}
                    />
                  </Pressable>
                </Card>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) => ({
  safe: { flex: 1, backgroundColor: t.colors.bg },
  content: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
  },
  heroCard: { overflow: 'hidden' },
  heroImage: {
    borderWidth: 0,
    borderRadius: 0,
  },
  titleBlock: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  targetBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: t.colors.bgSubtle,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  targetCol: { gap: spacing.xxs },
  targetColWide: { flex: 1, gap: spacing.xxs },
  targetDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: t.colors.border,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: t.colors.sunken,
    borderRadius: radius.pill,
    padding: 3,
    marginTop: spacing.lg,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  segmentActive: {
    backgroundColor: t.colors.card,
  },
  sectionCard: { marginTop: spacing.md },
  steps: { gap: spacing.md },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.colors.accent,
  },
  // One notch under `body` so a full step fits a single line on small phones.
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  alternatives: { marginTop: spacing.md, gap: spacing.sm },
  altCard: {},
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
}));
