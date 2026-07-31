import { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { SvgXml } from 'react-native-svg';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AnimatedPressable, AppText, Button, Input } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import {
  confirmEnrollment,
  disableMfa,
  getMfaStatus,
  startEnrollment,
  verifyChallenge,
} from '@/auth/mfa';
import { SettingsGroup, SettingsPage, SettingsRow } from './SettingsKit';

const CODE_LENGTH = 6;

type Stage =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'on' }
  /** A factor exists but is unverified — nothing is enforced until it is. */
  | { kind: 'enrolling'; factorId: string; qrCode: string; secret: string }
  /** Turning it off also demands a code, so a borrowed phone can't disable it. */
  | { kind: 'disabling' };

/**
 * Turn two-factor authentication on and off.
 *
 * TOTP only — an authenticator app, no SMS. SMS costs money per message and is
 * defeated by a SIM swap, which is precisely the attack 2FA is supposed to stop.
 */
export function TwoFactorScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { refreshTwoFactor } = useAuth();
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const { enrolled } = await getMfaStatus();
    setStage({ kind: enrolled ? 'on' : 'off' });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setCode('');
    setError(null);
    setCopied(false);
  };

  const begin = async () => {
    setBusy(true);
    reset();
    const result = await startEnrollment();
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStage({
      kind: 'enrolling',
      factorId: result.factorId,
      qrCode: result.qrCode,
      secret: result.secret,
    });
  };

  const confirm = async (value: string) => {
    if (stage.kind !== 'enrolling') return;
    setBusy(true);
    setError(null);
    const { error: err } = await confirmEnrollment(stage.factorId, value);
    setBusy(false);
    if (err) {
      setError(err);
      setCode('');
      return;
    }
    // The session is aal2 now and the server has been told to start requiring it.
    await refreshTwoFactor();
    reset();
    setStage({ kind: 'on' });
    Alert.alert(
      'Two-factor is on',
      "You'll need a code from your authenticator app the next time you sign in. " +
        "Keep that app backed up — without it, and without your password, you'd be locked out.",
    );
  };

  const confirmDisable = async (value: string) => {
    setBusy(true);
    setError(null);
    // Prove the factor still works before removing it. Otherwise anyone holding an
    // unlocked phone could quietly switch 2FA off.
    const { error: verifyErr } = await verifyChallenge(value);
    if (verifyErr) {
      setBusy(false);
      setError(verifyErr);
      setCode('');
      return;
    }
    const { error: err } = await disableMfa();
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    await refreshTwoFactor();
    reset();
    setStage({ kind: 'off' });
  };

  const onChangeCode = (next: string, submit: (v: string) => void) => {
    const digits = next.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === CODE_LENGTH && !busy) void submit(digits);
  };

  const copySecret = async (secret: string) => {
    await Clipboard.setStringAsync(secret);
    setCopied(true);
  };

  if (stage.kind === 'loading') {
    // Header only. The status resolves from the local session in a frame or two,
    // so a spinner here would be a flash rather than reassurance.
    return (
      <SettingsPage title="Two-factor authentication">
        <View />
      </SettingsPage>
    );
  }

  if (stage.kind === 'enrolling') {
    return (
      <SettingsPage
        title="Scan this code"
        subtitle="Add it to your authenticator app, then enter the 6-digit code it shows."
      >
        <View style={styles.qrWrap}>
          {/* Supabase returns the QR as an SVG data URI, so react-native-svg
              renders it directly — no QR library, no extra dependency. */}
          <SvgXml xml={decodeQr(stage.qrCode)} width={200} height={200} />
        </View>

        <SettingsGroup
          title="Can't scan?"
          footnote="Enter this key into your authenticator app by hand instead."
          inset
        >
          <SettingsRow
            label={formatSecret(stage.secret)}
            icon="key-outline"
            right={
              <AnimatedPressable onPress={() => void copySecret(stage.secret)} hitSlop={8}>
                <Ionicons
                  name={copied ? 'checkmark' : 'copy-outline'}
                  size={20}
                  color={copied ? colors.successText : colors.textSecondary}
                />
              </AnimatedPressable>
            }
          />
        </SettingsGroup>

        <View style={styles.codeBlock}>
          <Input
            label="6-digit code"
            value={code}
            onChangeText={(v) => onChangeCode(v, confirm)}
            placeholder="000000"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={CODE_LENGTH}
            editable={!busy}
            autoFocus
          />
          {error ? (
            <AppText variant="caption" color="dangerText" style={styles.error}>
              {error}
            </AppText>
          ) : null}
          <Button
            title="Turn on"
            onPress={() => void confirm(code)}
            loading={busy}
            disabled={busy || code.length < CODE_LENGTH}
            style={styles.action}
          />
          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => {
              reset();
              setStage({ kind: 'off' });
            }}
          />
        </View>
      </SettingsPage>
    );
  }

  if (stage.kind === 'disabling') {
    return (
      <SettingsPage
        title="Turn off two-factor"
        subtitle="Enter a code from your authenticator app to confirm it's you."
      >
        <View style={styles.codeBlock}>
          <Input
            label="6-digit code"
            value={code}
            onChangeText={(v) => onChangeCode(v, confirmDisable)}
            placeholder="000000"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            maxLength={CODE_LENGTH}
            editable={!busy}
            autoFocus
          />
          {error ? (
            <AppText variant="caption" color="dangerText" style={styles.error}>
              {error}
            </AppText>
          ) : null}
          <Button
            title="Turn off"
            onPress={() => void confirmDisable(code)}
            loading={busy}
            disabled={busy || code.length < CODE_LENGTH}
            style={styles.action}
          />
          <Button
            title="Keep it on"
            variant="ghost"
            onPress={() => {
              reset();
              setStage({ kind: 'on' });
            }}
          />
        </View>
      </SettingsPage>
    );
  }

  const on = stage.kind === 'on';
  return (
    <SettingsPage title="Two-factor authentication">
      <SettingsGroup
        inset
        footnote={
          on
            ? 'You need a code from your authenticator app every time you sign in.'
            : 'Ask for a code from an authenticator app at sign-in, on top of your password.'
        }
      >
        <SettingsRow
          label={on ? 'Two-factor is on' : 'Two-factor is off'}
          icon={on ? 'shield-checkmark-outline' : 'shield-outline'}
          value={on ? 'On' : 'Off'}
        />
      </SettingsGroup>

      {error ? (
        <AppText variant="caption" color="dangerText" style={styles.error}>
          {error}
        </AppText>
      ) : null}

      <View style={styles.codeBlock}>
        {on ? (
          <Button
            title="Turn off two-factor"
            variant="ghost"
            onPress={() => {
              reset();
              setStage({ kind: 'disabling' });
            }}
          />
        ) : (
          <Button title="Set up two-factor" onPress={() => void begin()} loading={busy} />
        )}
      </View>
    </SettingsPage>
  );
}

/** Supabase hands back `data:image/svg+xml;utf-8,<svg …>`; SvgXml wants the markup. */
function decodeQr(dataUri: string): string {
  const comma = dataUri.indexOf(',');
  if (comma === -1) return dataUri;
  const payload = dataUri.slice(comma + 1);
  return dataUri.slice(0, comma).includes('base64')
    ? // eslint-disable-next-line no-undef
      globalThis.atob(payload)
    : decodeURIComponent(payload);
}

/** Groups of four, so it can be read off a screen and typed without losing place. */
function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim();
}

const useStyles = makeStyles((t) => ({
  qrWrap: {
    alignSelf: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    // The QR is drawn in black, so it needs a light backing regardless of theme —
    // a dark-mode card behind it would make it unscannable.
    backgroundColor: '#FFFFFF',
    marginBottom: spacing.lg,
  },
  codeBlock: { gap: spacing.md, marginTop: spacing.lg },
  action: { marginTop: spacing.xs },
  error: { marginTop: spacing.sm },
}));
