// Trip Planning for a saved trip (step 1 again): opened from the step bar,
// Back from Flight Verification, or My Trips. Loads the trip
// (GET /trips/:tripId) every time the screen comes into view, then:
//   awaiting verification  the planning form, filled in - changes are saved
//                          to this same trip (PATCH /trips/:tripId)
//   flight verified        read only: the server locks trip details once the
//                          flight is verified (409 TRIP_LOCKED), so the app
//                          says so and offers the next step instead
//   cancelled              read only, with "Plan a new trip"
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppHeader from '../../../../src/components/AppHeader';
import AppText from '../../../../src/components/AppText';
import Alert from '../../../../src/components/Alert';
import Button from '../../../../src/components/Button';
import Card from '../../../../src/components/Card';
import FormScreen from '../../../../src/components/FormScreen';
import VerifiedFlightCard from '../../../../src/components/VerifiedFlightCard';
import TripPlanningScreen from '../../../../src/screens/TripPlanningScreen';
import { getTrip } from '../../../../src/api/trips.api';
import { VERIFIED_STATUSES, startNewTrip, stepHref } from '../../../../src/navigation/tripSteps';
import { formatDate, formatTime } from '../../../../src/shared/dates';
import { partyLabel, pickupLabel } from '../../../../src/shared/trips';
import { makeStyles, spacing, useTheme } from '../../../../src/theme';

function Row({ label, value }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <AppText variant="small">{label}</AppText>
      <AppText variant="label" style={styles.value}>
        {value}
      </AppText>
    </View>
  );
}

function LockedTrip({ trip }) {
  const styles = useStyles();
  const verified = VERIFIED_STATUSES.includes(trip.status);
  return (
    <View style={styles.gap}>
      {verified ? (
        <Alert tone="info" title="These details are locked">
          Your flight is verified, so this trip’s details can no longer be changed. To travel differently, plan a new
          trip.
        </Alert>
      ) : (
        <Alert tone="warning" title="This trip was cancelled">
          It can’t be changed or continued. Plan a new trip to travel.
        </Alert>
      )}

      {verified ? (
        <VerifiedFlightCard trip={trip} />
      ) : (
        <Card testID="trip-summary">
          <Row label="From" value={pickupLabel(trip)} />
          <Row label="To" value={trip.destination} />
          <Row label="Date" value={formatDate(trip.travelDate)} />
          <Row label="Landing" value={formatTime(trip.expectedArrivalTime)} />
          <Row label="Travelling" value={partyLabel(trip)} />
        </Card>
      )}

      {trip.booking?.status === 'confirmed' && (
        <Button onPress={() => router.push({ pathname: '/trip/[tripId]/booking', params: { tripId: trip.id } })} testID="view-booking">
          View booking {trip.booking.reference}
        </Button>
      )}
      {trip.status === 'ride_selected' && !trip.booking?.status && (
        <Button onPress={() => router.push(stepHref(5, trip.id))}>Review and book</Button>
      )}
      {trip.status === 'ride_selected' && (
        <Button variant="secondary" onPress={() => router.push(stepHref(4, trip.id))}>
          View your ride
        </Button>
      )}
      {verified && (
        <Button variant={trip.status === 'ride_selected' ? 'secondary' : 'primary'} onPress={() => router.push(stepHref(3, trip.id))}>
          See compatible travellers
        </Button>
      )}
      <Button variant={verified ? 'secondary' : 'primary'} onPress={startNewTrip}>
        Plan a new trip
      </Button>
    </View>
  );
}

export default function TripDetailsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { tripId } = useLocalSearchParams();
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

  // Editable: the planning form for this trip (remounted only if its status changes)
  if (trip && trip.status === 'awaiting_verification') {
    return <TripPlanningScreen key={`${trip.id}-${trip.status}`} existing={trip} />;
  }

  return (
    <FormScreen header={<AppHeader showBack step={1} trip={trip} tripId={tripId} />}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        Your trip details
      </AppText>

      {!trip && !error && (
        <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="Loading your trip" />
      )}

      {!trip && error && error.status !== 401 && (
        <View style={styles.gap}>
          <Alert tone="error" title={error.status === 404 ? 'Trip not found' : 'We couldn’t load this trip'}>
            {error.message}
          </Alert>
          {error.status === 404 ? (
            <Button onPress={startNewTrip}>Plan a new trip</Button>
          ) : (
            <Button variant="secondary" onPress={load}>
              Try again
            </Button>
          )}
        </View>
      )}

      {trip && <LockedTrip trip={trip} />}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  title: { marginBottom: spacing[4] },
  loading: { marginTop: spacing[10] },
  gap: { gap: spacing[4] },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing[4],
    paddingVertical: spacing[2] + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  value: { flexShrink: 1, textAlign: 'right' },
}));
