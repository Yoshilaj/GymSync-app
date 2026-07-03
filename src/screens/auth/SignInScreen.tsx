import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, gradients, radius, shadows, spacing } from '@/theme';
import { AppText, Button } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';

/** Email/password sign-in. Rendered by App's auth gate whenever there's no session. */
export function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
          <View style={styles.brandBlock}>
            <View style={styles.logoShadow}>
              <LinearGradient
                colors={gradients.brand}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.8, y: 1 }}
                style={styles.logo}
              >
                <Ionicons name="sparkles" size={28} color={colors.textInverse} />
              </LinearGradient>
            </View>
            <AppText variant="display" align="center">
              GymSync
            </AppText>
            <AppText variant="caption" align="center">
              Your AI training partner
            </AppText>
          </View>

          <View style={styles.form}>
            <AppText variant="label" style={styles.label}>
              Email
            </AppText>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={17} color={colors.textSecondary} />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
              />
            </View>

            <AppText variant="label" style={styles.label}>
              Password
            </AppText>
            <View style={styles.inputWrap}>
              <Ionicons
                name="lock-closed-outline"
                size={17}
                color={colors.textSecondary}
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!showPassword}
                textContentType="password"
                onSubmitEditing={onSubmit}
              />
              <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={8}>
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color={colors.textTertiary}
                />
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorCard}>
                <Ionicons name="alert-circle" size={15} color={colors.dangerText} />
                <AppText variant="caption" color="dangerText" style={{ flex: 1 }}>
                  {error}
                </AppText>
              </View>
            ) : null}

            <Button
              title="Sign in"
              icon="log-in"
              loading={submitting}
              disabled={submitting || (!email && !password)}
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
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  brandBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxl,
  },
  logoShadow: {
    ...shadows.glow,
    borderRadius: 32,
    marginBottom: spacing.md,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { gap: spacing.sm },
  label: { marginTop: spacing.sm },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: colors.textPrimary,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  button: { marginTop: spacing.lg },
});
