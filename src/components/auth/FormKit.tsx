/**
 * Shared form pieces for the logged-out screens.
 */
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from '@/components/ui';

/** Inline submit error. Announced, since the failure is usually off-screen. */
export function FormError({ message }: { message: string }) {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.error} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={15} color={colors.dangerText} />
      <AppText variant="caption" color="dangerText" style={styles.errorText}>
        {message}
      </AppText>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: t.colors.dangerSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  errorText: { flex: 1 },
}));
