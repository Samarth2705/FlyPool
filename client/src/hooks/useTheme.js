// Any component can call useTheme() to get:
//   theme          - the user's choice: "light", "dark" or "system"
//   resolvedTheme  - what is actually shown: "light" or "dark"
//   setTheme(name) - change and save the choice
import { useContext } from 'react';
import { ThemeContext } from '../context/themeContext';

export function useTheme() {
  return useContext(ThemeContext);
}
