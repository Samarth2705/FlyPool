// Light and dark mode - the app's one theme system.
//
//   preference  what the passenger chose: 'system' (follow the phone),
//               'light' or 'dark'. Saved on the device and loaded before
//               anything is drawn, so the app never flashes the wrong theme.
//   scheme      what is shown now: 'light' or 'dark'
//   colors      the matching set from colors.js (same keys in both)
//
// Components read colours at render time:
//   const { colors } = useTheme();                       // inline values
//   const useStyles = makeStyles((c) => ({ box: { backgroundColor: c.surface } }));
//   const styles = useStyles();                           // inside the component
//
// Saved with expo-secure-store - already the app's only on-device storage
// (no AsyncStorage). A theme isn't secret; SecureStore is simply the
// storage that is installed.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { darkColors, lightColors } from './colors';

const KEY = 'flypool.theme';
export const THEME_PREFERENCES = ['system', 'light', 'dark'];

const ThemeContext = createContext({
  ready: true,
  preference: 'system',
  scheme: 'light',
  colors: lightColors,
  setPreference: () => {},
});

async function loadPreference() {
  try {
    const saved = await SecureStore.getItemAsync(KEY);
    return THEME_PREFERENCES.includes(saved) ? saved : 'system';
  } catch {
    return 'system'; // unreadable storage: follow the phone
  }
}

export function ThemeProvider({ children }) {
  const system = useColorScheme(); // 'light' | 'dark' | null
  const [preference, setPreferenceState] = useState(null); // null until loaded

  useEffect(() => {
    let active = true;
    loadPreference().then((saved) => active && setPreferenceState(saved));
    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback((next) => {
    if (!THEME_PREFERENCES.includes(next)) return;
    setPreferenceState(next);
    // Best effort: if saving fails, the choice still applies until the app closes
    SecureStore.setItemAsync(KEY, next).catch(() => {});
  }, []);

  const value = useMemo(() => {
    const chosen = preference ?? 'system';
    const scheme = chosen === 'system' ? (system === 'dark' ? 'dark' : 'light') : chosen;
    return {
      ready: preference !== null,
      preference: chosen,
      scheme,
      colors: scheme === 'dark' ? darkColors : lightColors,
      setPreference,
    };
  }, [preference, system, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

// Styles that use theme colours. The factory runs once per scheme and the
// result is shared by every instance of the component.
export function makeStyles(factory) {
  const cache = {};
  return function useStyles() {
    const { scheme, colors } = useTheme();
    if (!cache[scheme]) cache[scheme] = StyleSheet.create(factory(colors, scheme));
    return cache[scheme];
  };
}
