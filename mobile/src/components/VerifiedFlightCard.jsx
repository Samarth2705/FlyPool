// The verified flight, exactly as the server saved it on the trip
// (trip.flight + trip.verification). Says plainly when the result came from
// FlyPool's demo checks - it is never presented as an airline confirmation.
//   <VerifiedFlightCard trip={trip} />
import { View } from 'react-native';
import AppText from './AppText';
import Card from './Card';
import FlightCode from './FlightCode';
import { AlertIcon, CheckIcon, ShieldIcon } from './icons';
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

// The five separate answers of a verification (server: verification.levels).
// "Confirmed with the airline" is only ever ticked by a trusted source.
const LEVELS = [
  ['fileAccepted', 'File accepted'],
  ['documentReadable', 'Document readable'],
  ['detailsExtracted', 'Flight details found on the document'],
  ['detailsMatched', 'Details match your trip'],
  ['authenticityConfirmed', 'Booking confirmed with the airline'],
];

function Level({ done, label, note }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.check} accessibilityLabel={`${label}: ${done ? 'yes' : 'no'}`} testID={`level-${done ? 'yes' : 'no'}`}>
      {done ? <CheckIcon size={16} color={colors.success} /> : <AlertIcon size={16} color={colors.textMuted} />}
      <AppText variant="small" style={styles.flex}>
        {label}
        {note ? <AppText variant="caption">{` - ${note}`}</AppText> : null}
      </AppText>
    </View>
  );
}

const airportText = (code) => code ?? 'not found on the document';

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

      {verification?.levels ? (
        <View style={styles.checks} accessibilityLabel="What was verified" testID="verification-levels">
          <AppText variant="overline">What was verified</AppText>
          {LEVELS.map(([key, label]) => (
            <Level
              key={key}
              label={label}
              done={Boolean(verification.levels[key])}
              note={key === 'authenticityConfirmed' && !verification.levels[key] ? 'not available: no airline connection' : null}
            />
          ))}
        </View>
      ) : null}

      {verification?.extraction?.details ? (
        <View style={styles.rows} testID="extracted-details">
          <AppText variant="overline">Read from your ticket</AppText>
          <Row label="Airline">{verification.extraction.details.airline ?? 'not found'}</Row>
          <Row label="From">{airportText(verification.extraction.details.departureAirport)}</Row>
          <Row label="To">{airportText(verification.extraction.details.arrivalAirport)}</Row>
          <Row label="Departs">{verification.extraction.details.departureTime ? formatTime(verification.extraction.details.departureTime) : 'not shown on the document'}</Row>
        </View>
      ) : null}

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
            Demo verification: FlyPool read your ticket and checked that it shows your name, this flight number, your
            travel date and Mumbai. It can’t tell whether a ticket is genuine - nothing was confirmed with the airline.
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
