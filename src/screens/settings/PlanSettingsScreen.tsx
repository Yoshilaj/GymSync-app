import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, spacing, useTheme } from '@/theme';
import { AppText, Card, Chip } from '@/components/ui';
import { SettingsPage } from './SettingsKit';

const TIERS = [
  {
    id: 'free',
    name: 'Free',
    price: 'Free',
    perks: ['AI coach in chat', 'Voice workout sessions', 'Plan generation'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$7 / mo',
    perks: ['Everything in Free', 'Unlimited voice minutes', 'Advanced progress insights'],
  },
  {
    id: 'premium',
    name: 'Premium',
    price: '$15 / mo',
    perks: ['Everything in Pro', 'Nutrition targets & tracking', 'Priority coaching model'],
  },
];

const CURRENT = 'free';

export function PlanSettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();

  return (
    <SettingsPage title="Plan" subtitle="Choose the plan that fits your training">
      <View style={styles.list}>
        {TIERS.map((tier) => {
          const current = tier.id === CURRENT;
          return (
            <Card key={tier.id} style={current ? styles.currentCard : undefined}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <AppText variant="h2">{tier.name}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    {tier.price}
                  </AppText>
                </View>
                {current ? (
                  <Chip label="Current" tone="accent" size="sm" />
                ) : (
                  <AppText variant="caption" color="textTertiary">
                    Upgrade soon
                  </AppText>
                )}
              </View>
              <View style={styles.perks}>
                {tier.perks.map((p) => (
                  <View key={p} style={styles.perkRow}>
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color={current ? colors.accent : colors.textTertiary}
                    />
                    <AppText variant="body" style={{ flex: 1 }}>
                      {p}
                    </AppText>
                  </View>
                ))}
              </View>
            </Card>
          );
        })}
      </View>
    </SettingsPage>
  );
}

const useStyles = makeStyles((t) => ({
  list: { gap: spacing.md },
  currentCard: { borderWidth: 1.5, borderColor: t.colors.accent },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  perks: { gap: spacing.sm },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
}));
