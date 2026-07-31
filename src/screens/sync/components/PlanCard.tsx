/**
 * The coach's proposed weekly plan — a fully custom card in the same design
 * family as WorkoutHeroCard/RestDayCard: deep-navy gradient header with a
 * quiet ripple motif, one meta line, collapsible one-line day rows, and a
 * sophisticated ink Accept button. Nothing is saved until Accept.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, Card } from '@/components/ui';
import type { PlanProposalDay, PlanProposalWire } from '@/voice';
import type { ProposalStatus } from '@/voice/useTextChat';

interface Props {
  plan: PlanProposalWire;
  status: ProposalStatus;
  onAccept: () => void;
  onRequestChanges: () => void;
  /** Accepted state: jump to the Plan tab. */
  onViewPlan: () => void;
  /** Onboarding overrides: "Start training" / "Regenerate". */
  acceptLabel?: string;
  secondaryLabel?: string;
  /** Which day starts expanded. Default: the first (chat's behavior); pass
   *  null for all-collapsed — the onboarding reveal reads better as a
   *  scannable week than with one day pre-opened. */
  initialOpenDay?: number | null;
  /**
   * Ways the plan doesn't match the profile — wrong number of days, a session
   * far over the user's time budget, a movement an active injury says to
   * avoid. The server has always computed these and no screen ever showed
   * them, which is how a plan full of exercises the app couldn't render
   * shipped unnoticed. Usually empty.
   */
  warnings?: string[];
}

/** "4 – 6 reps × 4 sets" — reps range first, then sets, spelled out. */
function repsSetsLabel(sets: number, low: number, high?: number): string {
  const range = high && high !== low ? `${low} – ${high}` : `${low}`;
  return `${range} reps × ${sets} sets`;
}

/** 'Push — Chest, Shoulders & Triceps' → 'Push' (in-word hyphens survive). */
function shortDayTitle(title: string): string {
  const head = title.split(/\s*(?:—|–|\||:)\s*|\s+-\s+/)[0].trim();
  return head || title;
}

/** "4 days · 90 mins" — the card's single meta line. */
function metaLine(plan: PlanProposalWire): string {
  const parts = [`${plan.days.length} day${plan.days.length === 1 ? '' : 's'}`];
  const mins = plan.days.map((d) => d.est_minutes).filter(Boolean) as number[];
  if (mins.length) {
    const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length / 5) * 5;
    parts.push(`${avg} mins`);
  }
  return parts.join(' · ');
}

function HeaderDeco() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Circle cx="90%" cy={-6} r={30} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.10)" />
        <Circle cx="90%" cy={-6} r={56} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.06)" />
        <Circle cx="90%" cy={-6} r={86} fill="none" strokeWidth={1.5} stroke="rgba(255,255,255,0.035)" />
        <Circle cx="12%" cy={70} r={1.8} fill="rgba(255,255,255,0.28)" />
        <Circle cx="30%" cy={16} r={1.4} fill="rgba(255,255,255,0.22)" />
      </Svg>
    </View>
  );
}

