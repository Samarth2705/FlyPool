// A number picker with − and + buttons, e.g. "Passengers  − 2 people +".
// The buttons switch off at `min` and `max`. Screen readers get it as an
// adjustable control (swipe up/down).
import { Pressable, Text, View } from 'react-native';
import AppText from './AppText';
import { borderWidth, fontWeight, layout, makeStyles, radius, spacing } from '../theme';

export default function NumberStepper({ label, value, onChange, min, max, unit, hint, error, testID }) {
  const styles = useStyles();
  const unitText = value === 1 ? unit.one : unit.many;
  const canLess = value > min;
  const canMore = value < max;

  const stepButton = (text, enabled, delta, a11y) => (
    <Pressable
      onPress={() => enabled && onChange(value + delta)}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !enabled }}
      testID={testID && `${testID}-${delta > 0 ? 'more' : 'less'}`}
      style={({ pressed }) => [styles.step, pressed && styles.stepPressed, !enabled && styles.stepDisabled]}
    >
      <Text style={styles.stepText}>{text}</Text>
    </Pressable>
  );

  return (
    <View>
      <AppText variant="label">{label}</AppText>
      <View
        style={[styles.box, error && styles.boxError]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: value, text: `${value} ${unitText}` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === 'increment' && canMore) onChange(value + 1);
          if (nativeEvent.actionName === 'decrement' && canLess) onChange(value - 1);
        }}
      >
        {stepButton('−', canLess, -1, `Fewer ${label.toLowerCase()}`)}
        <Text style={styles.value} testID={testID && `${testID}-value`}>
          {value} <Text style={styles.unit}>{unitText}</Text>
        </Text>
        {stepButton('+', canMore, 1, `More ${label.toLowerCase()}`)}
      </View>
      {hint ? <AppText variant="small" style={styles.message}>{hint}</AppText> : null}
      {error ? <AppText variant="small" style={[styles.message, styles.error]}>{error}</AppText> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: {
    marginTop: spacing[1] + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing[1],
    backgroundColor: colors.surface,
    borderWidth: borderWidth.hairline,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
  },
  boxError: { borderColor: colors.danger },
  step: { width: layout.minTouchTarget, height: layout.minTouchTarget, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stepPressed: { backgroundColor: colors.surfaceMuted },
  stepDisabled: { opacity: 0.35 },
  stepText: { fontSize: 24, color: colors.text, lineHeight: 28 },
  value: { fontSize: 18, fontWeight: fontWeight.semibold, color: colors.text },
  unit: { fontSize: 14, fontWeight: fontWeight.regular, color: colors.textSecondary },
  message: { marginTop: spacing[1] + 2 },
  error: { color: colors.danger, fontWeight: fontWeight.medium },
}));
