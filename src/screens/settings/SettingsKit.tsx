/**
 * Shared building blocks for the settings pages — the "Quiet Pro" kit.
 * Instagram-style information design: plain 22pt outline icons on a rail (no
 * tinted wells), `body`-weight titles, quiet uppercase group headers, trailing
 * values, a single accent checkmark for selection, and bare red rows for
 * destructive actions. All theme-aware from the start.
 *
 * - SettingsPage: Screen + detail header + gutter content.
 * - SettingsGroup: quiet header + a Card of rows with hairline dividers,
 *   optional footnote caption underneath.
 * - SettingsRow: the base row (icon rail / title / value / chevron).
 * - CheckRow: single- or multi-select row — checkmark when on, nothing when off.
 * - ToggleRow: SettingsRow anatomy with a themed Switch.
 * - DestructiveRow: bare red text row (sign out, delete account).
 * - WheelRow: collapsed value row that accordions open to a number wheel.
 */
import React, {
  Children,
  Fragment,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { makeStyles, spacing, useTheme } from '@/theme';
import {
  AnimatedPressable,
  AppText,
  Card,
  Screen,
  WHEEL_HEIGHT,
} from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';

export function SettingsPage({
  title,
  subtitle,
  children,
  footer,
  tabBarClearance = true,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /**
   * Off when this page is pushed on top of a modal (the paywall pushes Legal),
   * where there is no floating tab bar to clear and the clearance would read as
   * a dead gap at the end of the page.
   */
  tabBarClearance?: boolean;
}) {
  const styles = useStyles();
  return (
    // Settings screens normally live INSIDE the tab navigator, so both the
    // scroll content and any pinned footer must clear the floating tab bar.
    <Screen scroll padded={false} footer={footer} tabBarClearance={tabBarClearance}>
      <ScreenHeader variant="detail" title={title} subtitle={subtitle} />
      <View style={styles.content}>{children}</View>
    </Screen>
  );
}

export function SettingsGroup({
  title,
  footnote,
  inset,
  children,
}: {
  title?: string;
  /** Quiet caption under the card — context, not chrome. */
  footnote?: string;
  /** Align dividers past the icon rail (rows with leading icons). */
  inset?: boolean;
  children: ReactNode;
}) {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title ? (
        <AppText variant="label" color="textTertiary" style={styles.groupHeader}>
          {title}
        </AppText>
      ) : null}
      <Card padded={false}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {row}
            {i < rows.length - 1 ? (
              <View style={[styles.divider, inset && styles.dividerInset]} />
            ) : null}
          </Fragment>
        ))}
      </Card>
      {footnote ? (
        <AppText variant="caption" color="textTertiary" style={styles.footnote}>
          {footnote}
        </AppText>
      ) : null}
    </View>
  );
}

export function SettingsRow({
  label,
  sublabel,
  icon,
  value,
  chevron,
  onPress,
  tone = 'default',
  disabled,
  right,
}: {
  label: string;
  sublabel?: string;
  /** Plain outline glyph on a fixed rail — no tinted well. */
  icon?: keyof typeof Ionicons.glyphMap;
  /** Trailing secondary value ("Free", "Kilograms", "75.6 kg"). */
  value?: string;
  chevron?: boolean;
  onPress?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const fg = tone === 'danger' ? colors.dangerText : colors.textPrimary;

  const body = (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      {icon ? (
        <View style={styles.iconRail}>
          <Ionicons name={icon} size={22} color={fg} />
        </View>
      ) : null}
      <View style={styles.textBlock}>
        <AppText variant="body" color={tone === 'danger' ? 'dangerText' : 'textPrimary'} numberOfLines={1}>
          {label}
        </AppText>
        {sublabel ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={2}>
            {sublabel}
          </AppText>
        ) : null}
      </View>
      {disabled ? (
        <AppText variant="caption" color="textTertiary">
          Coming soon
        </AppText>
      ) : (
        <>
          {value ? (
            <AppText
              variant="body"
              color="textSecondary"
              numberOfLines={1}
              style={styles.value}
            >
              {value}
            </AppText>
          ) : null}
          {right}
          {chevron ? (
            <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
          ) : null}
        </>
      )}
    </View>
  );

  if (!onPress || disabled) return body;
  return <AnimatedPressable onPress={onPress}>{body}</AnimatedPressable>;
}

