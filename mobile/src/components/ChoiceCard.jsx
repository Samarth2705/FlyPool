// A selectable card that behaves like a radio button, with a radio dot so the
// selection never relies on colour alone (like the web app's ChoiceCard).
//   <ChoiceCard title="Terminal 2" subtitle="International & domestic" selected onPress={...} />
import { Pressable, View } from 'react-native';
import AppText from './AppText';
import { borderWidth, makeStyles, radius, spacing } from '../theme';

export default function ChoiceCard({ title, subtitle, selected, onPress, error, style, testID }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      testID={testID}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        !selected && error && styles.error,
        pressed && !selected && styles.pressed,
        style,
      ]}
    >
      <View style={styles.text}>
        <AppText variant="label">{title}</AppText>
        {subtitle ? <AppText variant="caption">{subtitle}</AppText> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.dot} />}</View>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    padding: spacing[3],
    borderRadius: radius.lg,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.primary, borderWidth: borderWidth.thick, backgroundColor: colors.surfaceSelected },
  error: { borderColor: colors.danger },
  pressed: { backgroundColor: colors.surfaceMuted },
  text: { flex: 1, gap: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.primary },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
}));
