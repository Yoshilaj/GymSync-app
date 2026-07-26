/**
 * Exercise Library entry point — sibling of BodyWeightCard in the Plan page's
 * utility-card language: icon well · title (+count) · chevron, 64pt row.
 */
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Card } from '@/components/ui';

interface Props {
  count?: number;
  onPress: () => void;
}

export function LibraryCard({ count, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Card padded={false} onPress={onPress}>
      <View style={styles.row}>
        <View style={styles.iconWell}>
          <Ionicons name="library-outline" size={17} color={colors.accentText} />
        </View>
        <View style={styles.titleCol}>
          <AppText variant="h3">Exercise Library</AppText>
          {count != null ? (
            <AppText variant="caption" color="textSecondary">
              {count} exercises
            </AppText>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 64,
    paddingHorizontal: spacing.lg,
  },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: radius.sm + 2,
    backgroundColor: t.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: { flex: 1 },
}));
