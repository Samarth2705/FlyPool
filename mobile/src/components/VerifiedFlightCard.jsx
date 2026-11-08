// The verified flight, exactly as the server saved it on the trip
// (trip.flight + trip.verification). Says plainly when the result came from
// FlyPool's demo checks - it is never presented as an airline confirmation.
//   <VerifiedFlightCard trip={trip} />
import { View } from 'react-native';
import AppText from './AppText';
import Card from './Card';
import FlightCode from './FlightCode';
import { CheckIcon, ShieldIcon } from './icons';
import { formatDate, formatTime } from '../shared/dates';
import { formatFlightNumber } from '../shared/format';
import { isDemoVerification, partyLabel, pickupLabel } from '../shared/trips';
import { makeStyles, radius, spacing, useTheme } from '../theme';

function Row({ label, children }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <AppText variant="small">{label}</AppText>
      {typeof children === 'string' ? (
        <AppText variant="label" style={styles.value}>
          {children}
        </AppText>
      ) : (
        children
      )}
    </View>
  );
}

export default function VerifiedFlightCard({ trip }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { flight, verification } = trip;
  const demo = isDemoVerification(trip);
  const documentKind = verification?.document?.kind;

  return (
    <Card testID="verified-flight">
      <View style={styles.head}>
        <View style={styles.badge}>
          <ShieldIcon size={22} color={colors.successIcon} />
        </View>
        <View style={styles.flex}>
          <AppText variant="heading">Flight details checked</AppText>
          <AppText variant="small">
            {demo
              ? 'Your ticket and flight details passed FlyPool’s demo checks. This is not a confirmation from the airline.'
              : 'Your flight details have been checked.'}
          </AppText>
        </View>
      </View>

      <View style={styles.rows}>
        <Row label="Flight">
          <FlightCode>{formatFlightNumber(flight.flightNumber)}</FlightCode>
        </Row>
        <Row label="Airline">{flight.airline}</Row>
        <Row label="Date">{formatDate(flight.flightDate ?? trip.travelDate)}</Row>
        <Row label="Scheduled landing">{formatTime(flight.scheduledArrivalTime)}</Row>
        <Row label="Arriving at">{pickupLabel(trip)}</Row>
        <Row label="Drop area">{trip.destination}</Row>
        <Row label="Travelling">{partyLabel(trip)}</Row>
        <Row label="Document">
          {documentKind ? `${documentKind === 'pdf' ? 'PDF e-ticket' : 'Photo'} checked, not stored` : 'Checked, not stored'}
        </Row>
      </View>

      {verification?.checks?.length ? (
        <View style={styles.checks} accessibilityLabel="Checks that passed">
          {verification.checks.map((check) => (
            <View key={check.name} style={styles.check}>
              <CheckIcon size={16} color={colors.success} />
              <AppText variant="small" style={styles.flex}>
                {check.message}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {demo ? (
        <View style={styles.demo}>
          <AppText variant="caption" style={styles.demoText}>
            Demo verification: FlyPool checks the file type and that your flight details are consistent. It doesn’t
            read the document or confirm your booking with the airline yet.
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  head: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  badge: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: { marginTop: spacing[4] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing[4],
    paddingVertical: spacing[2] + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  value: { flexShrink: 1, textAlign: 'right' },
  checks: { marginTop: spacing[3], gap: spacing[2] },
  check: { flexDirection: 'row', gap: spacing[2], alignItems: 'flex-start' },
  demo: { marginTop: spacing[4], padding: spacing[3], borderRadius: radius.md, backgroundColor: colors.warningSurface },
  demoText: { color: colors.warningText },
}));
