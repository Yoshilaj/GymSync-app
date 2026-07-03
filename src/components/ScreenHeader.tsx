import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, layout, radius, spacing } from '@/theme';
import { useUser } from '@/context/UserContext';
import { AppText } from '@/components/ui/AppText';

interface Props {
  /** brand = tab roots (wordmark + avatar); detail = pushed screens (back + centered title). */
  variant?: 'brand' | 'detail';
  title?: string;
  subtitle?: string;
  /** Right-side slot (action icon, chip, …). */
  right?: ReactNode;
  /** Detail variant: override the default goBack. */
  onBack?: () => void;
}

export function ScreenHeader({
  variant = 'brand',
  title,
  subtitle,
  right,
  onBack,
}: Props) {
  const nav = useNavigation<any>();

  if (variant === 'detail') {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={onBack ?? (() => nav.goBack())}
          hitSlop={8}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={styles.centerBlock}>
          {title ? (
            <AppText variant="h3" align="center" numberOfLines={1}>
              {title}
            </AppText>
          ) : null}
          {subtitle ? (
            <AppText variant="caption" align="center" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <View style={styles.rightSlot}>{right}</View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.brandBlock}>
        <AppText variant="h1">{title ?? 'GymSync'}</AppText>
        {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
      </View>
      {right}
      <Avatar />
    </View>
  );
}

function Avatar() {
  const nav = useNavigation<any>();
  const { user } = useUser();
  const initial = (user.displayName?.[0] ?? 'Y').toUpperCase();

  return (
    <Pressable
      onPress={() => nav.getParent()?.navigate('Settings') ?? nav.navigate('Settings')}
      hitSlop={10}
      style={styles.avatar}
    >
      <AppText variant="caption" color="accentText" style={styles.avatarText}>
        {initial}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.md,
    minHeight: 56,
  },
  brandBlock: { flex: 1, gap: spacing.xxs },
  centerBlock: { flex: 1, gap: spacing.xxs },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rightSlot: { width: 34, alignItems: 'flex-end' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFaint,
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14 },
});
