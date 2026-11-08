// Spacing, corner radii, borders and shadows.
// A 4-point scale, matching the web's Tailwind spacing (1 unit = 4 px).

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16, // default screen gutter
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
};

// Screen padding and the minimum size of anything tappable (Apple and
// Android both recommend about 44-48 pt)
export const layout = {
  screenPadding: spacing[4],
  maxContentWidth: 560, // keeps forms readable on tablets
  minTouchTarget: 44,
  buttonHeight: 48,
  inputHeight: 48,
};

// Same radii as the web: md for chips, lg for buttons and inputs, xl for cards
export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  full: 999,
};

export const borderWidth = {
  hairline: 1,
  thick: 2, // selected cards, focused inputs
};

// Subtle, like the web's cards. iOS uses shadow*, Android uses elevation.
export const shadow = {
  none: {},
  card: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
};
