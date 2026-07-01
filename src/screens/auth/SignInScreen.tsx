import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radius, typography } from '@/theme';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useAuth } from '@/auth/AuthContext';

/** Email/password sign-in. Rendered by App's auth gate whenever there's no session. */
export function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) setError(err);
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <Text style={styles.brand}>GymSync</Text>
          <Text style={styles.subtitle}>Sign in to start training</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textDim}
              secureTextEntry
              textContentType="password"
              onSubmitEditing={onSubmit}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <PrimaryButton
              title="Sign in"
              icon="log-in"
              loading={submitting}
              disabled={submitting}
              onPress={onSubmit}
              style={styles.button}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  brand: { ...typography.heading, textAlign: 'center' },
  subtitle: {
    ...typography.bodyMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  form: { gap: spacing.sm },
  label: { ...typography.label, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  error: { ...typography.caption, color: colors.danger, marginTop: spacing.sm },
  button: { marginTop: spacing.lg },
});
