import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients, shadows } from '@/theme';
import { AppText } from '@/components/ui';

interface Props {
  name: string;
  size?: number;
}

/**
 * The user's avatar: brand-gradient disc, white inner ring, initial letter.
 * Shadow lives on the wrapper — the disc clips its gradient.
 */
export function ProfileAvatar({ name, size = 64 }: Props) {
  const initial = (name?.[0] ?? 'Y').toUpperCase();
  return (
    <View style={[styles.shadow, { borderRadius: size / 2 }]}>
      <LinearGradient
        colors={gradients.brand}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[
          styles.disc,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        <AppText
          variant={size >= 56 ? 'h2' : 'bodyMedium'}
          color="textInverse"
        >
          {initial}
        </AppText>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: { ...shadows.sm },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
  },
});
