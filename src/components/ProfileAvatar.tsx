import { Image, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { makeStyles, useTheme } from '@/theme';
import { AppText } from '@/components/ui';

interface Props {
  name: string;
  size?: number;
  /** Profile photo URL; falls back to the gradient-initial disc when absent. */
  uri?: string | null;
}

/**
 * The user's avatar: a profile photo when set, otherwise a brand-gradient disc
 * with the initial. Shadow lives on the wrapper — the disc clips its content.
 */
export function ProfileAvatar({ name, size = 64, uri }: Props) {
  const { colors, gradients } = useTheme();
  const styles = useStyles();
  // No name yet (profile still hydrating, or offline with no cache) → a person
  // glyph, not a made-up letter. The old fallback was 'Y' — a leftover from
  // the demo profile that made every degraded state look like Yoshi's account.
  const initial = (name?.trim()?.[0] ?? '').toUpperCase();
  const disc = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.shadow, { borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={[styles.disc, disc]} />
      ) : (
        <LinearGradient
          colors={gradients.brand}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[styles.disc, disc]}
        >
          {initial ? (
            <AppText variant={size >= 56 ? 'h2' : 'bodyMedium'} color="textInverse">
              {initial}
            </AppText>
          ) : (
            <Ionicons name="person" size={size * 0.42} color={colors.textInverse} />
          )}
        </LinearGradient>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  shadow: { ...t.shadows.sm },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
  },
}));
