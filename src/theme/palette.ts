/**
 * Raw color ramps — the single source of hex values.
 * Screens never import this file; only `colors.ts` (semantic tokens) does.
 */
export const palette = {
  blue: {
    50: '#F0F7FE',
    100: '#DEEDFC',
    200: '#BCDCF9',
    300: '#8AC4F4',
    400: '#54A8EE',
    500: '#2E90EA', // brand
    600: '#1D77CE',
    700: '#1A6BC0',
    800: '#14528F',
    900: '#0B2447',
  },
  // Blue-tinted neutrals so grays never look dirty on the tinted background.
  navy: {
    50: '#F7FAFD',
    100: '#EEF3FA',
    200: '#E7EEF7',
    300: '#DCE6F3',
    400: '#C9D8EB',
    500: '#A6B4C8',
    600: '#7A8CA5',
    700: '#4A617F',
    800: '#22405F',
    900: '#0B2447',
  },
  green: {
    100: '#DCF5E9',
    500: '#21A566',
    600: '#178453',
  },
  amber: {
    100: '#FBF0DA',
    500: '#E8A320',
    700: '#8F5F00',
  },
  red: {
    100: '#FDE7E7',
    500: '#E04545',
    600: '#C22E2E',
  },
  // The "live" family — reserved for anything hot: active mic, streaks.
  orange: {
    100: '#FFEDE4',
    500: '#FF7A45',
    600: '#C8420F',
  },
  violet: {
    500: '#8B7BF0', // charts only
  },
  white: '#FFFFFF',
} as const;
