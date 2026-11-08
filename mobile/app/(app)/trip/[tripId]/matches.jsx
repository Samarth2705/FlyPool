// Find Travellers (Phase 6): verified travellers compatible with this trip,
// from GET /trips/:tripId/matches. Opened right after flight verification.
//
// The server decides who is compatible and in which order (see
// server/src/services/matching.service.js); this screen only shows the
// result. Read only - nothing here creates or changes a ride.
//
// An ended session (401) is handled by the API client and AuthProvider: the
// passenger is taken to the login screen with "your session has expired".
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AppHeader from '../../../../src/components/AppHeader';
import AppText from '../../../../src/components/AppText';
import Alert from '../../../../src/components/Alert';
import Button from '../../../../src/components/Button';
import Card from '../../../../src/components/Card';
import FlightCode from '../../../../src/components/FlightCode';
import FormScreen from '../../../../src/components/FormScreen';
import TravellerCard from '../../../../src/components/TravellerCard';
import VerifiedFlightCard from '../../../../src/components/VerifiedFlightCard';
import { UsersIcon } from '../../../../src/components/icons';
import { getMatches } from '../../../../src/api/trips.api';
import { startNewTrip, stepHref } from '../../../../src/navigation/tripSteps';
import { formatFlightNumber } from '../../../../src/shared/format';
import { isDemoVerification, pickupLabel } from '../../../../src/shared/trips';
import { landingTime } from '../../../../src/utils/travellers';
import { makeStyles, radius, spacing, useTheme } from '../../../../src/theme';

const EMPTY_MESSAGE =
  'No compatible travellers found yet. We’ll show you when someone with a similar route joins FlyPool.';

// When the server can't look for travellers for this trip (data.reason)
const REASONS = {
  custom_pickup: 'Finding travellers works for pickups at Mumbai Airport only, and this trip starts somewhere else.',
  expired: 'This flight has already landed, so FlyPool is no longer looking for travellers for this trip.',
};

const planAnotherTrip = startNewTrip;

// The passenger's own flight, at the top of the screen
function YourFlight({ trip }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const { dateText, timeText } = landingTime(trip);
  return (
    <View style={styles.gap}>
      <View style={styles.flight} testID="your-flight">
        <AppText variant="overline" style={styles.onDarkMuted}>
          Your flight
        </AppText>
        <View style={styles.flightRow}>
          <FlightCode>{formatFlightNumber(trip.flight?.flightNumber ?? '')}</FlightCode>
          <AppText variant="label" style={styles.onDark}>
            Lands {timeText} · {dateText}
          </AppText>
        </View>
        <AppText variant="bodyStrong" style={styles.onDark}>
          {pickupLabel(trip)} → {trip.destination}
        </AppText>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          style={styles.toggle}
        >
          <AppText variant="label" style={styles.toggleText}>
            {open ? 'Hide trip details' : 'Show trip details'}
          </AppText>
        </Pressable>
      </View>
      {open && <VerifiedFlightCard trip={trip} />}
    </View>
  );
}

// Why the list couldn't be loaded, and what the passenger can do
function LoadError({ error, tripId, onRetry, retrying }) {
  const styles = useStyles();
  if (error.status === 401) return null; // the session ended: the login screen takes over
  if (error.code === 'FLIGHT_NOT_VERIFIED') {
    return (
      <View style={styles.gap}>
        <Alert tone="warning" title="This flight isn’t verified yet">
          Verify your flight first - then we can look for travellers to share with.
        </Alert>
        <Button onPress={() => router.replace({ pathname: '/trip/[tripId]/verify', params: { tripId } })}>
          Verify your flight
        </Button>
      </View>
    );
  }
  if (error.code === 'TRIP_CANCELLED' || error.status === 404) {
    return (
      <View style={styles.gap}>
        <Alert tone="warning" title={error.code === 'TRIP_CANCELLED' ? 'This trip was cancelled' : 'Trip not found'}>
          {error.message}
        </Alert>
        <Button onPress={planAnotherTrip}>Plan another trip</Button>
      </View>
    );
  }
  return (
    <View style={styles.gap}>
      <Alert tone="error" title="We couldn’t load travellers">
        {error.message}
      </Alert>
      <Button variant="secondary" onPress={onRetry} loading={retrying} testID="matches-retry">
        Try again
      </Button>
    </View>
  );
}

