// My Trips: the logged-in passenger's own trips, from the server
// (GET /trips?when=upcoming and ?when=past - the server decides which is
// which by landing time). Reloaded every time the screen comes into view.
// Tapping a trip opens its details (the real trip id), from where the
// workflow continues - nothing is created here.
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AppHeader from '../../src/components/AppHeader';
import AppText from '../../src/components/AppText';
import Alert from '../../src/components/Alert';
import Button from '../../src/components/Button';
import Card from '../../src/components/Card';
import FormScreen from '../../src/components/FormScreen';
import TripCard from '../../src/components/TripCard';
import { TicketIcon } from '../../src/components/icons';
import { listTrips } from '../../src/api/trips.api';
import { startNewTrip as planTrip, stepHref } from '../../src/navigation/tripSteps';
import { makeStyles, radius, spacing, useTheme } from '../../src/theme';

const EMPTY_MESSAGE = 'You haven’t planned any trips yet. Start planning your first FlyPool ride!';

// A booked (or once-booked) trip opens Ride Management; others their details
function openTrip(trip) {
  if (trip.booking) router.push({ pathname: '/trip/[tripId]/manage', params: { tripId: trip.id } });
  else router.push(stepHref(1, trip.id));
}

// Sections from the server's own data: upcoming / past (GET /trips?when=...),
// the trip status and its booking. FlyPool has no "ride in progress" state
// (no dispatch yet), so there is no Active section.
function sectionsOf({ upcoming, past }) {
  const isCancelled = (t) => t.status === 'cancelled';
  const isBooked = (t) => t.booking?.status === 'confirmed';
  return {
    booked: upcoming.filter((t) => !isCancelled(t) && isBooked(t)),
    upcoming: upcoming.filter((t) => !isCancelled(t) && !isBooked(t)),
    past: past.filter((t) => !isCancelled(t)),
    cancelled: [...upcoming, ...past].filter(isCancelled),
  };
}

function Section({ title, trips, testID }) {
  const styles = useStyles();
  if (!trips.length) return null;
  return (
    <View style={styles.section} testID={testID}>
      <View style={styles.sectionHead}>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        <AppText variant="caption">{trips.length}</AppText>
      </View>
      {trips.map((trip) => (
        <TripCard key={trip.id} trip={trip} onPress={() => openTrip(trip)} />
      ))}
    </View>
  );
}

export default function MyTripsScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const [trips, setTrips] = useState(null); // { upcoming, past }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([listTrips('upcoming'), listTrips('past')]).then(
      ([upcoming, past]) => {
        setTrips({ upcoming, past });
        setError(null);
        setLoading(false);
      },
      (failure) => {
        setError(failure);
        setLoading(false);
      },
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const empty = trips && trips.upcoming.length === 0 && trips.past.length === 0;
  const sections = trips ? sectionsOf(trips) : null;

  async function pullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <FormScreen header={<AppHeader showBack title="My Trips" />} onRefresh={pullToRefresh} refreshing={refreshing}>
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          My Trips
        </AppText>
        <AppText variant="small">Your FlyPool trips. Tap one to manage its booking or carry on where you left off. Pull down to refresh.</AppText>
      </View>

      {!trips && !error && (
        <View style={styles.loading} testID="trips-loading">
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading your trips" />
          <AppText variant="small">Loading your trips…</AppText>
        </View>
      )}

      {error && error.status !== 401 && (
        <View style={styles.gap}>
          <Alert tone="error" title="We couldn’t load your trips">
            {error.message}
          </Alert>
          <Button variant="secondary" onPress={load} loading={loading} testID="trips-retry">
            Try again
          </Button>
        </View>
      )}

      {empty && (
        <Card style={styles.empty} testID="trips-empty">
          <View style={styles.emptyIcon}>
            <TicketIcon size={28} color={colors.primaryIcon} />
          </View>
          <AppText variant="body" style={styles.center}>
            {EMPTY_MESSAGE}
          </AppText>
          <Button onPress={planTrip}>Plan a trip</Button>
        </Card>
      )}

      {trips && !empty && (
        <View style={styles.sections}>
          <Section title="Booked rides" trips={sections.booked} testID="trips-booked" />
          <Section title="Upcoming trips" trips={sections.upcoming} testID="trips-upcoming" />
          <Section title="Past trips" trips={sections.past} testID="trips-past" />
          <Section title="Cancelled" trips={sections.cancelled} testID="trips-cancelled" />
          <Button variant="secondary" onPress={planTrip}>
            Plan a new trip
          </Button>
          <Button variant="secondary" onPress={() => router.push('/payments')} testID="payment-history">
            Payment history
          </Button>
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  center: { textAlign: 'center' },
  intro: { gap: spacing[1], marginBottom: spacing[5] },
  loading: { alignItems: 'center', gap: spacing[3], marginTop: spacing[10] },
  gap: { gap: spacing[4] },
  sections: { gap: spacing[6] },
  section: { gap: spacing[3] },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  empty: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[6] },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
