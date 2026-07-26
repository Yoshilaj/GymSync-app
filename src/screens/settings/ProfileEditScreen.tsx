import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { makeStyles, spacing } from '@/theme';
import { AppText, Button, Card, Chip, Input } from '@/components/ui';
import { SectionHeader } from '@/components/SectionHeader';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import { cmToFtIn, ftInToCm, kgToLbs, lbsToKg } from '@/lib/units';
import type { Sex } from '@/api/profile';
import { SettingsPage } from './SettingsKit';

const SEX_OPTIONS: { id: Sex | 'skip'; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'skip', label: 'Prefer not to say' },
];

const THIS_YEAR = new Date().getFullYear();

export function ProfileEditScreen() {
  const styles = useStyles();
  const nav = useNavigation();
  const { user, profile, setDisplayName, saveProfile } = useUser();
  const { user: authUser } = useAuth();
  const metric = user.units === 'kg';

  const [name, setName] = useState(user.displayName);
  const [sex, setSex] = useState<Sex | 'skip'>(profile?.sex ?? 'skip');
  const [birthYear, setBirthYear] = useState(
    profile?.birth_year ? String(profile.birth_year) : '',
  );

  const initialHeight = useMemo(() => {
    if (!profile?.height_cm) return { cm: '', ft: '', in: '' };
    const { feet, inches } = cmToFtIn(profile.height_cm);
    return { cm: String(Math.round(profile.height_cm)), ft: String(feet), in: String(inches) };
  }, [profile?.height_cm]);
  const [heightCm, setHeightCm] = useState(initialHeight.cm);
  const [heightFt, setHeightFt] = useState(initialHeight.ft);
  const [heightIn, setHeightIn] = useState(initialHeight.in);

  const [weight, setWeight] = useState(
    profile?.weight_kg
      ? String(metric ? Math.round(profile.weight_kg) : kgToLbs(profile.weight_kg))
      : '',
  );

  const [saving, setSaving] = useState(false);

  const heightCmValue = (): number | null => {
    if (metric) {
      const cm = Number(heightCm);
      return cm >= 90 && cm <= 250 ? cm : null;
    }
    const ft = Number(heightFt);
    const inch = Number(heightIn || '0');
    if (!ft) return null;
    const cm = ftInToCm(ft, inch);
    return cm >= 90 && cm <= 250 ? cm : null;
  };

  const weightKgValue = (): number | null => {
    const raw = Number(weight);
    if (!raw) return null;
    const kg = metric ? raw : lbsToKg(raw);
    return kg >= 25 && kg <= 350 ? kg : null;
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveProfile({
        display_name: name.trim() || user.displayName,
        sex: sex === 'skip' ? null : sex,
        birth_year: birthYear.length === 4 ? Number(birthYear) : null,
        height_cm: heightCmValue(),
        weight_kg: weightKgValue(),
      });
      setDisplayName(name.trim() || user.displayName);
      nav.goBack();
    } catch {
      Alert.alert("Couldn't save", 'Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPage
      title="Profile"
      footer={
        <View style={styles.footer}>
          <Button title="Save changes" onPress={save} loading={saving} />
        </View>
      }
    >
      <View style={styles.avatarBlock}>
        <ProfileAvatar name={name || 'Y'} size={84} />
        <AppText variant="caption" color="textTertiary">
          Photo upload coming soon
        </AppText>
      </View>

      <SectionHeader title="Name" />
      <Input value={name} onChangeText={setName} placeholder="Your name" />
      <AppText variant="caption" color="textTertiary" style={styles.hint}>
        Signed in as {authUser?.email ?? '—'}
      </AppText>

      <SectionHeader title="Gender" />
      <Card>
        <View style={styles.chips}>
          {SEX_OPTIONS.map((o) => (
            <Chip
              key={o.id}
              label={o.label}
              selected={sex === o.id}
              onPress={() => setSex(o.id)}
            />
          ))}
        </View>
      </Card>

      <SectionHeader title="Birth year" />
      <Input
        value={birthYear}
        onChangeText={setBirthYear}
        keyboardType="number-pad"
        maxLength={4}
        placeholder={`e.g. ${THIS_YEAR - 25}`}
      />

      <SectionHeader title="Height" />
      {metric ? (
        <Input
          value={heightCm}
          onChangeText={setHeightCm}
          keyboardType="number-pad"
          maxLength={3}
          placeholder="cm"
        />
      ) : (
        <View style={styles.row}>
          <Input
            value={heightFt}
            onChangeText={setHeightFt}
            keyboardType="number-pad"
            maxLength={1}
            placeholder="ft"
            containerStyle={styles.rowField}
          />
          <Input
            value={heightIn}
            onChangeText={setHeightIn}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="in"
            containerStyle={styles.rowField}
          />
        </View>
      )}

      <SectionHeader title={`Weight (${user.units})`} />
      <Input
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
        maxLength={5}
        placeholder={metric ? 'kg' : 'lbs'}
      />
    </SettingsPage>
  );
}

const useStyles = makeStyles(() => ({
  avatarBlock: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { marginTop: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.sm },
  rowField: { flex: 1 },
  footer: { padding: spacing.lg },
}));
