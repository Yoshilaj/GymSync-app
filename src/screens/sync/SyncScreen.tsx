import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/theme';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/context/UserContext';
import { SyncStackParamList } from '@/navigation/SyncStack';

type Nav = NativeStackNavigationProp<SyncStackParamList, 'SyncHome'>;

type Suggestion = {
  id: string;
  emoji: string;
  label: string;
  onPress: () => void;
};

export function SyncScreen() {
  const [input, setInput] = useState('');
  const nav = useNavigation<Nav>();
  const { user } = useUser();

  const goToTab = (tab: 'Plan' | 'Progress' | 'Settings') => {
    nav.getParent()?.navigate(tab as never);
  };

  const suggestions: Suggestion[] = [
    {
      id: 'today',
      emoji: '📅',
      label: "Today's plan",
      onPress: () => goToTab('Plan'),
    },
    {
      id: 'progress',
      emoji: '📊',
      label: 'View progress',
      onPress: () => goToTab('Progress'),
    },
  ];

  const openConversation = () => {
    const draft = input.trim();
    nav.navigate('SyncConversation', draft ? { draft } : undefined);
    setInput('');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <AppHeader variant="brand" />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={86}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingBig}>
              What's up {user.displayName}!
            </Text>
          </View>

          <View style={styles.suggestions}>
            {suggestions.map((s) => (
              <Pressable
                key={s.id}
                onPress={s.onPress}
                style={({ pressed }) => [
                  styles.pill,
                  pressed && styles.pillPressed,
                ]}
              >
                <Text style={styles.pillEmoji}>{s.emoji}</Text>
                <Text style={styles.pillLabel}>{s.label}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        <View style={styles.inputWrap}>
          <View style={styles.inputCard}>
            <Pressable hitSlop={8} style={styles.plusBtn}>
              <Ionicons name="add" size={22} color={colors.text} />
            </Pressable>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask Sync"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={openConversation}
              returnKeyType="send"
            />
            <Pressable
              hitSlop={8}
              style={styles.roundBtnOutline}
              onPress={() => nav.navigate('VoiceCoach')}
            >
              <Ionicons name="mic" size={18} color={colors.text} />
            </Pressable>
            <Pressable
              hitSlop={8}
              style={[
                styles.sendBtn,
                !input.trim() && styles.sendBtnDisabled,
              ]}
              onPress={openConversation}
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
  safe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  greetingBlock: {
    marginBottom: spacing.xl,
  },
  greetingBig: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.6,
    lineHeight: 40,
  },
  suggestions: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: spacing.md,
    paddingRight: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    shadowColor: '#0B2447',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  pillPressed: {
    backgroundColor: colors.accentSoft,
  },
  pillEmoji: {
    fontSize: 18,
  },
  pillLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  inputWrap: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    shadowColor: '#0B2447',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  plusBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: spacing.xs,
  },
  roundBtnOutline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.accentMuted,
  },
});
