import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, radius, shadows, spacing } from '@/theme';
import { AppText } from '@/components/ui';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ChatInputBar } from '@/components/ChatInputBar';
import { useKeyboardVisible, useTabBarClearance } from '@/hooks';
import { useUser } from '@/context/UserContext';
import { getTodaysWorkout } from '@/data/mockPlan';
import { SyncStackParamList } from '@/navigation/SyncStack';

type Nav = NativeStackNavigationProp<SyncStackParamList, 'SyncHome'>;

function timeGreeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Morning';
  if (h < 18) return 'Afternoon';
  return 'Evening';
}

export function SyncScreen() {
  const [input, setInput] = useState('');
  const nav = useNavigation<Nav>();
  const { user } = useUser();
  const todaysWorkout = getTodaysWorkout();
  const clearance = useTabBarClearance();
  const keyboardVisible = useKeyboardVisible();

  const openConversation = (draft?: string) => {
    const text = (draft ?? input).trim();
    nav.navigate('SyncConversation', text ? { draft: text } : undefined);
    setInput('');
  };

  // Conversation starters — every pill leads into the coach, not away from it.
  const suggestions = [
    {
      id: 'start',
      icon: 'play' as const,
      label: `Start ${todaysWorkout.title}`,
      onPress: () =>
        nav.getParent()?.navigate('Plan', {
          screen: 'LiveWorkoutStart',
          params: { workoutId: todaysWorkout.id },
        }),
    },
    {
      id: 'swap',
      icon: 'swap-horizontal' as const,
      label: 'Swap an exercise today',
      onPress: () => openConversation('Can you swap an exercise in my plan today?'),
    },
    {
      id: 'trend',
      icon: 'trending-up' as const,
      label: "How's my bench trending?",
      onPress: () => openConversation('How is my bench press trending lately?'),
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader variant="brand" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={layout.HEADER_KEYBOARD_OFFSET}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.greetingBlock}>
            <AppText variant="display">
              {timeGreeting()}, {user.displayName}
            </AppText>
            <AppText variant="caption" style={styles.greetingSub}>
              Your coach is ready — ask, log, or just start.
            </AppText>
          </View>

          <View style={styles.suggestions}>
            {suggestions.map((s) => (
              <Pressable
                key={s.id}
                onPress={s.onPress}
                style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
              >
                <View style={styles.pillIcon}>
                  <Ionicons name={s.icon} size={15} color={colors.accentText} />
                </View>
                <AppText variant="bodyMedium">{s.label}</AppText>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <ChatInputBar
          value={input}
          onChangeText={setInput}
          onSend={() => openConversation()}
          onMic={() => nav.navigate('VoiceCoach')}
          bottomInset={keyboardVisible ? spacing.sm : clearance.pinned}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: layout.SCREEN_H_PADDING,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  greetingBlock: { marginBottom: spacing.xl, gap: spacing.xs },
  greetingSub: { marginTop: spacing.xs },
  suggestions: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.sm,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadows.xs,
  },
  pillPressed: { backgroundColor: colors.accentFaint },
  pillIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.accentFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
