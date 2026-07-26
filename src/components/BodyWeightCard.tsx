/**
 * "Today's body weight" — a slim one-row quick log on the Plan page. Prefills
 * with today's entry, saves on the check tap, feeds the Progress chart.
 * Values entered in the user's units; stored canonically in kg.
 */
import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { font, makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Card } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useUser } from '@/context/UserContext';
import { fetchBodyWeightSeries, logBodyWeight } from '@/api/progress';
import { kgToLbs, lbsToKg } from '@/lib/units';

export function BodyWeightCard() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { getToken, session } = useAuth();
  const { user } = useUser();
  const metric = user.units === 'kg';

  const [value, setValue] = useState('');
  const [savedValue, setSavedValue] = useState('');
  const [saving, setSaving] = useState(false);

  // Prefill with today's entry, if any.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const points = await fetchBodyWeightSeries(token, 7);
        const today = new Date().toISOString().slice(0, 10);
        const entry = points.find((p) => p.day === today);
        if (entry && !cancelled) {
          const shown = metric ? entry.weight_kg : kgToLbs(entry.weight_kg);
          const text = String(Math.round(shown * 10) / 10);
          setValue(text);
          setSavedValue(text);
        }
      } catch {
        /* offline — input still works, save will retry */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, getToken, metric]);

  const numeric = Number(value);
  const kg = Number.isFinite(numeric) && numeric > 0 ? (metric ? numeric : lbsToKg(numeric)) : null;
  const dirty = value.trim() !== '' && value !== savedValue && kg != null && kg >= 25 && kg <= 350;

  const save = async () => {
    if (!dirty || kg == null) return;
    setSaving(true);
    try {
      const token = await getToken();
      await logBodyWeight(token, kg);
      setSavedValue(value);
    } catch {
      /* keep dirty so the user can retry */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padded={false}>
      <View style={styles.row}>
        <View style={styles.iconWell}>
          <Ionicons name="scale-outline" size={17} color={colors.accentText} />
        </View>
        <AppText variant="h3" style={{ flex: 1 }}>
          Today's body weight
        </AppText>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => setValue(t.replace(/[^0-9.]/g, '').slice(0, 5))}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={colors.textTertiary}
          maxLength={5}
        />
        <AppText variant="caption" color="textSecondary">
          {user.units}
        </AppText>
        {dirty ? (
          <Pressable onPress={save} hitSlop={10} disabled={saving} style={styles.saveBtn}>
            <Ionicons
              name="checkmark"
              size={16}
              color={colors.textInverse}
            />
          </Pressable>
        ) : savedValue !== '' && value === savedValue ? (
          <Ionicons name="checkmark-circle" size={20} color={colors.successText} />
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
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
  input: {
    minWidth: 56,
    textAlign: 'right',
    fontSize: 17,
    fontFamily: font.semibold,
    color: t.colors.textPrimary,
    paddingVertical: spacing.xs,
  },
  saveBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
