import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';

interface Props {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ title, message, icon, action }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      {icon ? (
        <View style={styles.iconWell}>
          <Ionicons name={icon} size={26} color={colors.textTertiary} />
        </View>
      ) : null}
      <AppText variant="h3" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText variant="caption" align="center" style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {action ? (
        <Button
          title={action.label}
          onPress={action.onPress}
          variant="secondary"
          size="md"
          full={false}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: t.colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  message: { maxWidth: 260 },
  action: { marginTop: spacing.md },
}));
