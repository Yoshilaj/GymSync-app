/**
 * The coach's proposed weekly plan, rendered inline in chat. Compact and
 * scannable: one meta line up top, strictly one-line day rows (long LLM
 * titles are shortened client-side), tight exercise rows. Nothing is saved
 * until Accept.
 */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
}

/** '3×8–12' / '3×8' — compact, no spaces. */
function repsLabel(sets: number, low: number, high?: number): string {
  return high && high !== low ? `${sets}×${low}–${high}` : `${sets}×${low}`;
}

/**
 * 'Push — Chest, Shoulders & Triceps' → 'Push'. Splits on em/en dash, colon,
 * pipe, or a SPACED hyphen — in-word hyphens ('Full-Body') survive.
 */
function shortDayTitle(title: string): string {
  const head = title.split(/\s*(?:—|–|\||:)\s*|\s+-\s+/)[0].trim();
  return head || title;
}

/** 'Push/Pull/Legs · 3 days · ~55 min' — minutes averaged, rounded to 5. */
function metaLine(plan: PlanProposalWire): string {
  const parts: string[] = [];
  if (plan.split_type) parts.push(plan.split_type);
  parts.push(`${plan.days.length} day${plan.days.length === 1 ? '' : 's'}`);
  const mins = plan.days.map((d) => d.est_minutes).filter(Boolean) as number[];
  if (mins.length) {
    const avg = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length / 5) * 5;
    parts.push(`~${avg} min`);
  }
  return parts.join(' · ');
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
              <View style={styles.exerciseName}>
                <AppText variant="body" numberOfLines={1}>
                  {ex.exercise_name}
                </AppText>
                {!!ex.note && (
                  <AppText variant="caption" color="textSecondary" numberOfLines={1}>
                    {ex.note}
                  </AppText>
                )}
              </View>
              <AppText variant="caption" color="textSecondary" style={styles.reps}>
                {repsLabel(ex.sets, ex.reps_low, ex.reps_high)}
              </AppText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function PlanProposalCard({
  plan,
  status,
  onAccept,
  onRequestChanges,
  onViewPlan,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [openDay, setOpenDay] = useState(0);
  const superseded = status === 'superseded';

  if (superseded) {
    return (
      <Card style={[styles.card, styles.supersededCard]}>
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
    <Card style={styles.card}>
      <View style={styles.header}>
        <AppText variant="h3" numberOfLines={1}>
          {plan.name}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {metaLine(plan)}
        </AppText>
      </View>

      <View style={styles.days}>
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
          {status === 'failed' && (
            <AppText variant="caption" color="dangerText">
              Couldn't save the plan — check your connection and try again.
            </AppText>
          )}
          <Button
            title={status === 'accepting' ? 'Saving…' : 'Accept plan'}
            variant="primary"
            onPress={onAccept}
            disabled={status === 'accepting'}
          />
          <Button
            title="Request changes"
            variant="ghost"
            onPress={onRequestChanges}
            disabled={status === 'accepting'}
          />
        </View>
      )}
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    gap: spacing.sm,
  },
  supersededCard: {
    opacity: 0.55,
    gap: spacing.xs,
  },
  header: {
    gap: spacing.xxs,
  },
  days: {
    gap: spacing.xs,
  },
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
  dayLabelBadge: {
    minWidth: 44,
  },
  dayTitle: { flex: 1 },
  exercises: {
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  exerciseName: { flex: 1 },
  reps: { fontVariant: ['tabular-nums'] },
  footer: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
  },
}));
