/**
 * FAQ.
 *
 * Grouped rather than a flat list, and one answer open at a time. A single card
 * of five questions made the reader scan every question to find theirs; five
 * labelled groups let them skip four of them. The accordion is the same
 * anatomy as the rest of settings — quiet uppercase group header, hairline
 * dividers, a chevron that turns — so this reads as a settings page and not as
 * a help article bolted onto one.
 *
 * The answers name exact paths ("Settings → Units") and exact behaviour. A FAQ
 * that says "you can customise this in settings" has answered nothing, and the
 * questions people actually ask a training app are specific: does it keep my
 * sets, what happens if I close it mid-workout, what does the paid tier buy.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { makeStyles, spacing, useTheme } from '@/theme';
import { AnimatedPressable, AppText } from '@/components/ui';
import { TRIAL_DAYS } from '@/screens/pricing';
import type { SettingsStackParamList } from '@/navigation/SettingsNavigator';
import { SettingsGroup, SettingsPage, SettingsRow } from './SettingsKit';

type Nav = NativeStackNavigationProp<SettingsStackParamList, 'Faq'>;

interface Qa {
  q: string;
  a: string;
}

/**
 * Emoji on the group headers to match the Settings home groups. The order is
 * the order a new user meets the app: the plan comes first, billing and data
 * are what they come back for.
 */
const GROUPS: { title: string; items: Qa[] }[] = [
  {
    title: '🏋️  Your plan',
    items: [
      {
        q: 'How does the coach build my plan?',
        a: 'It reads the profile you filled in during onboarding — goals, experience, how many days you train, how long a session runs, your equipment, and any injuries — and checks that against a curated strength-training research corpus before proposing a week. Nothing is saved until you accept it.',
      },
      {
        q: 'Can I change my plan after it is made?',
        a: 'Yes, two ways. On the Plan tab you can add or remove exercises directly. Or just ask in chat — "swap barbell row for something on a machine", "make Friday shorter" — and the coach edits the plan for you.',
      },
      {
        q: 'How often should I get a new plan?',
        a: "Only when something real changes: a new goal, a different schedule, or you've genuinely outgrown the loads. A plan you stay on long enough to add weight to beats a fresh one every week.",
      },
      {
        q: 'What if I pick up an injury?',
        a: "Tell the coach — in chat, out loud mid-session, or with the medkit button at the top of the workout screen. On Premium it records the area and the movement patterns to avoid, and programs around them from then on; on Free and Pro the coach adapts in the moment but doesn't keep a record. Anything you flagged during onboarding is factored into your plans on every tier.",
      },
    ],
  },
  {
    title: '🎙  Voice coaching',
    items: [
      {
        q: 'Can I talk to my coach hands-free?',
        a: "Yes. Start a voice session and just speak — it listens only while you're talking and answers out loud, so you never touch the phone between sets.",
      },
      {
        q: 'Can it log my sets while I lift?',
        a: 'Say the set out loud — "135 for 8" — and it records it, starts your rest timer, and tells you what is next. You can also ask it to swap an exercise or skip ahead without stopping.',
      },
      {
        q: 'Can I change how my coach sounds?',
        a: 'Settings → Workout → Coach personality. Supportive, Classic, or Energetic — each one has its own voice as well as its own manner.',
      },
      {
        q: 'What happens if I close the app mid-workout?',
        a: 'Nothing is lost. Reopen it and the session resumes on the same exercise and set, with your logged sets intact — leaving the app does not end a workout.',
      },
    ],
  },
  {
    title: '📈  Logging & progress',
    items: [
      {
        q: 'Are my workouts saved?',
        a: 'Every set, plan, weigh-in, and conversation is stored to your account, so it follows you to any device you sign in on.',
      },
      {
        q: 'Where do I see my progress?',
        a: 'The Progress tab: your streak, sessions this week, recent personal records, strength and volume trends per exercise, and your body-weight log.',
      },
      {
        q: 'How do I switch between pounds and kilograms?',
        a: 'Settings → Units. Weights are stored independently of how they are shown, so past logs re-display in your choice too — nothing is converted or rounded away.',
      },
    ],
  },
  {
    title: '💳  Plans & billing',
    items: [
      {
        q: 'What do Pro and Premium add?',
        a: 'Free covers workout logging, one AI-generated plan, and progress charts. Pro adds live voice coaching, hands-free set logging, and unlimited chat and plan generation. Premium lifts the voice session limit and adds evidence-based progression, injury awareness, and long-term memory. Settings → Plan lists all three side by side.',
      },
      {
        q: 'Is there a free trial?',
        a: `Both paid tiers start with a ${TRIAL_DAYS}-day trial. You are not charged until it ends, and cancelling during the trial costs nothing.`,
      },
      {
        q: 'How do I cancel?',
        a: 'Subscriptions are handled by Apple, not by us: on your device, open Settings → your name → Subscriptions. You keep the paid features until the period you have already paid for runs out, and your data is untouched either way.',
      },
    ],
  },
  {
    title: '🔒  Your data',
    items: [
      {
        q: 'Who can see my training data?',
        a: 'Only you. It is tied to your account and used to coach you — it is not sold, and it is not used to advertise to you. The full detail is in Settings → About us → Privacy policy.',
      },
      {
        q: 'How do I delete everything?',
        a: "Settings → Account settings → Delete account. It erases your profile, plans, training history, and conversations straight away, and it can't be undone.",
      },
    ],
  },
];

