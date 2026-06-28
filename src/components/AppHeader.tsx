import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '@/theme';
import { useUser } from '@/context/UserContext';

interface Props {
  variant?: 'brand' | 'home';
  onPressMenu?: () => void;
}

export function AppHeader({ variant = 'brand', onPressMenu }: Props) {
  const nav = useNavigation<any>();
  const { user } = useUser();

  const goSettings = () => nav.getParent()?.navigate('Settings');

  const initial = (user.displayName?.[0] ?? 'Y').toUpperCase();

  const avatar = (
    <Pressable
      onPress={goSettings}
      hitSlop={10}
      style={styles.avatarWrap}
    >
      <View style={styles.avatarRing}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      </View>
    </Pressable>
  );

  if (variant === 'home') {
    return (
      <View style={styles.row}>
        <Pressable onPress={onPressMenu} hitSlop={10} style={styles.iconBtn}>
          <Ionicons name="menu" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.brandCenter}>GymSync</Text>
        {avatar}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <Text style={styles.brandLeft}>GymSync</Text>
      <View style={{ flex: 1 }} />
      {avatar}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandCenter: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    letterSpacing: -0.3,
  },
  brandLeft: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
  },
  avatarWrap: {
    width: 36,
    height: 36,
  },
  avatarRing: {
    flex: 1,
    borderRadius: 18,
    padding: 2,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.accent,
  },
});
