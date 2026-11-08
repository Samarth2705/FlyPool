// A larger selectable card (radio behaviour) for Ride Selection: travel
// option, vehicle, shared ride. Thick brand border + radio dot when chosen,
// so the selection never relies on colour alone.
//   <SelectCard selected={...} onPress={...} label="Travel alone">...content...</SelectCard>
import { Pressable, View } from 'react-native';
import { borderWidth, makeStyles, radius, spacing } from '../theme';

export default function SelectCard({ selected, onPress, disabled, label, testID, style, children }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: Boolean(selected), disabled: Boolean(disabled) }}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && !selected && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View style={styles.content}>{children}</View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.dot} />}</View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[3],
    padding: spacing[4],
    borderRadius: radius.xl,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primary, borderWidth: borderWidth.thick, backgroundColor: colors.surfaceSelected },
  pressed: { backgroundColor: colors.surfaceMuted },
  disabled: { opacity: 0.55 },
  content: { flex: 1, gap: spacing[1] },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  radioOn: { borderColor: colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
}));
