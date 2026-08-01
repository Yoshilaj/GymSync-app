/**
 * The last thing standing between a render throw and a white screen.
 *
 * Deliberately provider-free. This wraps OUTSIDE ThemeProvider — partly because
 * a boundary inside the provider stack can't catch the stack itself failing, and
 * PlanContext, UserContext and BillingProvider all throw by design when consumed
 * out of order. So no useTheme, no AppText, no Button: every one of those reads a
 * context that may be the thing that just died.
 *
 * It still uses the real design tokens — `themes`, `spacing`, `textVariants` are
 * plain objects, not context — so the fallback looks like GymSync rather than a
 * bare RN screen. The scheme is read once from Appearance, since the user's saved
 * preference lives behind the provider we can't reach.
 *
 * The error id is the point of the whole screen: it is logged, reported to Sentry
 * as a tag, and shown to the user, so "it broke, here's a code" lands on the exact
 * stack trace instead of a guess.
 */
import { Component, type ReactNode } from 'react';
import { Appearance, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { radius, spacing, textVariants, themes } from '@/theme';

interface Props {
  children: ReactNode;
  /** Names the boundary in reports, e.g. 'root' vs 'navigation'. */
  scope: string;
}

interface State {
  error: Error | null;
  errorId: string | null;
}

/** Short, unambiguous when read aloud or typed into a support message. */
function newErrorId(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1
  let id = '';
  for (let i = 0; i < 6; i += 1) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return id;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorId: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: newErrorId() };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    const errorId = this.state.errorId ?? newErrorId();
    Sentry.withScope((scope) => {
      scope.setTag('error_id', errorId);
      scope.setTag('boundary', this.props.scope);
      if (info.componentStack) {
        scope.setContext('react', { componentStack: info.componentStack });
      }
      Sentry.captureException(error);
    });
    if (__DEV__) {
      console.error(`[ErrorBoundary:${this.props.scope}] ${errorId}`, error);
    }
  }

  /**
   * Remount the subtree rather than reload the app. Most crashes here are one
   * bad screen or one malformed payload, and a remount re-runs the fetch that
   * produced it — the user keeps their session and their place in the flow.
   */
  private reset = () => this.setState({ error: null, errorId: null });

  render() {
    const { error, errorId } = this.state;
    if (!error) return this.props.children;

    const t = themes[Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'];
    const c = t.colors;

    return (
      <View style={[styles.fill, { backgroundColor: c.bg }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          // The screen exists because something already went wrong; never let it
          // be the reason the user can't reach the button on a small device.
          alwaysBounceVertical={false}
        >
          <Text style={[textVariants.h2, styles.title, { color: c.textPrimary }]}>
            Something broke on our side
          </Text>
          <Text style={[textVariants.body, styles.body, { color: c.textSecondary }]}>
            Not your workout — that's saved. Try again, and if it keeps happening,
            send us this code.
          </Text>

          {errorId ? (
            <View style={[styles.codeWell, { backgroundColor: c.sunken }]}>
              <Text style={[textVariants.statSm, { color: c.textPrimary }]}>{errorId}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={this.reset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[textVariants.button, { color: c.textInverse }]}>Try again</Text>
          </Pressable>

          {__DEV__ ? (
            <Text style={[textVariants.caption, styles.dev, { color: c.textTertiary }]}>
              {error.message}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  title: { textAlign: 'center' },
  body: {
    textAlign: 'center',
    maxWidth: 300,
    marginTop: spacing.sm,
  },
  codeWell: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  button: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dev: {
    marginTop: spacing.xl,
    textAlign: 'center',
    maxWidth: 320,
  },
});
