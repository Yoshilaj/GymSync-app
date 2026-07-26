import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { makeStyles, radius, spacing, useTheme } from '@/theme';
import { AppText, Button, Input } from '@/components/ui';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { useAuth } from '@/auth/AuthContext';
import { AuthStackParamList } from '@/navigation/AuthNavigator';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Requests a password-reset email. Always shows the generic sent state on success. */
export function ForgotPasswordScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'ForgotPassword'>>();
  const { resetPassword } = useAuth();
  const { colors } = useTheme();
  const styles = useStyles();
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const onSubmit = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await resetPassword(trimmed);
    setSubmitting(false);
    if (err) setError(err);
    else setSent(true);
  };

  if (sent) {
    return (
      <AuthLayout title="Check your email" caption="Reset link on the way">
        <View style={styles.sentBlock}>
          <View style={styles.sentIcon}>
            <Ionicons name="checkmark-circle-outline" size={28} color={colors.successText} />
          </View>
          <AppText variant="body" align="center">
            If an account exists for that email, a password reset link is on its
            way.
          </AppText>
          <AppText variant="caption" align="center" color="textSecondary">
            Didn't get it? Check your spam folder or try again in a few minutes.
          </AppText>
          <Button
            title="Back to sign in"
            variant="ghost"
            onPress={() => navigation.popToTop()}
            style={styles.sentButton}
          />
        </View>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      caption="We'll email you a reset link"
      onBack={() => navigation.goBack()}
    >
      <View style={styles.form}>
        <Input
          label="Email"
          icon="mail-outline"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          autoFocus
        />

        {error ? (
          <View style={styles.errorCard}>
            <Ionicons name="alert-circle" size={15} color={colors.dangerText} />
            <AppText variant="caption" color="dangerText" style={{ flex: 1 }}>
              {error}
            </AppText>
          </View>
        ) : null}

        <Button
          title="Send reset link"
          icon="mail"
          loading={submitting}
          disabled={submitting}
          onPress={onSubmit}
        />
      </View>
    </AuthLayout>
  );
}

const useStyles = makeStyles((t) => ({
  form: { gap: spacing.md },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: t.colors.dangerSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  sentBlock: { alignItems: 'center', gap: spacing.md },
  sentIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: t.colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  sentButton: { marginTop: spacing.md },
}));
