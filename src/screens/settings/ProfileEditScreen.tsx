import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, spacing, useTheme } from '@/theme';
import {
  AppText,
  Input,
  NumberWheel,
  Skeleton,
  WheelRow as WheelBand,
  WheelUnit,
} from '@/components/ui';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { useUser } from '@/context/UserContext';
import { useAuth } from '@/auth/AuthContext';
import { pickAvatar, uploadAvatar } from '@/api/avatar';
import { cmToFtIn, ftInToCm, kgToLbs, lbsToKg } from '@/lib/units';
import type { Sex } from '@/api/profile';
import {
  CheckRow,
  SettingsGroup,
  SettingsPage,
  WheelRow,
  useDebouncedCommit,
} from './SettingsKit';

const SEX_OPTIONS: { id: Sex | 'skip'; label: string }[] = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'skip', label: 'Prefer not to say' },
];

const THIS_YEAR = new Date().getFullYear();

/**
 * Gate: the form's fields initialize from `profile` exactly once, so it must
 * not mount until the server profile is actually loaded — otherwise the form
 * starts empty and a save would overwrite real data with nulls.
 */
export function ProfileEditScreen() {
  const { profileStatus, profile } = useUser();
  if (profileStatus !== 'ready' || !profile) {
    return (
      <SettingsPage title="Profile">
        <View style={{ gap: spacing.md, paddingTop: spacing.lg }}>
          <Skeleton width={84} height={84} round style={{ alignSelf: 'center' }} />
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      </SettingsPage>
    );
  }
  return <ProfileEditForm />;
}

