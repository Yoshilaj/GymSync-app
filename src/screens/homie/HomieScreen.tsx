import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '@/theme';
import { VoiceButton } from '@/components/VoiceButton';
import { useUser } from '@/context/UserContext';
import { HomieStackParamList } from '@/navigation/HomieStack';

type Nav = NativeStackNavigationProp<HomieStackParamList, 'HomieHome'>;

type PillAction = {
  id: string;
  label: string;
  emoji?: string;
  emojiRight?: boolean;
  onPress: () => void;
};

const GREETINGS: { soft: string; punct: string }[] = [
  { soft: "What's up,", punct: '!' },
  { soft: "What's up,", punct: '!' },
  { soft: 'Ready to move,', punct: '?' },
  { soft: "Let's get after it,", punct: '.' },
];

export function HomieScreen() {
  const [input, setInput] = useState('');
  const [greetingIdx, setGreetingIdx] = useState(0);
  const nav = useNavigation<Nav>();
  const { user } = useUser();

  const goToTab = (tab: 'Plan' | 'Exercise' | 'Progress' | 'Settings') => {
    nav.getParent()?.navigate(tab as never);
  };

  const greeting = GREETINGS[greetingIdx % GREETINGS.length];

  const actions: PillAction[] = [
    {
      id: 'live',
      label: 'Start Live Workout',
      emoji: '🎤',
      emojiRight: true,
      onPress: () => nav.navigate('VoiceCoach'),
    },
    {
      id: 'today',
      label: "Today's Workout 💪",
      onPress: () => goToTab('Plan'),
    },
    {
      id: 'calories',
      label: 'Track Calories 🍽️',
      onPress: () => goToTab('Progress'),
    },
  ];

  const openConversation = () => {
    const draft = input.trim();
    nav.navigate('HomieConversation', draft ? { draft } : undefined);
    setInput('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable hitSlop={12} style={styles.iconBtn}>
          <Ionicons name="menu" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.brand}>GYMHOMIE</Text>
        <Pressable
          hitSlop={12}
          style={styles.iconBtn}
          onPress={() => goToTab('Settings')}
        >
          <Ionicons name="person-circle-outline" size={26} color={colors.text} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={86}
      >
        <View style={styles.body}>
          <View style={styles.topSpacer} />

          <Pressable
            onPress={() => setGreetingIdx((i) => i + 1)}
            style={styles.greetingBlock}
          >
            <Text style={styles.greetingLine}>
              <Text>{greeting.soft} </Text>
              <Text style={styles.greetingName}>{user.displayName}</Text>
              <Text> {greeting.punct}</Text>
            </Text>
          </Pressable>

          <View style={styles.pillColumn}>
            {actions.map((a) => (
              <Pressable
                key={a.id}
                onPress={a.onPress}
                style={({ pressed }) => [
                  styles.pill,
                  pressed && styles.pillPressed,
                ]}
              >
                {a.emoji && !a.emojiRight && (
                  <Text style={styles.pillEmoji}>{a.emoji}</Text>
                )}
                <Text style={styles.pillLabel}>{a.label}</Text>
                {a.emoji && a.emojiRight && (
                  <Text style={styles.pillEmoji}>{a.emoji}</Text>
                )}
              </Pressable>
            ))}
          </View>

          <View style={styles.bottomSpacer} />
        </View>

        <View style={styles.inputBar}>
          <Pressable onPress={openConversation} style={styles.plusBtn} hitSlop={6}>
            <Ionicons name="add" size={22} color={colors.textMuted} />
          </Pressable>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask Homie…"
            placeholderTextColor={colors.textDim}
            onSubmitEditing={openConversation}
            returnKeyType="send"
          />
          <View style={styles.inputActions}>
            <VoiceButton size={36} onPress={() => nav.navigate('VoiceCoach')} />
            <Pressable
              onPress={openConversation}
              style={[
                styles.sendBtn,
                !input.trim() && styles.sendBtnDisabled,
              ]}
            >
              <Ionicons name="arrow-up" size={18} color="#fff" />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    ...typography.title,
    fontSize: 18,
    letterSpacing: 2,
    color: colors.text,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'column',
  },
  topSpacer: { flex: 1.4 },
  bottomSpacer: { flex: 1 },
  greetingBlock: {
    marginBottom: spacing.lg,
  },
  greetingLine: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.8,
    lineHeight: 40,
  },
  greetingName: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.8,
    textDecorationLine: 'underline',
  },
  pillColumn: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0B2447',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pillPressed: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentMuted,
  },
  pillLabel: {
    ...typography.subtitle,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  pillEmoji: {
    fontSize: 16,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plusBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.xs,
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendBtnDisabled: { backgroundColor: colors.accentMuted },
});
