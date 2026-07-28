/**
 * Shared chrome for every onboarding question.
 *
 * One decision per screen, so the headline IS the label — no eyebrow, no step
 * counter, no section header. What's left is a back pill, a bar that eases
 * forward, the question, and a CTA that stays dark until the answer is real.
 */
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, ProgressBar, Screen } from '@/components/ui';
import { useOnboarding } from './OnboardingContext';
import { useStepFlow } from './useStepFlow';

interface Props {
  title: string;
  subtitle?: string;
  /** Continue stays disabled until this is true. */
  valid: boolean;
  /** Defaults to advancing the flow; override only to do work first. */
  onContinue?: () => void;
  continueLabel?: string;
  /** Small print under the content — safety notes, privacy notes. */
  footnote?: string;
  /**
   * Centers the content in the space between title and footer. For screens
   * with one compact control (a wheel, a ruler) that would otherwise leave
   * the bottom half of the screen dead.
   */
  fill?: boolean;
  children: ReactNode;
}

export function OnboardingStep({
  title,
  subtitle,
  valid,
  onContinue,
  continueLabel,
  footnote,
  fill = false,
  children,
}: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { submitting, submitError } = useOnboarding();
  const { progress, prevProgress, isFirst, isLast, optional, goNext, goBack } =
    useStepFlow();

  const advance = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onContinue) onContinue();
    else void goNext();
  };

  return (
    <Screen
      scroll={!fill}
      keyboard
      wash
      tabBarClearance={false}
      footer={
        <View style={styles.footer}>
          {!!submitError && (
            <AppText variant="caption" color="dangerText" style={styles.error}>
              {submitError}
            </AppText>
          )}
          <Button
            title={continueLabel ?? (isLast ? 'Build my plan' : 'Continue')}
            variant="primary"
            disabled={!valid}
            loading={submitting}
            onPress={advance}
          />
        </View>
      }
    >
      <View style={styles.top}>
        {isFirst ? (
          <View style={styles.backSpacer} />
        ) : (
          <Pressable
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
        )}

        <View style={styles.progress}>
          <ProgressBar
            value={progress}
            animateFrom={prevProgress}
            gradient
            animated
          />
        </View>

        {optional ? (
          <Pressable
            onPress={() => void goNext()}
            hitSlop={12}
            accessibilityRole="button"
            style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
          >
            <AppText variant="caption" color="textSecondary">
              Skip
            </AppText>
          </Pressable>
        ) : (
          <View style={styles.skipSpacer} />
        )}
      </View>

      <AppText variant="display" style={styles.title}>
        {title}
      </AppText>
      {!!subtitle && (
        <AppText variant="body" color="textSecondary" style={styles.subtitle}>
          {subtitle}
        </AppText>
      )}

      <View style={[styles.content, fill && styles.contentFill]}>{children}</View>

      {!!footnote && (
        <AppText variant="caption" color="textTertiary" style={styles.footnote}>
          {footnote}
        </AppText>
      )}
    </Screen>
  );
}

/**
 * Quiet label above a control. The headline labels the screen, so this is only
 * for screens with more than one control — the wheel screens.
 */
export function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <AppText variant="label">{label}</AppText>
      {children}
    </View>
  );
}

/** Segmented control — small uniform option sets (unit systems). */
export function SegmentRow<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.segmentTrack}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => {
              if (!selected) {
                void Haptics.selectionAsync();
                onChange(opt.value);
              }
            }}
            style={[styles.segmentCell, selected && styles.segmentCellSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <AppText
              variant="bodyMedium"
              color={selected ? 'textPrimary' : 'textSecondary'}
            >
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    marginBottom: spacing.xxl,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.bgSubtle,
  },
  backSpacer: { width: 40, height: 40 },
  progress: { flex: 1 },
  skip: { minWidth: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
  skipSpacer: { width: spacing.xxs },
  pressed: { opacity: 0.6 },
  title: { marginBottom: spacing.sm },
  subtitle: { marginBottom: spacing.xs },
  content: { marginTop: spacing.xl, gap: spacing.xl },
  // Pull the control into the visual middle of the leftover space, with the
  // same bottom bias the footer creates up top.
  contentFill: { flex: 1, justifyContent: 'center', paddingBottom: spacing.xxxl },
  field: { gap: spacing.sm, alignItems: 'center' },
  footnote: { marginTop: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    // Sits below the scroll area on the screen wash — an opaque bg would
    // paint a band across the gradient.
    backgroundColor: 'transparent',
    gap: spacing.sm,
  },
  error: { textAlign: 'center' },
  segmentTrack: {
    flexDirection: 'row',
    backgroundColor: t.colors.bgSubtle,
    borderRadius: radius.md,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  segmentCell: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
  },
  segmentCellSelected: {
    backgroundColor: t.colors.card,
    ...t.shadows.xs,
    ...(t.scheme === 'dark'
      ? {
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.colors.borderStrong,
        }
      : null),
  },
}));