function FaqRow({
  item,
  open,
  onToggle,
}: {
  item: Qa;
  open: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    turn.value = withTiming(open ? 1 : 0, {
      duration: reduceMotion ? 0 : 200,
      easing: Easing.out(Easing.quad),
    });
  }, [open, reduceMotion, turn]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${turn.value * 180}deg` }],
  }));

  return (
    // `layout` animates the row's height as the answer appears, so the rows
    // below glide down instead of jumping.
    <Animated.View layout={reduceMotion ? undefined : LinearTransition.duration(220)}>
      {/* The pressable owns the padding, not its parent — the tap target has to
          BE the 52pt row, not the 28pt line of text inside it. */}
      <AnimatedPressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={styles.qRow}>
          <AppText variant="bodyMedium" style={styles.question}>
            {item.q}
          </AppText>
          <Animated.View style={chevronStyle}>
            <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
          </Animated.View>
        </View>
      </AnimatedPressable>

      {open ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(180)}
          style={styles.answerWrap}
        >
          <AppText variant="body" color="textSecondary">
            {item.a}
          </AppText>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export function FaqScreen() {
  const nav = useNavigation<Nav>();
  // One answer at a time: a page of everything open is the wall of text this
  // screen exists to avoid. Keyed by question, which is unique across groups.
  const [openKey, setOpenKey] = useState<string | null>(null);

  return (
    <SettingsPage title="FAQ">
      {GROUPS.map((group) => (
        <SettingsGroup key={group.title} title={group.title}>
          {group.items.map((item) => (
            <FaqRow
              key={item.q}
              item={item}
              open={openKey === item.q}
              onToggle={() =>
                setOpenKey((cur) => (cur === item.q ? null : item.q))
              }
            />
          ))}
        </SettingsGroup>
      ))}

      {/* Every FAQ ends here — the one question it didn't answer. */}
      <SettingsGroup>
        <SettingsRow
          label="Still stuck? Contact support"
          icon="mail-outline"
          chevron
          onPress={() => nav.navigate('Inquiry')}
        />
      </SettingsGroup>
    </SettingsPage>
  );
}

const useStyles = makeStyles(() => ({
  // 52pt matches the settings kit's row, so a closed FAQ group is the same
  // rhythm as any other group of rows in Settings.
  qRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  // Holds the chevron hard right however many lines the question takes.
  question: { flex: 1 },
  // The question row's own bottom padding supplies the gap above the answer;
  // this only has to buy space before the divider underneath.
  answerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
}));