function DayRow({
  day,
  expanded,
  onToggle,
}: {
  day: PlanProposalDay;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.day}>
      <Pressable onPress={onToggle} style={styles.dayHeader} hitSlop={6}>
        <View style={styles.dayLabelBadge}>
          <AppText variant="label" color="accentText">
            {day.day_label}
          </AppText>
        </View>
        <AppText variant="bodyMedium" numberOfLines={1} style={styles.dayTitle}>
          {shortDayTitle(day.title)}
        </AppText>
        {!expanded && (
          <AppText variant="caption" color="textSecondary">
            {day.exercises.length} exercises
          </AppText>
        )}
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textSecondary}
        />
      </Pressable>
      {expanded && (
        <View style={styles.exercises}>
          {day.exercises.map((ex, i) => (
            <View key={`${ex.exercise_name}-${i}`} style={styles.exerciseRow}>
              <AppText variant="body" numberOfLines={1} style={styles.exerciseName}>
                {ex.exercise_name}
              </AppText>
              <AppText variant="caption" color="textSecondary" style={styles.reps}>
                {repsSetsLabel(ex.sets, ex.reps_low, ex.reps_high)}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function PlanCard({
  plan,
  status,
  onAccept,
  onRequestChanges,
  onViewPlan,
  acceptLabel = 'Accept plan',
  secondaryLabel = 'Request changes',
  initialOpenDay = 0,
  warnings = [],
}: Props) {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const [openDay, setOpenDay] = useState<number | null>(initialOpenDay);

  if (status === 'superseded') {
    // A dead draft doesn't earn decoration.
    return (
      <Card style={styles.supersededCard}>
        <AppText variant="caption" color="textSecondary">
          Earlier draft — replaced by a newer plan below
        </AppText>
        <AppText variant="bodyMedium" color="textSecondary" numberOfLines={1}>
          {plan.name}
        </AppText>
      </Card>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <LinearGradient
          colors={gradients.navyDeep}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.header}
        >
          <HeaderDeco />
          <AppText variant="label" color="rgba(255,255,255,0.7)">
            Weekly plan
          </AppText>
          <AppText variant="h2" color="textInverse" numberOfLines={1} style={styles.headerTitle}>
            {plan.name}
          </AppText>
          <AppText variant="caption" color="rgba(255,255,255,0.75)" style={styles.headerMeta}>
            {metaLine(plan)}
          </AppText>
        </LinearGradient>

        <View style={styles.body}>
          {plan.days.map((day, i) => (
            <DayRow
              key={`${day.day_label}-${i}`}
              day={day}
              expanded={openDay === i}
              onToggle={() => setOpenDay(openDay === i ? -1 : i)}
            />
          ))}
        </View>

        {status === 'accepted' ? (
          <View style={styles.footer}>
            <View style={styles.liveRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.successText} />
              <AppText variant="bodyMedium" color="successText">
                Plan is live
              </AppText>
            </View>
            <Button title="View plan" variant="secondary" onPress={onViewPlan} />
          </View>
        ) : (
          <View style={styles.footer}>
            {warnings.length > 0 && (
              <View style={styles.warnings}>
                {warnings.map((w) => (
                  <View key={w} style={styles.warningRow}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={14}
                      color={colors.warningText}
                      style={styles.warningIcon}
                    />
                    <AppText variant="caption" color="warningText" style={styles.warningText}>
                      {w}
                    </AppText>
                  </View>
                ))}
              </View>
            )}
            {status === 'failed' && (
              <AppText variant="caption" color="dangerText">
                Couldn't save the plan — check your connection and try again.
              </AppText>
            )}
            <Button
              title={acceptLabel}
              variant="solid"
              loading={status === 'accepting'}
              onPress={onAccept}
              disabled={status === 'accepting'}
            />
            <Button
              title={secondaryLabel}
              variant="ghost"
              size="md"
              onPress={onRequestChanges}
              disabled={status === 'accepting'}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { ...t.shadows.md, borderRadius: radius.xl },
  card: {
    borderRadius: radius.xl,
    backgroundColor: t.colors.card,
    overflow: 'hidden',
    ...(t.scheme === 'dark'
      ? { borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border }
      : null),
  },
  header: { padding: spacing.lg },
  headerTitle: { marginTop: spacing.sm },
  headerMeta: { marginTop: spacing.xs },
  body: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.xs },
  day: {
    borderRadius: radius.md,
    backgroundColor: t.colors.bgSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  dayLabelBadge: { minWidth: 44 },
  dayTitle: { flex: 1 },
  exercises: { paddingBottom: spacing.sm, gap: spacing.sm },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  exerciseName: { flex: 1 },
  reps: { fontVariant: ['tabular-nums'] },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  // No panel or tinted box — these sit as quiet notes above the buttons, in
  // the same footer rhythm as the failure caption.
  warnings: {
    gap: spacing.xxs,
  },
  warningRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  warningIcon: {
    // Optical align with the caption's cap height rather than its box.
    marginTop: 1,
  },
  warningText: {
    flex: 1,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  supersededCard: { opacity: 0.55, gap: spacing.xs },
}));
