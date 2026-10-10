// Light / dark / system colour theme for the whole app.
//
// How it works: when the theme is dark, the "dark" class is put on <html>.
// Components then use Tailwind's dark: variant, e.g. "bg-white dark:bg-slate-900"
// (the variant is set up in index.css).
//
// The choice is a per-device display preference, so it is saved in
// localStorage (never anything private). "system" follows the device setting.
import { useEffect, useState } from 'react';
import { ThemeContext, THEME_STORAGE_KEY, THEME_OPTIONS } from './themeContext';

const darkQuery = '(prefers-color-scheme: dark)';

function readSavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_OPTIONS.includes(saved) ? saved : 'light';
  } catch {
    return 'light'; // storage blocked (e.g. private mode)
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readSavedTheme);
  const [systemIsDark, setSystemIsDark] = useState(() => window.matchMedia(darkQuery).matches);

  // Follow the device if it switches between light and dark
  useEffect(() => {
    const media = window.matchMedia(darkQuery);
    const onChange = (event) => setSystemIsDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme = theme === 'system' ? (systemIsDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  function setTheme(next) {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not saved, but still applied for this visit
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
  );
}
