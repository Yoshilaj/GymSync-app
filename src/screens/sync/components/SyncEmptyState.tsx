import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';
import { STARTERS, Starter } from '../starters';

interface Props {
  greeting: string;
  onStarter: (starter: Starter) => void;
}

/**
 * What the chat shows before any message exists: a centered greeting and the
 * three bot-opener pills. Sits at natural eye level above the input bar; no
 * card chrome.
 */
export function SyncEmptyState({ greeting, onStarter }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      <View style={styles.greetingBlock}>
        <AppText variant="display">{greeting}</AppText>
        <AppText variant="caption" style={styles.greetingSub}>
          Your coach is ready — ask, log, or just start.
        </AppText>
      </View>

      <View style={styles.suggestions}>
        {STARTERS.map((s) => (
          <Pressable
            key={s.id}
            onPress={() => onStarter(s)}
            accessibilityRole="button"
            accessibilityLabel={s.label}
            style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
          >
            <View style={styles.pillIcon}>
              <Ionicons name={s.icon} size={15} color={colors.accentText} />
            </View>
            <AppText variant="bodyMedium">{s.label}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    // Slight upward bias: eye level sits above the input bar, not dead center.
    paddingBottom: '12%',
  },
  greetingBlock: { marginBottom: spacing.xl, gap: spacing.xs },
  greetingSub: { marginTop: spacing.xs },
  suggestions: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: t.colors.card,
    ...t.shadows.xs,
  },
  pillPressed: { backgroundColor: t.colors.accentFaint },
  pillIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
