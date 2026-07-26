/**
 * Shared building blocks for the settings pages — keeps ~15 screens visually
 * consistent and DRY. All theme-aware (makeStyles/useTheme) from the start.
 *
 * - SettingsPage: Screen + detail header + gutter content.
 * - SettingsGroup: optional SectionHeader + a Card of rows with hairline
 *   dividers auto-inserted between them.
 * - SelectRow: a radio-style choice row (uses ListRow `selected`).
 * - ToggleRow: a row with a themed Switch.
 * - ValueRow: a row with right-aligned secondary text.
 */
import React, { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, spacing, useTheme } from '@/theme';
import { AppText, Card, ListRow, Screen } from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SectionHeader } from '@/components/SectionHeader';

export function SettingsPage({
  title,
  subtitle,
  children,
  footer,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Screen scroll padded={false} tabBarClearance={false} footer={footer}>
      <ScreenHeader variant="detail" title={title} subtitle={subtitle} />
      <View style={styles.content}>{children}</View>
    </Screen>
  );
}

export function SettingsGroup({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {title ? <SectionHeader title={title} subtitle={subtitle} /> : null}
      <Card padded={false}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {row}
            {i < rows.length - 1 ? <View style={styles.divider} /> : null}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

export function SelectRow({
  label,
  sublabel,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ListRow
      title={label}
      subtitle={sublabel}
      selected={selected}
      onPress={disabled ? undefined : onPress}
      right={
        disabled ? (
          <AppText variant="caption" color="textTertiary">
            Soon
          </AppText>
        ) : selected ? undefined : (
          <Ionicons name="ellipse-outline" size={20} color={colors.textTertiary} />
        )
      }
      style={disabled ? { opacity: 0.5 } : undefined}
    />
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
  return (
    <ListRow
      title={label}
      subtitle={sublabel}
      right={
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: colors.border, true: colors.accentSoft }}
          thumbColor={value ? colors.accent : colors.card}
        />
      }
    />
  );
}

export function ValueRow({
  label,
  value,
  onPress,
  chevron,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  chevron?: boolean;
}) {
  return (
    <ListRow
      title={label}
      onPress={onPress}
      chevron={chevron}
      right={
        value ? (
          <AppText variant="body" color="textSecondary">
            {value}
          </AppText>
        ) : undefined
      }
    />
  );
}

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  group: { marginBottom: spacing.sm },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
    marginLeft: spacing.lg,
  },
}));
