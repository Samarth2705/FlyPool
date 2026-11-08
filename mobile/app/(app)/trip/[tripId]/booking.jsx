// The confirmed booking. Reads the trip from the server (GET /trips/:tripId)
// and shows its booking record - the reference, status and the ride as it
// was booked (a snapshot saved by the server when confirming). It shows a
// confirmation only if the server has one; nothing comes from the previous
// screen. Confirmed = saved by FlyPool; no payment is taken.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppHeader from '../../../../src/components/AppHeader';
import AppText from '../../../../src/components/AppText';
import Alert from '../../../../src/components/Alert';
import Button from '../../../../src/components/Button';
import FareBreakdown from '../../../../src/components/FareBreakdown';
import FlightCode from '../../../../src/components/FlightCode';
import FormScreen from '../../../../src/components/FormScreen';
import SummaryCard, { SummaryRow } from '../../../../src/components/SummaryCard';
import { CheckIcon } from '../../../../src/components/icons';
import { getTrip } from '../../../../src/api/trips.api';
import { useAuth } from '../../../../src/auth/authContext';
import { startNewTrip, stepHref } from '../../../../src/navigation/tripSteps';
import { formatDate, formatTime } from '../../../../src/shared/dates';
import { formatFlightNumber } from '../../../../src/shared/format';
import { plural } from '../../../../src/shared/trips';
import { landsRelative } from '../../../../src/utils/travellers';
import { fontWeight, makeStyles, radius, spacing, useTheme } from '../../../../src/theme';

const MODE_LABELS = { shared: 'Pool with others', solo: 'Travel alone' };

const confirmedAtText = (iso) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

// A tick that grows in once (subtle)
function SuccessMark() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [scale] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
  }, [scale]);
  return (
    <Animated.View style={[styles.mark, { transform: [{ scale }] }]}>
      <CheckIcon size={36} color={colors.textOnBrand} strokeWidth={2.6} />
    </Animated.View>
  );
}

