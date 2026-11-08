// Buttons. While `loading` is true the button is disabled (so it can't be
// pressed twice), shows a spinner and tells screen readers it is busy.
//   <Button onPress={save} loading={saving}>Save</Button>
// variant: "primary" (filled), "secondary" (outlined) or "danger" (outlined,
// red - for cancelling and leaving)
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { borderWidth, fontWeight, layout, makeStyles, radius, spacing, useTheme } from '../theme';

export default function Button({ children, onPress, variant = 'primary', loading = false, disabled = false, style, testID }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const inactive = loading || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : danger ? styles.danger : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        inactive && styles.inactive,
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={primary ? colors.textOnBrand : danger ? colors.danger : colors.primary} />}
      <Text style={[styles.label, { color: primary ? colors.textOnBrand : danger ? colors.danger : colors.text }]}>{children}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  base: {
    minHeight: layout.buttonHeight,
    paddingHorizontal: spacing[5],
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
  },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surface, borderWidth: borderWidth.hairline, borderColor: colors.borderStrong },
  secondaryPressed: { backgroundColor: colors.surfaceMuted },
  danger: { backgroundColor: colors.surface, borderWidth: borderWidth.hairline, borderColor: colors.dangerBorder },
  inactive: { opacity: 0.6 },
  label: { fontSize: 16, fontWeight: fontWeight.semibold },
}));
