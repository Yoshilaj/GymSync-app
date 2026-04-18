import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/theme';
import { Exercise } from '@/types';

interface Props {
  exercise: Exercise;
  onPress: () => void;
}

export function ExerciseCard({ exercise, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={[styles.thumb, { backgroundColor: exercise.thumbnailColor }]}>
        <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.9)" />
      </View>
      <View style={styles.body}>
        <Text style={typography.subtitle} numberOfLines={1}>
          {exercise.name}
        </Text>
        <View style={styles.tagRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{exercise.muscleGroup}</Text>
          </View>
          <View style={[styles.tag, styles.tagSecondary]}>
            <Text style={styles.tagText}>{exercise.equipment}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.85 },
  thumb: {
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: spacing.md },
  tagRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  tag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: colors.accentMuted,
    borderRadius: radius.pill,
  },
  tagSecondary: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagText: {
    ...typography.caption,
    color: colors.text,
    fontSize: 11,
  },
});