export default function BookingConfirmationScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { tripId } = useLocalSearchParams();
  const { user } = useAuth();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      getTrip(tripId).then(
        (t) => {
          setError(null);
          setTrip(t);
        },
        setError,
      ),
    [tripId],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const booking = trip?.booking;

  return (
    <FormScreen header={<AppHeader showBack title="Booking" />}>
      {!trip && !error && (
        <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="Loading your booking" />
      )}
      {!trip && error && error.status !== 401 && (
        <View style={styles.gap}>
          <Alert tone="error" title={error.status === 404 ? 'Booking not found' : 'We couldn’t load your booking'}>
            {error.message}
          </Alert>
          {error.status !== 404 && (
            <Button variant="secondary" onPress={load}>
              Try again
            </Button>
          )}
        </View>
      )}

      {trip && !booking && (
        <View style={styles.gap}>
          <Alert tone="warning" title="This trip isn’t booked yet">
            Review the booking summary and confirm it first.
          </Alert>
          <Button onPress={() => router.replace(stepHref(5, tripId))}>Go to booking summary</Button>
        </View>
      )}

      {trip && booking && (
        <View style={styles.gap}>
          <View style={styles.hero} testID="booking-hero">
            {booking.status === 'confirmed' ? <SuccessMark /> : null}
            <AppText variant="title" accessibilityRole="header" style={styles.center}>
              {booking.status === 'confirmed' ? 'Booking confirmed' : 'Booking cancelled'}
            </AppText>
            <AppText variant="small" style={styles.center}>
              {booking.status === 'confirmed'
                ? 'FlyPool has saved your booking. No payment has been taken.'
                : 'This booking was cancelled together with its trip.'}
            </AppText>
            <View style={styles.reference}>
              <AppText variant="overline" style={styles.referenceLabel}>
                Booking reference
              </AppText>
              <AppText variant="title" style={styles.referenceText} selectable testID="booking-reference">
                {booking.reference}
              </AppText>
            </View>
          </View>

          <SummaryCard title="Booking" testID="booking-details">
            <SummaryRow label="Status" value={booking.status === 'confirmed' ? 'Confirmed' : 'Cancelled'} strong testID="booking-status" />
            <SummaryRow label="Confirmed on" value={confirmedAtText(booking.confirmedAt)} />
            <SummaryRow label="Passenger" value={user?.name} testID="booking-passenger" />
            <SummaryRow label="Flight">
              {trip.flight?.flightNumber ? (
                <FlightCode>{formatFlightNumber(trip.flight.flightNumber)}</FlightCode>
              ) : (
                <AppText variant="label">Not recorded</AppText>
              )}
            </SummaryRow>
            <SummaryRow label="Arrives" value={`${formatDate(trip.travelDate)} · ${formatTime(trip.flight?.scheduledArrivalTime ?? trip.expectedArrivalTime)}`} />
            <SummaryRow label="Destination" value={trip.destination} testID="booking-destination" />
            <SummaryRow label="Ride type" value={MODE_LABELS[booking.mode]} testID="booking-mode" />
            <SummaryRow
              label="Vehicle"
              value={`${booking.vehicle?.label ?? booking.vehicleType}${booking.vehicle ? ` · up to ${booking.vehicle.seats} people` : ''}`}
              testID="booking-vehicle"
            />
          </SummaryCard>

          <SummaryCard title="Travellers" testID="booking-travellers">
            {booking.mode === 'solo' ? (
              <AppText variant="bodyStrong">Travelling Alone</AppText>
            ) : (
              <>
                <SummaryRow label="You" value={`${user?.name} · ${plural(booking.partySize, 'person', 'people')}`} />
                {booking.travellers.map((m, i) => (
                  <SummaryRow
                    key={i}
                    label={m.area ?? 'Your destination'}
                    value={`${plural(m.partySize, 'person', 'people')} · ${m.flightNumber ? formatFlightNumber(m.flightNumber) : 'flight'} · lands ${landsRelative(m.minutesApart).toLowerCase()}`}
                    testID="booking-other"
                  />
                ))}
                <AppText variant="caption">Who was in your shared ride when you booked.</AppText>
              </>
            )}
          </SummaryCard>

          <SummaryCard title="Fare (estimate at booking)" testID="booking-fare">
            <FareBreakdown fare={booking.fare} mode={booking.mode} partySize={booking.partySize} />
          </SummaryCard>

          {booking.status === 'confirmed' ? (
            <Button onPress={() => router.push({ pathname: '/trip/[tripId]/payment', params: { tripId } })} testID="pay-now">
              Pay now
            </Button>
          ) : null}
          <Button variant="secondary" onPress={() => router.push({ pathname: '/trip/[tripId]/manage', params: { tripId } })} testID="manage-booking">
            Manage booking
          </Button>
          {booking.status === 'confirmed' && booking.mode === 'shared' && trip.poolId ? (
            <Button onPress={() => router.push({ pathname: '/chat/[poolId]', params: { poolId: trip.poolId } })} testID="open-chat">
              Open group chat
            </Button>
          ) : null}
          <Button
            variant={booking.status === 'confirmed' && booking.mode === 'shared' ? 'secondary' : 'primary'}
            onPress={() => router.push('/trips')}
            testID="view-my-trips"
          >
            View My Trips
          </Button>
          <Button variant="secondary" onPress={startNewTrip} testID="back-home">
            Back to Home
          </Button>
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  center: { textAlign: 'center' },
  loading: { marginTop: spacing[10] },
  gap: { gap: spacing[4] },
  hero: { alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  mark: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.successIcon,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  reference: {
    marginTop: spacing[3],
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing[3],
    borderRadius: radius.xl,
    backgroundColor: colors.ink,
    borderWidth: 1,
    borderColor: colors.inkBorder,
  },
  referenceLabel: { color: colors.textOnDarkMuted },
  referenceText: { color: colors.accent, fontWeight: fontWeight.bold, letterSpacing: 2 },
}));