export default function FindTravellersScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { tripId } = useLocalSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0); // only the newest request may update the screen

  // fetchMatches: the request itself (also the first load). load: a reload
  // asked for by the passenger ("Try again", "Check again", "Refresh").
  const fetchMatches = useCallback(() => {
    const request = ++latest.current;
    const current = () => request === latest.current;
    return getMatches(tripId).then(
      (result) => {
        if (!current()) return;
        setData(result);
        setError(null);
        setLoading(false);
      },
      (failure) => {
        if (!current()) return;
        setError(failure);
        setLoading(false);
      },
    );
  }, [tripId]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchMatches();
  }, [fetchMatches]);

  useEffect(() => {
    fetchMatches(); // `loading` starts as true
    return () => {
      latest.current += 1; // ignore answers that arrive after leaving
    };
  }, [fetchMatches]);

  const trip = data?.trip;
  const travellers = data?.travellers ?? [];

  return (
    <FormScreen header={<AppHeader showBack step={3} trip={trip} tripId={tripId} />}>
      <View style={styles.intro}>
        <AppText variant="title" accessibilityRole="header">
          Find Travellers
        </AppText>
        <AppText variant="small">Verified travellers landing near your time and heading your way.</AppText>
      </View>

      {!data && loading && (
        <View style={styles.loading} testID="matches-loading">
          <ActivityIndicator color={colors.primary} accessibilityLabel="Finding travellers" />
          <AppText variant="small">Finding travellers on your route…</AppText>
        </View>
      )}

      {!data && error && <LoadError error={error} tripId={tripId} onRetry={load} retrying={loading} />}

      {trip && (
        <View style={styles.sections}>
          <Alert tone="success" title="Flight verified successfully.">
            {isDemoVerification(trip)
              ? 'Your ticket and flight details passed FlyPool’s demo checks. This is not a confirmation from the airline.'
              : 'Your flight details have been checked.'}
          </Alert>

          <YourFlight trip={trip} />

          {data.reason ? (
            <Alert tone="info" title="No travellers to show for this trip">
              {REASONS[data.reason] ?? 'FlyPool can’t look for travellers for this trip.'}
            </Alert>
          ) : (
            <View style={styles.gap}>
              <View style={styles.sectionHead}>
                <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
                  Travellers going your way
                </AppText>
                <View style={styles.count}>
                  <AppText variant="caption" style={styles.countText} testID="traveller-count">
                    {travellers.length}
                  </AppText>
                </View>
              </View>

              {error && (
                <Alert tone="error" title="We couldn’t refresh the list">
                  {error.message}
                </Alert>
              )}

              {travellers.length === 0 ? (
                <Card style={styles.empty} testID="matches-empty">
                  <View style={styles.emptyIcon}>
                    <UsersIcon size={28} color={colors.primaryIcon} />
                  </View>
                  <AppText variant="body" style={styles.center}>
                    {EMPTY_MESSAGE}
                  </AppText>
                  <Button variant="secondary" onPress={load} loading={loading} testID="matches-refresh">
                    Check again
                  </Button>
                </Card>
              ) : (
                <>
                  {travellers.map((traveller, index) => (
                    <TravellerCard
                      key={traveller.ref}
                      traveller={traveller}
                      index={index}
                      trip={trip}
                      windowMinutes={data.arrivalWindowMinutes}
                    />
                  ))}
                  <AppText variant="caption" style={styles.note}>
                    Travellers on your flight come first, then those landing closest to your time. Names and contact
                    details aren’t shown.
                  </AppText>
                  <Button variant="secondary" onPress={load} loading={loading} testID="matches-refresh">
                    Refresh
                  </Button>
                </>
              )}
            </View>
          )}

          <Button onPress={() => router.push(stepHref(4, trip.id))} testID="choose-ride">
            {trip.status === 'ride_selected' ? 'View your ride' : 'Choose your ride'}
          </Button>
          <Button variant="secondary" onPress={planAnotherTrip}>
            Plan another trip
          </Button>
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  intro: { gap: spacing[1], marginBottom: spacing[5] },
  loading: { alignItems: 'center', gap: spacing[3], marginTop: spacing[10] },
  sections: { gap: spacing[6] },
  gap: { gap: spacing[4] },
  flight: {
    backgroundColor: colors.brandPanel,
    borderRadius: radius.xl,
    padding: spacing[5],
    gap: spacing[3],
  },
  flightRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing[3] },
  onDark: { color: colors.textOnDark },
  onDarkMuted: { color: colors.textOnDarkMuted },
  toggle: { alignSelf: 'flex-start', minHeight: 24, justifyContent: 'center' },
  toggleText: { color: colors.accent },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  count: {
    minWidth: 28,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
  },
  countText: { color: colors.primarySoftText },
  empty: { alignItems: 'center', gap: spacing[4], paddingVertical: spacing[6] },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { textAlign: 'center' },
}));
