/**
 * The two complete themes. Only color-bearing token groups vary by scheme;
 * spacing, radius, layout, and font metrics are theme-invariant and stay
 * static imports (never put them here).
 */
import { lightColors, darkColors, type ColorKey } from './colors';
import { lightShadows, darkShadows, type ShadowKey, type ShadowPreset } from './shadows';
import {
  lightGradients,
  darkGradients,
  type GradientKey,
  type GradientStops,
} from './gradients';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: Record<ColorKey, string>;
  shadows: Record<ShadowKey, ShadowPreset>;
  gradients: Record<GradientKey, GradientStops>;
}

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  shadows: lightShadows,
  gradients: lightGradients,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  shadows: darkShadows,
  gradients: darkGradients,
};

export const themes: Record<ColorScheme, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};