function ProfileEditForm() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { user, profile, setDisplayName, saveProfile } = useUser();
  const { user: authUser } = useAuth();
  const metric = user.units === 'kg';

  const [avatarUri, setAvatarUri] = useState<string | null>(profile?.avatar_url ?? null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const changePhoto = async () => {
    if (!authUser?.id) return;
    try {
      const picked = await pickAvatar();
      if (!picked) return;
      setAvatarUri(picked.uri); // instant local preview
      setUploadingPhoto(true);
      const url = await uploadAvatar(authUser.id, picked);
      await saveProfile({ avatar_url: url });
      setAvatarUri(url);
    } catch {
      Alert.alert("Couldn't update photo", 'Check your connection and try again.');
      setAvatarUri(profile?.avatar_url ?? null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Name: saves on blur, quiet "Saved" flash ─────────────────────────────
  const [name, setName] = useState(user.displayName);
  const [nameSaved, setNameSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedName = useRef(user.displayName);

  // The field seeds at mount, which can beat profile hydration (cold start,
  // slow network) — without this, the real name arriving a beat later never
  // reached an already-open screen and the account looked nameless. Only
  // while untouched: a keystroke makes the draft the user's, not the server's.
  const nameTouched = useRef(false);
  useEffect(() => {
    if (nameTouched.current || user.displayName === lastSavedName.current) return;
    setName(user.displayName);
    lastSavedName.current = user.displayName;
  }, [user.displayName]);

  const saveName = async () => {
    const next = name.trim();
    if (!next || next === lastSavedName.current) return;
    try {
      await saveProfile({ display_name: next });
      setDisplayName(next);
      lastSavedName.current = next;
      setNameSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setNameSaved(false), 1800);
    } catch {
      Alert.alert("Couldn't save your name", 'Check your connection and try again.');
    }
  };

  // ── Gender: immediate save ────────────────────────────────────────────────
  const [sex, setSex] = useState<Sex | 'skip'>(profile?.sex ?? 'skip');
  const chooseSex = (id: Sex | 'skip') => {
    setSex(id);
    void saveProfile({ sex: id === 'skip' ? null : id });
  };

  // ── Body stats: wheels, debounced optimistic saves ───────────────────────
  const [openKey, setOpenKey] = useState<string | null>(null);
  const toggle = (key: string) =>
    setOpenKey((cur) => (cur === key ? null : key));

  const [birthYear, setBirthYear] = useState(profile?.birth_year ?? THIS_YEAR - 27);
  const commitBirthYear = useDebouncedCommit((y) => void saveProfile({ birth_year: y }));

  const initialFtIn = profile?.height_cm
    ? cmToFtIn(profile.height_cm)
    : { feet: 5, inches: 10 };
  const [heightCm, setHeightCm] = useState(
    profile?.height_cm ? Math.round(profile.height_cm) : 175,
  );
  const [heightFt, setHeightFt] = useState(initialFtIn.feet);
  const [heightIn, setHeightIn] = useState(initialFtIn.inches);
  const commitHeight = useDebouncedCommit((cm) => void saveProfile({ height_cm: cm }));

  const initialWeight = profile?.weight_kg
    ? Math.round((metric ? profile.weight_kg : kgToLbs(profile.weight_kg)) * 10) / 10
    : metric
      ? 75
      : 165;
  const [weightInt, setWeightInt] = useState(Math.floor(initialWeight));
  const [weightDec, setWeightDec] = useState(Math.round((initialWeight % 1) * 10));
  const commitWeight = useDebouncedCommit(
    (w) => void saveProfile({ weight_kg: metric ? w : lbsToKg(w) }),
  );
  const setWeight = (int: number, dec: number) => {
    setWeightInt(int);
    setWeightDec(dec);
    commitWeight(int + dec / 10);
  };

  const heightLabel = metric
    ? `${heightCm} cm`
    : `${heightFt} ft ${heightIn} in`;
  const weightLabel = `${weightInt}.${weightDec} ${user.units}`;

  return (
    <SettingsPage title="Profile">
      <View style={styles.avatarBlock}>
        <Pressable onPress={changePhoto} disabled={uploadingPhoto}>
          <ProfileAvatar name={name} size={84} uri={avatarUri} />
          <View style={styles.avatarBadge}>
            <Ionicons name="camera" size={14} color={colors.textInverse} />
          </View>
        </Pressable>
        <Pressable onPress={changePhoto} disabled={uploadingPhoto}>
          <AppText variant="caption" color="accentText">
            {uploadingPhoto ? 'Uploading…' : 'Change photo'}
          </AppText>
        </Pressable>
      </View>

      <View style={styles.nameBlock}>
        <View style={styles.nameHeader}>
          <AppText variant="label" color="textTertiary">
            Name
          </AppText>
          {nameSaved ? (
            <AppText variant="caption" color="successText">
              Saved
            </AppText>
          ) : null}
        </View>
        <Input
          value={name}
          onChangeText={(t) => {
            nameTouched.current = true;
            setName(t);
          }}
          onBlur={() => void saveName()}
          placeholder="Your name"
          returnKeyType="done"
        />
        <AppText variant="caption" color="textTertiary" style={styles.hint}>
          Signed in as {authUser?.email ?? '—'}
        </AppText>
      </View>

      <SettingsGroup title="Gender">
        {SEX_OPTIONS.map((o) => (
          <CheckRow
            key={o.id}
            label={o.label}
            selected={sex === o.id}
            onPress={() => chooseSex(o.id)}
          />
        ))}
      </SettingsGroup>

      <SettingsGroup
        title="Body"
        footnote="Changes save automatically and feed your coach's calorie and load math."
      >
        <WheelRow
          label="Birth year"
          value={String(birthYear)}
          open={openKey === 'birthYear'}
          onToggle={() => toggle('birthYear')}
        >
          <WheelBand>
            <NumberWheel
              min={1930}
              max={THIS_YEAR - 10}
              value={birthYear}
              onChange={(y) => {
                setBirthYear(y);
                commitBirthYear(y);
              }}
              width={104}
              showBand={false}
              accessibilityLabel="Birth year"
            />
          </WheelBand>
        </WheelRow>
        <WheelRow
          label="Height"
          value={heightLabel}
          open={openKey === 'height'}
          onToggle={() => toggle('height')}
        >
          {metric ? (
            <WheelBand>
              <NumberWheel
                min={120}
                max={220}
                value={heightCm}
                onChange={(cm) => {
                  setHeightCm(cm);
                  commitHeight(cm);
                }}
                width={88}
                showBand={false}
                accessibilityLabel="Height"
              />
              <WheelUnit label="cm" />
            </WheelBand>
          ) : (
            <WheelBand>
              <NumberWheel
                min={3}
                max={7}
                value={heightFt}
                onChange={(ft) => {
                  setHeightFt(ft);
                  commitHeight(ftInToCm(ft, heightIn));
                }}
                width={64}
                showBand={false}
                accessibilityLabel="Height feet"
              />
              <WheelUnit label="ft" />
              <NumberWheel
                min={0}
                max={11}
                value={heightIn}
                onChange={(inch) => {
                  setHeightIn(inch);
                  commitHeight(ftInToCm(heightFt, inch));
                }}
                width={64}
                showBand={false}
                accessibilityLabel="Height inches"
              />
              <WheelUnit label="in" />
            </WheelBand>
          )}
        </WheelRow>
        <WheelRow
          label="Weight"
          value={weightLabel}
          open={openKey === 'weight'}
          onToggle={() => toggle('weight')}
        >
          <WheelBand>
            <NumberWheel
              min={metric ? 30 : 66}
              max={metric ? 250 : 550}
              value={weightInt}
              onChange={(n) => setWeight(n, weightDec)}
              width={88}
              showBand={false}
              accessibilityLabel="Weight"
            />
            <NumberWheel
              min={0}
              max={9}
              value={weightDec}
              onChange={(n) => setWeight(weightInt, n)}
              format={(n) => `.${n}`}
              width={56}
              showBand={false}
              accessibilityLabel="Weight decimal"
            />
            <WheelUnit label={user.units} />
          </WheelBand>
        </WheelRow>
      </SettingsGroup>
    </SettingsPage>
  );
}

const useStyles = makeStyles((t) => ({
  avatarBlock: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: t.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.colors.bg,
  },
  nameBlock: { marginBottom: spacing.xl },
  nameHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  hint: { marginTop: spacing.xs, marginHorizontal: spacing.xs },
}));
