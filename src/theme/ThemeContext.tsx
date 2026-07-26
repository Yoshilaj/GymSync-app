/**
 * Runtime theming: the active theme, the user's preference, and `makeStyles`.
 *
 * `makeStyles` is the migration workhorse — it replaces module-level
 * `StyleSheet.create` so styles recompute when the scheme flips:
 *
 *   const useStyles = makeStyles((t) => ({ card: { backgroundColor: t.colors.card } }));
 *   function C() { const styles = useStyles(); ... }
 *
 * Only two themes exist, so each factory's output is memoized once per scheme
 * (module-level cache) — zero per-render cost.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { themes, type ColorScheme, type Theme } from './themes';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = '@gymsync/theme';

interface ThemeContextValue {
  theme: Theme;
  scheme: ColorScheme;
  preference: ThemePreference;
  setThemePreference: (p: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const osScheme = useColorScheme(); // 'light' | 'dark' | null
  const [preference, setPreference] = useState<ThemePreference>('system');

  // Hydrate the saved preference (async — default 'system' paints first, which
  // matches the OS, so there's no wrong-theme flash while it loads).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (!cancelled && (saved === 'light' || saved === 'dark' || saved === 'system')) {
          setPreference(saved);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemePreference = useCallback((p: ThemePreference) => {
    setPreference(p);
    AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
  }, []);

  const scheme: ColorScheme =
    preference === 'system' ? (osScheme ?? 'light') : preference;

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themes[scheme], scheme, preference, setThemePreference }),
    [scheme, preference, setThemePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  // Fail safe to light if a component renders outside the provider (e.g. a
  // detached preview) rather than crashing.
  return ctx?.theme ?? themes.light;
}

export function useThemePref(): {
  preference: ThemePreference;
  scheme: ColorScheme;
  setThemePreference: (p: ThemePreference) => void;
} {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemePref must be used within ThemeProvider');
  const { preference, scheme, setThemePreference } = ctx;
  return { preference, scheme, setThemePreference };
}

type NamedStyles<T> = StyleSheet.NamedStyles<T>;

/**
 * Build a themed StyleSheet hook. The factory receives the active theme; its
 * output is cached per scheme so it's created at most twice for the app run.
 */
export function makeStyles<T extends NamedStyles<T>>(
  factory: (theme: Theme) => T,
): () => T {
  const cache = new Map<ColorScheme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let sheet = cache.get(theme.scheme);
    if (!sheet) {
      sheet = StyleSheet.create(factory(theme));
      cache.set(theme.scheme, sheet);
    }
    return sheet;
  };
}
