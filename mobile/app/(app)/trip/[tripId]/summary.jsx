// Booking Summary (step 5): everything about the trip and the chosen ride,
// from the server, then "Confirm Booking".
//
//   GET  /trips/:tripId/matches   the saved trip, its saved ride (with the
//        shared ride's other bookings and the fare estimate) and the fare
//        assumptions - reloaded every time the screen comes into view, so
//        edits made in earlier steps show up here
//   POST /trips/:tripId/booking   { mode, vehicleType, poolId, yourShare } -
//        what the passenger reviewed. The server checks everything again and
//        refuses (409 BOOKING_REVIEW_CHANGED) if the ride changed meanwhile.
//        Repeating it returns the same booking, so it can't book twice.
//
// The confirmation screen opens only after the server has saved the booking.
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppHeader from '../../../../src/components/AppHeader';
import AppText from '../../../../src/components/AppText';
import TravellerProfile from '../../../../src/components/TravellerProfile';
import Alert from '../../../../src/components/Alert';
import Button from '../../../../src/components/Button';
import FareBreakdown from '../../../../src/components/FareBreakdown';
import FlightCode from '../../../../src/components/FlightCode';
import FormScreen from '../../../../src/components/FormScreen';
import SummaryCard, { SummaryRow } from '../../../../src/components/SummaryCard';
import { UserIcon } from '../../../../src/components/icons';
import { confirmBooking, getMatches } from '../../../../src/api/trips.api';
import { useAuth } from '../../../../src/auth/authContext';
import { goToStep, startNewTrip, stepHref } from '../../../../src/navigation/tripSteps';
import { formatDate, formatTime } from '../../../../src/shared/dates';
import { formatFlightNumber, formatRupees } from '../../../../src/shared/format';
import { airportLabel, isDemoVerification, partyLabel, pickupLabel, plural, terminalLabel } from '../../../../src/shared/trips';
import { airportByCode } from '../../../../src/shared/mumbaiLocations';
import { landsRelative } from '../../../../src/utils/travellers';
import { makeStyles, spacing, useTheme } from '../../../../src/theme';

const MODE_LABELS = { shared: 'Pool with others', solo: 'Travel alone' };
// The ride or its options changed on the server: reload and ask to review
const REVIEW_CODES = ['BOOKING_REVIEW_CHANGED', 'BOOKING_CONFLICT', 'POOL_UNAVAILABLE', 'POOL_NO_TRAVELLERS', 'RIDE_NOT_SELECTED'];

const yourShareOf = (ride) => (ride.mode === 'solo' ? (ride.soloFare?.total ?? null) : (ride.pool?.fare?.yourShare ?? null));
// What the passenger is looking at - if this changes, they must review again
const reviewKey = (ride) => (ride ? [ride.mode, ride.vehicleType, ride.pool?.id ?? '', yourShareOf(ride) ?? ''].join('|') : '');

function OtherTraveller({ member, index, testID }) {
  const styles = useStyles();
  return (
    <SummaryRow label={member.area ?? 'Your destination'} testID={testID}>
      <View style={styles.otherTraveller}>
        <TravellerProfile profile={member.profile} fallback={`Traveller ${index + 1}`} testID="summary-other-profile" />
        <AppText variant="label" style={styles.value}>
          {plural(member.partySize, 'person', 'people')} · {member.flightNumber ? formatFlightNumber(member.flightNumber) : 'flight'}
          {member.sameFlight ? ' (your flight)' : ''} · lands {landsRelative(member.minutesApart).toLowerCase()}
        </AppText>
      </View>
    </SummaryRow>
  );
}

