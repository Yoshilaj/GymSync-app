import { Image, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
  const { gradients } = useTheme();
  const styles = useStyles();
  const initial = (name?.[0] ?? 'Y').toUpperCase();
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
          <AppText variant={size >= 56 ? 'h2' : 'bodyMedium'} color="textInverse">
            {initial}
          </AppText>
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
