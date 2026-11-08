// FlyPool colours - the same tokens as the web app (client/src/index.css).
//   brand  "runway blue": buttons, links, selected states, focus
//   taxi   Mumbai kaali-peeli yellow: used sparingly, always on dark ink
//          (logo mark, flight codes in the departure-board style)
// Neutrals are Tailwind's slate scale, as on the web. Text pairs used here
// (e.g. brand[700] on white, white on brand[600], slate[500] on white) meet
// WCAG AA contrast.

export const brand = {
  50: '#eff6ff',
  100: '#dbeafe',
  200: '#bfd8fe',
  300: '#91bdfb',
  400: '#5b98f6',
  500: '#3574ee',
  600: '#1f58d6',
  700: '#1a46b0',
  800: '#1b3d8e',
  900: '#1c3672',
  950: '#13213f',
};

export const slate = {
  50: '#f8fafc',
  100: '#f1f5f9',
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  500: '#64748b',
  600: '#475569',
  700: '#334155',
  800: '#1e293b',
  900: '#0f172a',
  950: '#020617',
};

export const taxi = '#ffc72c';
export const ink = '#0b1220';

// Status colours (Tailwind emerald / amber / rose, as on the web)
export const success = { 50: '#ecfdf5', 200: '#a7f3d0', 600: '#059669', 700: '#047857', 900: '#064e3b' };
export const warning = { 50: '#fffbeb', 200: '#fde68a', 600: '#d97706', 900: '#78350f' };
export const danger = { 50: '#fff1f2', 200: '#fecdd3', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 800: '#9f1239' };

// What components use: one set of meanings, in a light and a dark version
// with the same keys. Components never pick a palette shade themselves - they
// get the active set from useTheme() (see ThemeProvider.jsx).
// Dark follows the web's dark mode: slate-950 page, slate-900 cards,
// slate-800 hairlines, light text.
export const lightColors = {
  background: slate[50], // page background
  surface: '#ffffff', // cards, sheets, inputs
  surfaceMuted: slate[100],
  surfaceSelected: '#f5f9ff', // a chosen option card
  border: slate[200], // card hairlines
  borderStrong: slate[300], // input outlines
  overlay: 'rgba(15, 23, 42, 0.35)', // behind menus and sheets

  text: slate[900],
  textSecondary: slate[600],
  textMuted: slate[500],
  textOnBrand: '#ffffff',
  textOnDark: '#ffffff',
  textOnDarkMuted: 'rgba(219, 234, 254, 0.8)', // brand-100 at 80%, as on the web's brand panel

  primary: brand[600],
  primaryPressed: brand[700],
  primarySoft: brand[50], // tinted backgrounds: avatars, icon circles, info boxes
  primarySoftPressed: brand[100],
  primarySoftBorder: brand[200],
  primarySoftText: brand[700], // text and icons on primarySoft
  primaryIcon: brand[600],
  link: brand[700],
  focus: brand[300],

  brandPanel: brand[950], // dark brand areas (auth panel, splash)
  accent: taxi,
  ink,
  inkBorder: 'rgba(255,255,255,0.1)',

  success: success[700],
  successIcon: success[600],
  successSurface: success[50],
  successBorder: success[200],
  successText: success[900],
  warning: warning[900],
  warningIcon: warning[600],
  warningSurface: warning[50],
  warningBorder: warning[200],
  warningText: warning[900],
  danger: danger[700],
  dangerSurface: danger[50],
  dangerBorder: danger[200],
  dangerText: danger[800],
};

export const darkColors = {
  background: slate[950],
  surface: slate[900],
  surfaceMuted: slate[800],
  surfaceSelected: '#14213d',
  border: slate[800],
  borderStrong: slate[700],
  overlay: 'rgba(2, 6, 23, 0.6)',

  text: slate[50],
  textSecondary: slate[300],
  textMuted: slate[400],
  textOnBrand: '#ffffff',
  textOnDark: '#ffffff',
  textOnDarkMuted: 'rgba(219, 234, 254, 0.8)',

  primary: brand[600], // white on brand-600 keeps AA contrast in both themes
  primaryPressed: brand[700],
  primarySoft: '#16264a',
  primarySoftPressed: '#1c3060',
  primarySoftBorder: brand[800],
  primarySoftText: brand[200],
  primaryIcon: brand[400],
  link: brand[300],
  focus: brand[500],

  brandPanel: brand[950],
  accent: taxi,
  ink,
  inkBorder: 'rgba(255,255,255,0.18)',

  success: '#34d399',
  successIcon: '#34d399',
  successSurface: '#022c22',
  successBorder: '#065f46',
  successText: '#a7f3d0',
  warning: '#fcd34d',
  warningIcon: '#fbbf24',
  warningSurface: '#2d1f04',
  warningBorder: '#78350f',
  warningText: '#fde68a',
  danger: '#fb7185',
  dangerSurface: '#3a0a16',
  dangerBorder: '#881337',
  dangerText: '#fecdd3',
};