export function CheckRow({
  label,
  sublabel,
  selected,
  disabled,
  multi,
  onPress,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  disabled?: boolean;
  /** Checkbox semantics (multi-select) instead of radio. */
  multi?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  const body = (
    <View
      style={[styles.row, disabled && styles.rowDisabled]}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ selected, disabled }}
    >
      <View style={styles.textBlock}>
        <AppText variant="body" numberOfLines={1}>
          {label}
        </AppText>
        {sublabel ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={2}>
            {sublabel}
          </AppText>
        ) : null}
      </View>
      {disabled ? (
        <AppText variant="caption" color="textTertiary">
          Coming soon
        </AppText>
      ) : (
        <View style={styles.checkSlot}>
          {selected ? (
            <Ionicons name="checkmark" size={22} color={colors.accent} />
          ) : null}
        </View>
      )}
    </View>
  );

  if (disabled) return body;
  return (
    <AnimatedPressable
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
    >
      {body}
    </AnimatedPressable>
  );
}

export function ToggleRow({
  label,
  sublabel,
  value,
  onValueChange,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <AppText variant="body" numberOfLines={1}>
          {label}
        </AppText>
        {sublabel ? (
          <AppText variant="caption" color="textSecondary" numberOfLines={2}>
            {sublabel}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.accentSoft }}
        thumbColor={value ? colors.accent : colors.card}
      />
    </View>
  );
}

/** Bare red text row — sign out, delete account. No icon, no chevron. */
export function DestructiveRow({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <AnimatedPressable onPress={onPress}>
      <View style={styles.row} accessibilityRole="button">
        <AppText variant="body" color="dangerText">
          {label}
        </AppText>
      </View>
    </AnimatedPressable>
  );
}

/**
 * A value row that accordions open to reveal wheel pickers. Controlled open
 * state so a screen can keep exactly one accordion open (`openKey` pattern).
 * The children are the wheels (NumberWheel / WheelUnit inside).
 */
export function WheelRow({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  /** Current display value ("1998", "5 ft 10 in", "75.6 kg"). */
  value: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(open ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: reduceMotion ? 0 : 220,
    });
  }, [open, progress, reduceMotion]);

  const wellStyle = useAnimatedStyle(() => ({
    height: progress.value * (WHEEL_HEIGHT + spacing.md * 2),
    opacity: progress.value,
  }));
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <View>
      <AnimatedPressable
        onPress={() => {
          void Haptics.selectionAsync();
          onToggle();
        }}
      >
        <View
          style={styles.row}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <View style={styles.textBlock}>
            <AppText variant="body" numberOfLines={1}>
              {label}
            </AppText>
          </View>
          <AppText variant="body" color="textSecondary" numberOfLines={1}>
            {value}
          </AppText>
          <Animated.View style={chevronStyle}>
            <Ionicons name="chevron-down" size={18} color={colors.textTertiary} />
          </Animated.View>
        </View>
      </AnimatedPressable>
      <Animated.View style={[styles.wheelWell, wellStyle]}>
        <View style={styles.wheelWellInner}>{children}</View>
      </Animated.View>
    </View>
  );
}

/**
 * Debounced optimistic commit for wheel edits: the UI tracks the wheel
 * instantly; `save` fires 500ms after the last tick and flushes on unmount.
 */
export function useDebouncedCommit(save: (value: number) => void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<number | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== null) saveRef.current(pending.current);
    },
    [],
  );

  return (value: number) => {
    pending.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pending.current = null;
      saveRef.current(value);
    }, delay);
  };
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  group: { marginBottom: spacing.xl },
  groupHeader: {
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  footnote: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
    marginLeft: spacing.lg,
  },
  dividerInset: {
    // Past the 26pt icon rail: lg pad + rail + md gap.
    marginLeft: spacing.lg + 26 + spacing.md,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowDisabled: { opacity: 0.5 },
  iconRail: { width: 26, alignItems: 'center' },
  textBlock: { flex: 1, gap: spacing.xxs },
  value: { flexShrink: 1, maxWidth: '55%' },
  checkSlot: { width: 22, alignItems: 'center' },
  wheelWell: {
    overflow: 'hidden',
    backgroundColor: t.colors.bgSubtle,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  wheelWellInner: {
    height: WHEEL_HEIGHT + spacing.md * 2,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
