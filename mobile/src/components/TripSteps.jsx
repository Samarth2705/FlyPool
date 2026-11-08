// The trip-planning steps under the header: Plan › Verify › Travellers › Ride.
// On narrow phones only the current step shows its name (the others keep
// their number or tick, and their full name for screen readers).
// The current step is filled in, finished steps show a tick and can be
// opened again, and later steps stay locked until the steps before them are
// done (see src/navigation/tripSteps.js).
//   <TripSteps current={2} trip={trip} tripId={tripId} />
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { CheckIcon, LockIcon } from './icons';
import { TRIP_STEPS, goToStep, stepAvailable } from '../navigation/tripSteps';
import { fontWeight, layout, makeStyles, radius, spacing, useTheme } from '../theme';

export default function TripSteps({ current, trip, tripId }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const known = trip ?? (tripId ? { id: tripId } : null);
  const compact = useWindowDimensions().width < 420;

  return (
    <View style={styles.row} accessibilityRole="tablist" testID="trip-steps">
      {TRIP_STEPS.map(({ step, label, title }, i) => {
        const isCurrent = step === current;
        const done = step < current;
        const open = !isCurrent && stepAvailable(step, known);
        const state = isCurrent ? 'current step' : open ? (done ? 'completed' : 'available') : 'locked';
        return (
          <View key={step} style={styles.item}>
            {i > 0 && <View style={[styles.line, (done || isCurrent) && styles.lineOn]} />}
            <Pressable
              onPress={() => open && goToStep(step, current, known?.id)}
              disabled={!open && !isCurrent}
              accessibilityRole="tab"
              accessibilityLabel={`Step ${step} of ${TRIP_STEPS.length}: ${title}, ${state}`}
              accessibilityState={{ selected: isCurrent, disabled: !isCurrent && !open }}
              hitSlop={6}
              testID={`step-${step}`}
              style={({ pressed }) => [
                styles.pill,
                isCurrent && styles.pillCurrent,
                pressed && styles.pillPressed,
                !isCurrent && !open && styles.pillLocked,
              ]}
            >
              <View style={[styles.dot, isCurrent && styles.dotCurrent, done && !isCurrent && styles.dotDone]}>
                {done && !isCurrent ? (
                  <CheckIcon size={12} color={colors.textOnBrand} strokeWidth={2.5} />
                ) : !isCurrent && !open ? (
                  <LockIcon size={11} color={colors.textMuted} />
                ) : (
                  <Text style={[styles.dotText, isCurrent && styles.dotTextCurrent]}>{step}</Text>
                )}
              </View>
              {(!compact || isCurrent) && (
                <Text style={[styles.label, isCurrent && styles.labelCurrent]} numberOfLines={1}>
                  {label}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: spacing[2] },
  item: { flexGrow: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center' },
  line: { width: spacing[2], height: 2, borderRadius: 1, backgroundColor: colors.border, marginRight: spacing[1] },
  lineOn: { backgroundColor: colors.primary },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1] + 2,
    minHeight: layout.minTouchTarget - 8,
    paddingHorizontal: spacing[2],
    borderRadius: radius.full,
  },
  pillCurrent: { backgroundColor: colors.primarySoft },
  pillPressed: { backgroundColor: colors.surfaceMuted },
  pillLocked: { opacity: 0.6 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  dotCurrent: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotDone: { backgroundColor: colors.successIcon, borderColor: colors.successIcon },
  dotText: { fontSize: 11, fontWeight: fontWeight.semibold, color: colors.textSecondary },
  dotTextCurrent: { color: colors.textOnBrand },
  label: { flexShrink: 1, fontSize: 13, fontWeight: fontWeight.medium, color: colors.textSecondary },
  labelCurrent: { color: colors.primarySoftText, fontWeight: fontWeight.semibold },
}));
