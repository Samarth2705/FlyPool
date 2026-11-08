// One import for every design token:
//   import { spacing, radius, typography, useTheme, makeStyles } from '../theme';
// Colours depend on light / dark mode: read them with useTheme() or
// makeStyles() (see ThemeProvider.jsx), never from a fixed object.
export * from './colors';
export * from './spacing';
export * from './typography';
export { ThemeProvider, useTheme, makeStyles, THEME_PREFERENCES } from './ThemeProvider';
