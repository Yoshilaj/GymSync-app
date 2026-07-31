import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, Chip, Skeleton } from '@/components/ui';

export interface HeroStat {
  label: string;
  value: string;
  unit?: string;
}

interface Props {
  badge: { icon: keyof typeof Ionicons.glyphMap; label: string };
  title: string;
  durationMin?: number;
  muscles: string[];
  stats: HeroStat[];
  action?: {
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  };
  /** upcoming = brand gradient; completed = white card with success accents. */
  tone?: 'upcoming' | 'completed';
}

/** The one workout hero card — shared by the Plan tab and day details. */
export function WorkoutHeroCard({
  badge,
  title,
  durationMin,
  muscles,
  stats,
  action,
  tone = 'upcoming',
}: Props) {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  const onGradient = tone === 'upcoming';
  const fg = onGradient ? colors.textInverse : colors.textPrimary;
  const fgSoft = onGradient ? 'rgba(255,255,255,0.85)' : colors.textSecondary;

  // Plan titles arrive as "Upper A — Strength Focus"; the dash suffix becomes
  // a small subtitle so the display line never wraps.
  const [mainTitle, focus] = (() => {
    const parts = title.split(/\s+[—–-]+\s+/);
    return parts.length > 1 ? [parts[0], parts.slice(1).join(' · ')] : [title, null];
  })();

  const inner = (
    <>
      {onGradient && <View style={styles.glow} pointerEvents="none" />}
      <View style={styles.topRow}>
        <View style={[styles.badge, !onGradient && styles.badgeCompleted]}>
          <Ionicons
            name={badge.icon}
            size={14}
            color={onGradient ? colors.textInverse : colors.successText}
          />
          <AppText
            variant="label"
            color={onGradient ? colors.textInverse : colors.successText}
          >
            {badge.label}
          </AppText>
        </View>
        {durationMin != null && (
          <AppText variant="caption" color={fgSoft}>
            {durationMin} min
          </AppText>
        )}
      </View>

      <AppText variant="h1" color={fg} style={styles.title} numberOfLines={1}>
        {mainTitle}
      </AppText>
      {focus ? (
        <AppText variant="label" color={fgSoft} style={styles.focus}>
          {focus}
        </AppText>
      ) : null}

      {muscles.length > 0 && (
        // One line always — long muscle lists scroll instead of wrapping.
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.musclesScroll}
          contentContainerStyle={styles.muscles}
        >
          {muscles.map((m) => (
            <Chip
              key={m}
              label={m}
              size="sm"
              tone={onGradient ? 'onAccent' : 'accent'}
            />
          ))}
        </ScrollView>
      )}

      <View style={[styles.statsRow, !onGradient && styles.statsRowCompleted]}>
        {stats.map((s, i) => (
          <View key={s.label} style={styles.statCell}>
            {i > 0 && (
              <View
                style={[
                  styles.statDivider,
                  { backgroundColor: onGradient ? 'rgba(255,255,255,0.35)' : colors.border },
                ]}
              />
            )}
            <View style={styles.statInner}>
              <AppText variant="statSm" color={fg}>
                {s.value}
                {s.unit ? (
                  <AppText variant="caption" color={fgSoft}>
                    {' '}
                    {s.unit}
                  </AppText>
                ) : null}
              </AppText>
              <AppText variant="label" color={fgSoft}>
                {s.label}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      {action && (
        <Button
          title={action.label}
          icon={action.icon}
          onPress={action.onPress}
          variant={onGradient ? 'secondary' : 'primary'}
          style={styles.action}
        />
      )}
    </>
  );

  if (onGradient) {
    return (
      <View style={styles.shadowWrap}>
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.card}
        >
          {inner}
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.shadowWrap}>
      <View style={[styles.card, styles.cardCompleted]}>{inner}</View>
    </View>
  );
}

/**
 * The hero's shape while the plan loads. Deliberately uses the neutral
 * `cardCompleted` surface rather than the brand gradient: grey blocks on
 * full-saturation blue read as a rendering failure, and the white sweep is
 * invisible against it. The gradient arrives with the data.
 *
 * Colocated with the card so the two can't drift — PlanScreen and
 * DayDetailScreen both render it.
 */
export function WorkoutHeroCardSkeleton() {
  const styles = useStyles();
  return (
    <View style={styles.shadowWrap}>
      <View style={[styles.card, styles.cardCompleted]}>
        <View style={styles.topRow}>
          <Skeleton width={84} height={24} round />
          <Skeleton width={52} height={14} />
        </View>
        <Skeleton width="66%" height={30} style={styles.title} />
        <View style={[styles.muscles, styles.musclesScroll]}>
          <Skeleton width={64} height={26} round />
          <Skeleton width={78} height={26} round />
        </View>
        <View style={[styles.statsRow, styles.statsRowCompleted]}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.statCell}>
              <View style={styles.statInner}>
                <Skeleton width={40} height={20} />
                <Skeleton width={54} height={12} style={{ marginTop: spacing.xxs }} />
              </View>
            </View>
          ))}
        </View>
        <Skeleton height={52} style={[styles.action, { borderRadius: radius.lg }]} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  shadowWrap: { ...t.shadows.md, borderRadius: radius.xl },
  card: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  cardCompleted: { backgroundColor: t.colors.card },
  glow: {
    position: 'absolute',
    top: -40,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  badgeCompleted: { backgroundColor: t.colors.successSoft },
  title: { marginTop: spacing.md },
  focus: { marginTop: spacing.xxs, letterSpacing: 1.5 },
  musclesScroll: {
    marginTop: spacing.sm,
    flexGrow: 0,
  },
  muscles: {
    flexDirection: 'row',
    gap: 6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: radius.lg,
  },
  statsRowCompleted: { backgroundColor: t.colors.bgSubtle },
  statCell: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  statInner: { flex: 1, alignItems: 'center', gap: 2 },
  action: { marginTop: spacing.lg },
}));