export default function BookingSummaryScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { tripId, joined } = useLocalSearchParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [changed, setChanged] = useState(false); // the ride changed since it was shown
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const shownKey = useRef(null);
  const inFlight = useRef(false);

  const load = useCallback(
    () =>
      getMatches(tripId).then(
        (result) => {
          const key = reviewKey(result.ride);
          if (shownKey.current !== null && shownKey.current !== key) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setChanged(true);
          }
          shownKey.current = key;
          setLoadError(null);
          setData(result);
        },
        setLoadError,
      ),
    [tripId],
  );
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const edit = (step) => goToStep(step, 5, tripId);

  if (!data) {
    return (
      <FormScreen header={<AppHeader showBack step={5} tripId={tripId} />}>
        <AppText variant="title" accessibilityRole="header" style={styles.title}>
          Booking summary
        </AppText>
        {!loadError && (
          <View style={styles.loading} testID="summary-loading">
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your booking summary" />
            <AppText variant="small">Loading your booking summary…</AppText>
          </View>
        )}
        {loadError && loadError.status !== 401 && (
          <View style={styles.gap}>
            <Alert tone={loadError.code === 'FLIGHT_NOT_VERIFIED' ? 'warning' : 'error'} title="We couldn’t load the booking summary">
              {loadError.message}
            </Alert>
            {loadError.code === 'FLIGHT_NOT_VERIFIED' ? (
              <Button onPress={() => router.replace(stepHref(2, tripId))}>Verify your flight</Button>
            ) : loadError.code === 'TRIP_CANCELLED' || loadError.status === 404 ? (
              <Button onPress={startNewTrip}>Plan a new trip</Button>
            ) : (
              <Button variant="secondary" onPress={load} testID="summary-retry">
                Try again
              </Button>
            )}
          </View>
        )}
      </FormScreen>
    );
  }

  const { trip, ride } = data;
  const flight = trip.flight ?? {};
  const booked = trip.booking?.status === 'confirmed';
  const pool = ride?.mode === 'shared' ? ride.pool : null;
  const others = pool?.others ?? [];
  const fare = ride ? (ride.mode === 'solo' ? ride.soloFare : pool?.fare) : null;
  const passengers = ride?.mode === 'shared' ? (pool?.seatsTaken ?? trip.passengerCount) : trip.passengerCount;
  const landing = flight.scheduledArrivalTime ?? trip.expectedArrivalTime;
  const flightDate = flight.flightDate ?? trip.travelDate;

  // Why it can't be confirmed (yet)
  let blocker = null;
  if (!ride) blocker = { title: 'Choose your ride first', text: 'Pick Pool or Travel alone and a vehicle before booking.', step: 4, action: 'Choose your ride' };
  else if (data.reason === 'expired') blocker = { title: 'This flight has already landed', text: 'It can no longer be booked.' };
  else if (ride.mode === 'shared' && !pool) blocker = { title: 'Your shared ride is no longer available', text: 'Please choose your ride again.', step: 4, action: 'Change ride' };
  else if (ride.mode === 'shared' && others.length === 0)
    blocker = {
      title: 'Nobody has joined your shared ride yet',
      text: 'A shared ride can be booked once a compatible traveller has joined. Wait for someone to join, or choose to travel alone.',
      step: 4,
      action: 'Change ride',
    };

  async function handleConfirm() {
    if (inFlight.current || blocker || booked) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await confirmBooking(tripId, {
        mode: ride.mode,
        vehicleType: ride.vehicleType,
        poolId: pool?.id ?? null,
        yourShare: yourShareOf(ride),
      });
      // Saved by the server: show the confirmed booking (this summary is done)
      router.replace({ pathname: '/trip/[tripId]/booking', params: { tripId } });
    } catch (error) {
      if (error.status === 401) return; // the session ended: the login screen takes over
      setSubmitError(error);
      if (REVIEW_CODES.includes(error.code)) {
        shownKey.current = null; // the reloaded summary is the one to review
        setChanged(true);
        await load();
      } else if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
        await load(); // it may have been booked after all
      }
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const networkFailure = submitError && (submitError.code === 'NETWORK_ERROR' || submitError.code === 'TIMEOUT');

  return (
    <FormScreen header={<AppHeader showBack step={5} trip={trip} tripId={tripId} />}>
      <AppText variant="title" accessibilityRole="header">
        Booking summary
      </AppText>
      <AppText variant="small" style={styles.intro}>
        Check your trip and ride before booking. You can change anything that isn’t locked.
      </AppText>

      <View style={styles.sections}>
        {booked && (
          <View style={styles.gap}>
            <Alert tone="success" title={`Booked · ${trip.booking.reference}`}>
              This ride is booked, so it can no longer be changed.
            </Alert>
            <Button onPress={() => router.push({ pathname: '/trip/[tripId]/booking', params: { tripId } })}>View booking</Button>
          </View>
        )}
        {changed && !booked && (
          <Alert tone="warning" title="Please review your ride again" testID="summary-changed">
            Your ride or its fare changed since you last looked. Check the details below before confirming.
          </Alert>
        )}

        {joined === '1' ? (
          <Alert tone="info" title="You joined a shared ride that had just been started" testID="summary-joined-existing">
            A compatible passenger started a shared ride for your flight a moment before you, so you’ve been added to it instead of
            starting a second one.
          </Alert>
        ) : null}

        {/* A. Trip */}
        <SummaryCard title="Trip details" onEdit={booked ? null : () => edit(1)} editLabel="Edit trip details" testID="summary-trip">
          <SummaryRow label="Passenger" value={user?.name} testID="summary-passenger" />
          <SummaryRow label="From" value={pickupLabel(trip)} />
          <SummaryRow label="Destination" value={trip.destination} testID="summary-destination" />
          <SummaryRow label="Arrival date" value={formatDate(trip.travelDate)} />
          <SummaryRow label="Arrival time" value={formatTime(landing)} />
          <SummaryRow label="Flight number">
            {flight.flightNumber ? <FlightCode>{formatFlightNumber(flight.flightNumber)}</FlightCode> : <AppText variant="label">Not added</AppText>}
          </SummaryRow>
          <SummaryRow label="Travelling" value={partyLabel(trip)} />
        </SummaryCard>

        {/* B. Flight */}
        <SummaryCard title="Flight" onEdit={booked ? null : () => edit(2)} editLabel="View flight verification" testID="summary-flight">
          <SummaryRow label="Verified flight" value={flight.flightNumber ? formatFlightNumber(flight.flightNumber) : 'Not verified'} />
          <SummaryRow label="Airline" value={flight.airline ?? 'Not recorded'} />
          <SummaryRow label="Departure airport" value="Not recorded" testID="summary-departure" />
          <SummaryRow
            label="Arrival airport"
            value={`${airportLabel(trip) ?? airportByCode(flight.arrivalAirport)?.shortName ?? 'Mumbai Airport (BOM)'}${terminalLabel(trip) ? ` · ${terminalLabel(trip)}` : ''}`}
          />
          <SummaryRow label="Arrives" value={`${formatDate(flightDate)} · ${formatTime(landing)}`} />
          <SummaryRow
            label="Verification"
            value={trip.verification?.status === 'verified' ? (isDemoVerification(trip) ? 'Verified (demo check)' : 'Verified') : 'Not verified'}
            testID="summary-verification"
          />
        </SummaryCard>

        {/* C. Travellers */}
        <SummaryCard title="Travellers" onEdit={booked ? null : () => edit(3)} editLabel="View compatible travellers" testID="summary-travellers">
          {ride?.mode === 'shared' ? (
            <>
              <SummaryRow label="You">
                <View style={styles.you}>
                  <UserIcon size={16} color={colors.primaryIcon} />
                  <AppText variant="label" style={styles.value}>
                    {user?.name} · {plural(trip.passengerCount, 'person', 'people')} · {trip.destination}
                  </AppText>
                </View>
              </SummaryRow>
              {others.map((m, i) => (
                <OtherTraveller key={i} member={m} index={i} testID="summary-other" />
              ))}
              {others.length === 0 && <AppText variant="small">Nobody else has joined your shared ride yet.</AppText>}
              <SummaryRow label="Total passengers" value={plural(passengers, 'person', 'people')} strong testID="summary-total-passengers" />
              <AppText variant="caption">Other travellers are shown by drop-off area, with the name, age and identity status they chose to share.</AppText>
            </>
          ) : ride?.mode === 'solo' ? (
            <AppText variant="bodyStrong" testID="summary-alone">
              Travelling Alone
            </AppText>
          ) : (
            <AppText variant="small">Choose your ride to see who you travel with.</AppText>
          )}
        </SummaryCard>

        {/* D. Ride */}
        <SummaryCard title="Ride" onEdit={booked ? null : () => edit(4)} editLabel="Change ride" testID="summary-ride">
          {ride ? (
            <>
              <SummaryRow label="Ride type" value={MODE_LABELS[ride.mode]} testID="summary-mode" />
              <SummaryRow label="Vehicle" value={ride.vehicle?.label ?? ride.vehicleType} testID="summary-vehicle" />
              {ride.vehicle ? (
                <SummaryRow label="Vehicle capacity" value={`${ride.vehicle.seats} people · ${ride.vehicle.bags} bags`} />
              ) : null}
              <SummaryRow label="Passengers" value={plural(passengers, 'person', 'people')} />
              <SummaryRow label="Estimated total fare" value={fare ? formatRupees(fare.total) : 'Not available yet'} />
              {ride.mode === 'shared' && fare ? (
                <SummaryRow
                  label="Estimated fare per passenger"
                  value={fare.perPerson.min === fare.perPerson.max ? formatRupees(fare.perPerson.min) : `${formatRupees(fare.perPerson.min)}–${formatRupees(fare.perPerson.max)}`}
                />
              ) : null}
            </>
          ) : (
            <AppText variant="small">No ride chosen yet.</AppText>
          )}
        </SummaryCard>

        {/* E. Fare */}
        {ride && (
          <SummaryCard title="Fare breakdown" testID="summary-fare">
            <FareBreakdown fare={fare} mode={ride.mode} partySize={trip.passengerCount} assumptions={data.fareAssumptions} />
          </SummaryCard>
        )}

        {!booked && (
          <View style={styles.gap}>
            {blocker && (
              <Alert tone="warning" title={blocker.title}>
                {blocker.text}
              </Alert>
            )}
            {blocker?.step && (
              <Button variant="secondary" onPress={() => edit(blocker.step)}>
                {blocker.action}
              </Button>
            )}
            {submitError && (
              <Alert tone="error" title={networkFailure ? 'Your booking wasn’t confirmed' : 'We couldn’t confirm your booking'}>
                {networkFailure
                  ? `${submitError.message} Tapping Confirm Booking again is safe - you won’t be booked twice.`
                  : submitError.message}
              </Alert>
            )}
            <Button onPress={handleConfirm} loading={submitting} disabled={Boolean(blocker)} testID="confirm-booking">
              {submitting ? 'Confirming your booking…' : 'Confirm Booking'}
            </Button>
            <AppText variant="caption" style={styles.center}>
              Confirming saves your booking with FlyPool. No payment is taken.
            </AppText>
          </View>
        )}
      </View>
    </FormScreen>
  );
}

const useStyles = makeStyles(() => ({
  center: { textAlign: 'center' },
  otherTraveller: { flex: 1, gap: spacing[1] },
  title: { marginBottom: spacing[4] },
  intro: { marginTop: spacing[1] },
  loading: { alignItems: 'center', gap: spacing[3], marginTop: spacing[10] },
  gap: { gap: spacing[3] },
  sections: { gap: spacing[4], marginTop: spacing[5] },
  value: { flexShrink: 1, textAlign: 'right' },
  you: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexShrink: 1 },
}));
