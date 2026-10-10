// The React context object for the colour theme. The value is provided by
// <ThemeProvider> and read with the useTheme() hook.
import { createContext } from 'react';

export const ThemeContext = createContext(null);

// Where the choice is saved in the browser. index.html reads the same key
// before the page draws, so a dark page never flashes white on load.
export const THEME_STORAGE_KEY = 'flypool-theme';
export const THEME_OPTIONS = ['light', 'dark', 'system'];
