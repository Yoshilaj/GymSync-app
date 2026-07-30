/**
 * Swipe-left-to-delete, shared by the plan's exercise rows and the chat history
 * panel so the two stay identical.
 *
 * Either tap the revealed trash, or keep swiping past `fullSwipeDistance` and
 * the row deletes itself — Mail's behaviour, and the reason there's no
 * confirmation dialog: the gesture is already deliberate.
 */
import { ComponentProps, ReactNode, useRef } from 'react';
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
import { makeStyles, radius, useTheme } from '@/theme';

/** Resting width of the revealed action. */
const DELETE_W = 96;
/** Drag past this and the row deletes itself without a second tap. */
const DEFAULT_FULL_SWIPE = Math.min(240, Dimensions.get('window').width * 0.55);

// Read off the component rather than reaching into gesture-handler's internals:
// RelationPropType isn't exported from the package root, so a deep lib import
// would be the only alternative and would break on upgrade.
type GestureRelation = ComponentProps<
  typeof ReanimatedSwipeable
>['blocksExternalGesture'];

interface Props {
  children: ReactNode;
  onDelete: () => void;
  /** Read by screen readers on the revealed button, e.g. "Delete conversation". */
  accessibilityLabel: string;
  /** Corner radius of the wrapped row, so the revealed action clips to match. */
  cornerRadius?: number;
  /**
   * Slide the red panel under the row's rounded corners.
   *
   * Needed when the row is an OPAQUE card: a panel that merely butts against
   * its curve leaves two background-coloured notches, and sliding underneath
   * puts red behind them. Must stay off for a TRANSPARENT row, where the
   * tucked strip would show through the content instead of hiding behind it.
   */
  tuckUnderCorners?: boolean;
  /** Drag distance that deletes without a tap. Keep it inside the row's width. */
  fullSwipeDistance?: number;
  /**
   * Gestures this swipe must win against — e.g. the history panel's own
   * pan-to-close, which reads the same leftward drag. Without an explicit
   * relation the two race, and which one wins is not something to leave to
   * gesture-arena defaults.
   */
  blocksExternalGesture?: GestureRelation;
}

export function SwipeToDelete({
  children,
  onDelete,
  accessibilityLabel,
  cornerRadius = radius.lg,
  tuckUnderCorners = false,
  fullSwipeDistance = DEFAULT_FULL_SWIPE,
  blocksExternalGesture,
}: Props) {
  const styles = useStyles();
  const swipeRef = useRef<SwipeableMethods>(null);

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.6}
      rightThreshold={DELETE_W / 2}
      // Overshoot stays ON so the row can be thrown all the way; the red keeps
      // pace because it's the panel's own background.
      containerStyle={[styles.swipeContainer, { borderRadius: cornerRadius }]}
      blocksExternalGesture={blocksExternalGesture}
      onSwipeableWillOpen={() =>
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
      renderRightActions={(_progress, translation) => (
        <DeleteAction
          translation={translation}
          tuck={tuckUnderCorners ? cornerRadius : 0}
          fullSwipeDistance={fullSwipeDistance}
          accessibilityLabel={accessibilityLabel}
          onPress={() => {
            swipeRef.current?.close();
            onDelete();
          }}
          onFullSwipe={onDelete}
        />
      )}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function DeleteAction({
  translation,
  tuck: maxTuck,
  fullSwipeDistance,
  accessibilityLabel,
  onPress,
  onFullSwipe,
}: {
  translation: SharedValue<number>;
  tuck: number;
  fullSwipeDistance: number;
  accessibilityLabel: string;
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
      if (dragged >= fullSwipeDistance && !fired.value) {
        fired.value = true;
        runOnJS(onFullSwipe)();
      }
    },
  );

  // The panel grows with the drag so the icon rides out with your thumb instead
  // of sitting in a fixed strip while red space opens behind it. The tuck grows
  // from zero, so nothing peeks out at rest.
  const panelStyle = useAnimatedStyle(() => {
    const dragged = Math.max(0, -translation.value);
    const tuck = Math.min(maxTuck, dragged);
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
        accessibilityLabel={accessibilityLabel}
      >
        <Animated.View style={iconStyle}>
          <Ionicons name="trash-outline" size={22} color={colors.textInverse} />
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((t) => ({
  // No background here on purpose. The action panel already widens with the
  // drag, so it covers everything the swipe exposes — and a red container
  // would show as a ring the moment the card scales down on press.
  swipeContainer: { overflow: 'hidden' },
  // Red belongs to the panel, which includes the part tucked under the card —
  // that tucked strip is exactly what fills the rounded corners.
  deletePanel: { backgroundColor: t.colors.danger },
  deleteAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
