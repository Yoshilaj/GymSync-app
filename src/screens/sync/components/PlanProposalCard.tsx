/**
 * The coach's proposed weekly plan, rendered inline in chat — like a coach
 * sliding a program across the table. Nothing is saved until Accept.
 *
 * Day rows collapse/expand (first day open by default); the footer changes
 * with the proposal's lifecycle: pending → accepting → accepted / failed.
 * Superseded proposals (a newer draft arrived) render dimmed and collapsed.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/theme';
import { AppText, Button, Card, Chip } from '@/components/ui';
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

function repsLabel(sets: number, low: number, high?: number): string {
  return high && high !== low ? `${sets} × ${low}–${high}` : `${sets} × ${low}`;
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
  return (
    <View style={styles.day}>
      <Pressable onPress={onToggle} style={styles.dayHeader} hitSlop={6}>
        <View style={styles.dayLabelBadge}>
          <AppText variant="label" color="accentText">
            {day.day_label}
          </AppText>
        </View>
        <AppText variant="bodyMedium" style={{ flex: 1 }}>
          {day.title}
        </AppText>
        {!!day.est_minutes && (
          <AppText variant="caption" color="textSecondary">
            ~{day.est_minutes}min
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
              <View style={{ flex: 1 }}>
                <AppText variant="body">{ex.exercise_name}</AppText>
                {!!ex.note && (
                  <AppText variant="caption" color="textSecondary">
                    {ex.note}
                  </AppText>
                )}
              </View>
              <AppText variant="bodyMedium" color="textSecondary">
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
  const [openDay, setOpenDay] = useState(0);
  const superseded = status === 'superseded';

  if (superseded) {
    return (
      <Card style={[styles.card, styles.supersededCard]}>
        <AppText variant="caption" color="textSecondary">
          Earlier draft — replaced by a newer plan below
        </AppText>
        <AppText variant="bodyMedium" color="textSecondary">
          {plan.name}
        </AppText>
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <AppText variant="h3" style={{ flex: 1 }}>
          {plan.name}
        </AppText>
        {!!plan.split_type && <Chip label={plan.split_type} size="sm" tone="accent" />}
      </View>
      {!!plan.rationale && (
        <AppText variant="caption" color="textSecondary" style={styles.rationale}>
          {plan.rationale}
        </AppText>
      )}

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

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  supersededCard: {
    opacity: 0.55,
    gap: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rationale: {
    marginTop: -spacing.xs,
  },
  days: {
    gap: spacing.xs,
  },
  day: {
    borderRadius: radius.md,
    backgroundColor: colors.bgSubtle,
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
  exercises: {
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
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
});
