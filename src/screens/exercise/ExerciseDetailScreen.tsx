import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, radius, spacing, typography } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { getExerciseById } from '@/data/mockExercises';
import { ExerciseStackParamList } from '@/navigation/ExerciseStack';
import { SafeAreaView } from 'react-native-safe-area-context';

type RouteProps = RouteProp<ExerciseStackParamList, 'ExerciseDetail'>;
type Nav = NativeStackNavigationProp<ExerciseStackParamList, 'ExerciseDetail'>;

export function ExerciseDetailScreen() {
  const { params } = useRoute<RouteProps>();
  const nav = useNavigation<Nav>();
  const exercise = getExerciseById(params.exerciseId);

  if (!exercise) {
    return (
      <SafeAreaView style={styles.missing}>
        <Text style={typography.body}>Exercise not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <ScrollView style={styles.safe} contentContainerStyle={{ paddingBottom: spacing.xxxl }}>
      <View style={[styles.hero, { backgroundColor: exercise.thumbnailColor }]}>
        <Ionicons name="play-circle" size={72} color="rgba(255,255,255,0.9)" />
        <View style={styles.heroBadge}>
          <Ionicons name="videocam" size={12} color="#fff" />
          <Text style={styles.heroBadgeText}>HD demo</Text>
        </View>
      </View>

      <View style={styles.body}>
        <Text style={typography.heading}>{exercise.name}</Text>

        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Ionicons name="body" size={12} color="#fff" />
            <Text style={styles.tagText}>{exercise.muscleGroup}</Text>
          </View>
          <View style={[styles.tag, styles.tagSecondary]}>
            <Ionicons name="barbell" size={12} color={colors.text} />
            <Text style={[styles.tagText, { color: colors.text }]}>
              {exercise.equipment}
            </Text>
          </View>
        </View>

        <Text style={[typography.label, { marginTop: spacing.xl }]}>
          Form Cues
        </Text>
        {exercise.cues.map((cue, i) => (
          <View key={i} style={styles.cueRow}>
            <View style={styles.cueNumber}>
              <Text style={styles.cueNumberText}>{i + 1}</Text>
            </View>
            <Text style={[typography.body, { flex: 1 }]}>{cue}</Text>
          </View>
        ))}

        <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
          <PrimaryButton
            title="Add to today's workout"
            icon="add-circle"
            onPress={() => nav.goBack()}
          />
          <PrimaryButton
            title="Ask Homie for a variation"
            icon="chatbubble-ellipses"
            variant="secondary"
            onPress={() => nav.goBack()}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  missing: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.pill,
  },
  heroBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  tagRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  tagSecondary: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cueRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  cueNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cueNumberText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
