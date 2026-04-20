import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme';
import { MuscleIcon } from '@/components/MuscleIcon';
import { getExerciseById } from '@/data/mockExercises';
import { ProgressStackParamList } from '@/navigation/ProgressStack';

type Rt = RouteProp<ProgressStackParamList, 'ExerciseDetail'>;

export function ExerciseDetailScreen() {
  const nav = useNavigation();
  const route = useRoute<Rt>();
  const ex = getExerciseById(route.params.exerciseId);

  if (!ex) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.notFound}>Exercise not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {ex.name}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroGlow} />
          <View style={styles.heroIcon}>
            <MuscleIcon muscle={ex.muscleGroup} size={160} />
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.exName}>{ex.name}</Text>
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Text style={styles.metaChipText}>{ex.muscleGroup}</Text>
              </View>
              <View style={[styles.metaChip, styles.metaChipAlt]}>
                <Text style={[styles.metaChipText, styles.metaChipTextAlt]}>
                  {ex.equipment}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Description</Text>
        <View style={styles.card}>
          <Text style={styles.description}>{ex.description}</Text>
        </View>

        <Text style={styles.sectionLabel}>Cues</Text>
        <View style={{ gap: spacing.sm }}>
          {ex.cues.map((c, i) => (
            <View key={i} style={styles.cueRow}>
              <View style={styles.cueNum}>
                <Text style={styles.cueNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.cueText}>{c}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  notFound: {
    padding: spacing.xl,
    fontSize: 16,
    color: colors.textMuted,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  back: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    overflow: 'hidden',
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accentSoft,
    opacity: 0.8,
  },
  heroIcon: {
    width: 160,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBody: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  exName: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
  },
  metaChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  metaChipAlt: {
    backgroundColor: colors.accentSoft,
  },
  metaChipText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  metaChipTextAlt: {
    color: colors.accent,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  description: {
    fontSize: 14.5,
    color: colors.text,
    lineHeight: 22,
  },
  cueRow: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  cueNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cueNumText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  cueText: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
});
