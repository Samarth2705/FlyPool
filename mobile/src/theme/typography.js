// Type scale. The web uses Inter; on mobile the platform fonts (SF Pro on
// iOS, Roboto on Android) are used instead - they are designed for small
// screens, need no download and respect the user's text-size setting.
// Flight codes use the platform monospace font, like the web's JetBrains Mono.
// Colours are not part of these styles (they depend on light / dark mode):
// AppText adds the variant's colour from TEXT_TONE and the active theme.
import { Platform } from 'react-native';

export const fontFamily = {
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

// Each variant is a ready-to-use text style: <AppText variant="title">
export const typography = {
  display: { fontSize: 32, lineHeight: 38, fontWeight: fontWeight.bold, letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: fontWeight.bold, letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: fontWeight.semibold },
  body: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.regular },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: fontWeight.semibold },
  label: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.medium },
  small: { fontSize: 14, lineHeight: 20, fontWeight: fontWeight.regular },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: fontWeight.medium },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  code: { fontSize: 14, lineHeight: 18, fontWeight: fontWeight.semibold, fontFamily: fontFamily.mono, letterSpacing: 0.5 },
};

// Which theme colour each variant's text uses (AppText applies it)
export const TEXT_TONE = {
  display: 'text',
  title: 'text',
  heading: 'text',
  body: 'text',
  bodyStrong: 'text',
  label: 'text',
  small: 'textSecondary',
  caption: 'textMuted',
  overline: 'textMuted',
  code: 'text',
};
