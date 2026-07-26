import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, spacing, useTheme } from '@/theme';
import { AppText, AnimatedPressable, Card } from '@/components/ui';
import { SettingsPage } from './SettingsKit';

const FAQS = [
  {
    q: 'How does the AI coach build my plan?',
    a: 'It combines your onboarding profile — goals, experience, schedule, equipment, and any injuries — with evidence from a curated research corpus, then proposes a weekly plan you can accept or refine in chat.',
  },
  {
    q: 'Can I talk to my coach hands-free?',
    a: 'Yes. Open a voice session and just speak — voice detection streams your words only while you talk, and the coach replies out loud.',
  },
  {
    q: 'How do I change my coach’s personality or voice?',
    a: 'Settings → Workout → Coach personality. Each personality has its own voice.',
  },
  {
    q: 'Are my logged workouts saved?',
    a: 'Yes — sets, plans, and conversations are stored to your account and sync across devices.',
  },
  {
    q: 'How do I switch between pounds and kilograms?',
    a: 'Settings → Units. Everything in the app updates to your choice.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <AnimatedPressable onPress={() => setOpen((o) => !o)}>
      <View style={styles.item}>
        <View style={styles.qRow}>
          <AppText variant="h3" style={{ flex: 1 }}>
            {q}
          </AppText>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textTertiary}
          />
        </View>
        {open ? (
          <AppText variant="body" color="textSecondary" style={styles.answer}>
            {a}
          </AppText>
        ) : null}
      </View>
    </AnimatedPressable>
  );
}

export function FaqScreen() {
  const styles = useStyles();
  return (
    <SettingsPage title="FAQ" subtitle="Answers to common questions">
      <Card padded={false} style={styles.card}>
        {FAQS.map((f, i) => (
          <View key={f.q}>
            <FaqItem q={f.q} a={f.a} />
            {i < FAQS.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </Card>
    </SettingsPage>
  );
}

const useStyles = makeStyles((t) => ({
  card: { paddingVertical: spacing.xs },
  item: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  answer: { marginBottom: spacing.xs },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
    marginLeft: spacing.lg,
  },
}));
