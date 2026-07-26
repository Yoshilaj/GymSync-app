/**
 * Shared chrome for every onboarding step: progress bar, back chevron,
 * question heading, content, and a pinned Continue button that stays
 * disabled until the step is valid.
 */
import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '@/theme';
import { AppText, Button, Chip, ProgressBar, Screen } from '@/components/ui';

export const TOTAL_STEPS = 6;

interface Props {
  step: number; // 1-based
  title: string;
  subtitle?: string;
  valid: boolean;
  onContinue: () => void;
  continueLabel?: string;
  continueLoading?: boolean;
  children: ReactNode;
}

export function OnboardingStep({
  step,
  title,
  subtitle,
  valid,
  onContinue,
  continueLabel = 'Continue',
  continueLoading = false,
  children,
}: Props) {
  const nav = useNavigation();

  return (
    <Screen
      scroll
      keyboard
      tabBarClearance={false}
      footer={
        <View style={styles.footer}>
          <Button
            title={continueLabel}
            variant="primary"
            disabled={!valid}
            loading={continueLoading}
            onPress={onContinue}
          />
        </View>
      }
    >
      <View style={styles.top}>
        {nav.canGoBack() ? (
          <Pressable onPress={() => nav.goBack()} hitSlop={12} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
        <View style={styles.progress}>
          <ProgressBar value={step / TOTAL_STEPS} gradient />
        </View>
        <AppText variant="caption" color="textTertiary">
          {step}/{TOTAL_STEPS}
        </AppText>
      </View>

      <AppText variant="h1" style={styles.title}>
        {title}
      </AppText>
      {!!subtitle && (
        <AppText variant="caption" color="textSecondary" style={styles.subtitle}>
          {subtitle}
        </AppText>
      )}

      <View style={styles.content}>{children}</View>
    </Screen>
  );
}

/** A wrapping grid of selectable chips — the standard onboarding select. */
export function ChipGrid({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.chipGrid}>
      {options.map((opt) => (
        <Chip
          key={opt.value}
          label={opt.label}
          selected={selected.includes(opt.value)}
          onPress={() => onToggle(opt.value)}
        />
      ))}
    </View>
  );
}

/** Uppercase section label above a question cluster. */
export function StepSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="label">{label}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  back: {
    width: 44,
    height: 44,
    justifyContent: 'center',
  },
  progress: { flex: 1 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.sm },
  content: {
    marginTop: spacing.lg,
    gap: spacing.xl,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  section: {
    gap: spacing.sm,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
  },
});
