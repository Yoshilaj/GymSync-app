import { useRef } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AnimatedPressable, AppText } from '@/components/ui';
import { ExerciseImage } from '@/components/ExerciseImage';
import { Exercise, PlannedSet, Units } from '@/types';

/** Resting width of the revealed action. */
const DELETE_W = 96;
/** Drag past this and the row deletes itself without a second tap. */
const FULL_SWIPE = Math.min(240, Dimensions.get('window').width * 0.55);

interface Props {
  exercise: Exercise;
  sets: PlannedSet[];
  units: Units;
  onPress?: () => void;
  /**
   * Opt in to swipe-left-to-delete. Omitted, the row renders exactly as it
   * always has — history lists must never be editable.
   */
  onDelete?: () => void;
}

/** A planned exercise in a workout list: photo, name, one summary line. */
export function ExerciseRow({ exercise, sets, units, onPress, onDelete }: Props) {
  const styles = useStyles();
  // Declared unconditionally — the early return below is after all hooks.
  const swipeRef = useRef<SwipeableMethods>(null);

  const reps = sets[0]?.targetReps ?? 0;
  const weight = sets[0]?.weight ?? 0;
  const load = weight > 0 ? `${weight} ${units}` : 'Bodyweight';

  const body = (
    <View style={styles.row}>
      <ExerciseImage
        exerciseId={exercise.id}
        muscle={exercise.muscleGroup}
        size={52}
        radius="md"
      />
      <View style={styles.textBlock}>
        <AppText variant="h3" numberOfLines={1}>
          {exercise.name}
        </AppText>
        <AppText variant="caption">
          {sets.length} Sets × {reps} Reps — {load}
        </AppText>
      </View>
    </View>
  );

  const tappable = onPress ? (
    <AnimatedPressable onPress={onPress}>{body}</AnimatedPressable>
  ) : (
    body
  );

  if (!onDelete) return tappable;

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.6}
      rightThreshold={DELETE_W / 2}
      // Overshoot stays ON so the row can be thrown all the way; the red keeps
      // pace because it's the container's own background (see swipeContainer).
      containerStyle={styles.swipeContainer}
      onSwipeableWillOpen={() =>
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
      renderRightActions={(_progress, translation) => (
        <DeleteAction
          translation={translation}
          onPress={() => {
            swipeRef.current?.close();
            onDelete();
          }}
          onFullSwipe={onDelete}
        />
      )}
    >
      {tappable}
    </ReanimatedSwipeable>
  );
}

/**
 * The revealed action. Either tap it, or keep swiping past FULL_SWIPE and the
 * row deletes itself — Mail's behaviour, and the reason there's no
 * confirmation dialog: the gesture is already deliberate.
 */
function DeleteAction({
  translation,
  onPress,
  onFullSwipe,
}: {
  translation: SharedValue<number>;
  onPress: () => void;
  onFullSwipe: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fired = useSharedValue(false);

  useAnimatedReaction(
    () => -translation.value,
    (dragged) => {
      // Latch: the drag keeps reporting past the threshold, and the row is
      // mid-unmount by then.
      if (dragged >= FULL_SWIPE && !fired.value) {
        fired.value = true;
        runOnJS(onFullSwipe)();
      }
    },
  );

  // The panel grows with the drag so the icon rides out with your thumb
  // instead of sitting in a fixed strip while red space opens behind it.
  //
  // It also slides `tuck` points UNDER the card once the swipe starts. The
  // card's right corners are rounded, so a panel that merely butts against
  // them leaves two background-coloured notches; sliding underneath puts red
  // behind the curve. The tuck grows from zero, so nothing peeks out at rest.
  const panelStyle = useAnimatedStyle(() => {
    const dragged = Math.max(0, -translation.value);
    const tuck = Math.min(radius.lg, dragged);
    return {
      width: Math.max(DELETE_W, dragged) + tuck,
      marginLeft: -tuck,
      // Keep the trash centred in the part you can actually see.
      paddingLeft: tuck,
    };
  });

  // Scaling the icon with the drag is what separates a native-feeling action
  // from a slab sliding in.
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          -translation.value,
          [0, DELETE_W],
          [0.7, 1],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));

  return (
    <Animated.View style={[styles.deletePanel, panelStyle]}>
      <Pressable
        onPress={onPress}
        style={styles.deleteAction}
        accessibilityRole="button"
        accessibilityLabel="Delete exercise"
      >
        <Animated.View style={iconStyle}>
          <Ionicons name="trash-outline" size={22} color={colors.textInverse} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: t.colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
    ...t.shadows.xs,
  },
  textBlock: { flex: 1, gap: 2 },
  // No background here on purpose. The action panel already widens with the
  // drag, so it covers everything the swipe exposes — and a red container
  // would show as a ring the moment the card scales down on press.
  swipeContainer: { borderRadius: radius.lg, overflow: 'hidden' },
  // Red belongs to the panel, which includes the part tucked under the card —
  // that tucked strip is exactly what fills the rounded corners.
  deletePanel: { backgroundColor: t.colors.danger },
  deleteAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
