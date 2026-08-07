/**
 * Ask before iOS asks.
 *
 * The workout screen starts the coach on its own — no tap, no warm-up — so the
 * system microphone prompt used to arrive cold, a few seconds after opening a
 * workout, over a screen already saying "Connecting". A permission dialog with
 * no stated reason gets declined, and on iOS that decline is final: the OS shows
 * its prompt exactly once and every later request resolves not-granted without
 * displaying anything. The only route back is Settings, which nobody takes.
 *
 * So this goes first, and it is deliberately cheap to refuse. Declining here
 * costs nothing — the OS prompt is never spent, the dock's mic button still
 * works, and the next workout can ask again. Only "Enable microphone" reaches
 * the real prompt, at which point the user has already agreed in principle.
 *
 * RN `Modal` rather than an absolutely-positioned overlay, for the same reason
 * DeleteAccountDialog uses one: the tab bar floats above screen content and an
 * in-screen scrim would leave it sitting lit on top of everything else.
 */
import { useEffect } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button } from '@/components/ui';

/**
 * What the microphone buys, in the user's terms rather than the feature's.
 *
 * Three, not five: this card is read in the two seconds before someone wants to
 * start lifting. Each label is written to the ~306pt column and holds one line
 * at the 1.2x Dynamic Type ceiling.
 */
const REASONS: { icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { icon: 'barbell-outline', label: 'Log sets by voice, hands-free' },
  { icon: 'chatbubble-ellipses-outline', label: 'Ask questions without stopping' },
  { icon: 'volume-medium-outline', label: 'Your coach calls the next move' },
];

/** Dialog proportions, matching DeleteAccountDialog — an object floating on the
 *  workout screen, not a panel spanning it. */
const CARD_MAX = 360;
const WELL = 68;

interface Props {
  visible: boolean;
  /** Proceed to the real OS prompt. */
  onEnable: () => void;
  /** Decline without spending the OS prompt. */
  onDismiss: () => void;
}

export function MicPrimingDialog({ visible, onEnable, onDismiss }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  const enter = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    // Not rewound on close: rewinding snapped the card away mid-fade.
    enter.value = withTiming(1, {
      duration: reduceMotion ? 0 : 200,
      easing: Easing.out(Easing.quad),
    });
  }, [visible, reduceMotion, enter]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.94 + 0.06 * enter.value }],
  }));

  const enable = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onEnable();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.root}>
        {/* Tap-outside is a decline, not a dead zone — refusing has to be as
            easy as accepting, or the card is a trap. */}
        <Pressable
          style={styles.scrim}
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Not now"
        />

        <Animated.View
          style={[
            styles.card,
            { maxWidth: Math.min(CARD_MAX, width - spacing.xl * 2) },
            cardStyle,
          ]}
          accessibilityViewIsModal
        >
          <View style={styles.well}>
            <Ionicons name="mic" size={32} color={colors.accent} />
          </View>

          <AppText variant="h2" align="center">
            Let your coach hear you
          </AppText>
          <AppText variant="body" color="textSecondary" align="center" style={styles.lead}>
            GymSync needs your microphone.
          </AppText>

          <View style={styles.list}>
            {REASONS.map((reason) => (
              <View key={reason.label} style={styles.item}>
                <Ionicons name={reason.icon} size={20} color={colors.textSecondary} />
                <AppText variant="body" style={styles.itemLabel}>
                  {reason.label}
                </AppText>
              </View>
            ))}
          </View>

          <AppText variant="caption" color="textTertiary" style={styles.note}>
            The mic runs only while a workout session is open.
          </AppText>

          <View style={styles.actions}>
            <Button title="Enable microphone" onPress={enable} />
            {/* ghost, not secondary: an outlined button on a white card reads as
                an empty box competing with the real action. */}
            <Button title="Not now" variant="ghost" onPress={onDismiss} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  // Fills the modal including under the card; absoluteFill would stop at the
  // padded root's edges.
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: t.colors.scrimOverlay,
  },
  card: {
    width: '100%',
    backgroundColor: t.colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'stretch',
    ...t.shadows.lg,
    ...(t.scheme === 'dark'
      ? { borderWidth: 1, borderColor: t.colors.borderStrong }
      : null),
  },
  well: {
    width: WELL,
    height: WELL,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  // xs binds the headline to its one-line consequence — one thought.
  lead: { marginTop: spacing.xs },
  // xl is the card's section break: title block | list block | actions.
  list: { marginTop: spacing.xl, gap: spacing.sm },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  // flex so a long label wraps inside its own column rather than pushing the
  // row past the card padding.
  itemLabel: { flex: 1 },
  note: { marginTop: spacing.lg },
  actions: { gap: spacing.sm, marginTop: spacing.xl },
}));
