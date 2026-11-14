// Ride Selection (step 4): Pool with others or Travel alone, then Sedan or
// SUV - the same choices and rules as the website's ride page.
//
// Server side (no changes were needed):
//   GET /trips/:tripId/matches  options: vehicles (seats, bags, fits your
//        group, solo fare estimate, shared rides you can join with their fare
//        estimates), compatible travellers, your saved ride
//   PUT /trips/:tripId/ride     { mode, vehicleType, poolId? } - saved in a
//        transaction; the server checks seats, bags, compatibility and that
//        the flight is verified. Repeating the same request is safe: it keeps
//        the ride already saved (never a second pool for the trip).
//
// "Pool with others" = join a shared ride of compatible travellers (the
// server lists only ones you fit into), or start one that they can join.
// The backend groups travellers into shared rides - it has no way to pick
// individual people - and never sends names or contact details.
//
// Unsaved choices survive leaving the screen (src/state/rideDrafts.js); a
// saved ride always comes from the server. Writes are never retried on their
// own; after a failure the options are reloaded so nothing stale is shown.
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppHeader from '../../../../src/components/AppHeader';
import AppText from '../../../../src/components/AppText';
import TravellerProfile from '../../../../src/components/TravellerProfile';
import LiveActivity from '../../../../src/components/LiveActivity';
import { useLiveRide } from '../../../../src/live/useLiveRide';
import Alert from '../../../../src/components/Alert';
import Button from '../../../../src/components/Button';
import Card from '../../../../src/components/Card';
import FareSummary from '../../../../src/components/FareSummary';
import FlightCode from '../../../../src/components/FlightCode';
import FormScreen from '../../../../src/components/FormScreen';
import SelectCard from '../../../../src/components/SelectCard';
import VehicleIllustration from '../../../../src/components/VehicleIllustration';
import { CheckIcon, UserIcon, UsersIcon } from '../../../../src/components/icons';
import { chooseRide, getMatches } from '../../../../src/api/trips.api';
import { startNewTrip, stepHref } from '../../../../src/navigation/tripSteps';
import { clearRideDraft, getRideDraft, setRideDraft } from '../../../../src/state/rideDrafts';
import { formatFlightNumber, formatRupees } from '../../../../src/shared/format';
import { plural } from '../../../../src/shared/trips';
import { landingTime, landsRelative } from '../../../../src/utils/travellers';
import { fontWeight, makeStyles, radius, spacing, useTheme } from '../../../../src/theme';

const NEW_POOL = 'new';
const MODE_LABELS = { shared: 'Pool with others', solo: 'Travel alone' };

// The options changed on the server (someone took the last seat, a ride
// closed): reload them and say so
const STALE_CODES = ['POOL_FULL', 'POOL_UNAVAILABLE', 'POOL_INCOMPATIBLE', 'POOL_CHANGED', 'POOL_NOT_FOUND', 'VEHICLE_MISMATCH'];

const REASONS = {
  custom_pickup: 'Pooling is only available for pickups at Mumbai Airport or Navi Mumbai Airport, so this trip can travel alone.',
  expired: 'This flight has already landed, so its ride can no longer be changed.',
};

const animate = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

// ---- pieces ------------------------------------------------------------------

function SectionTitle({ number, title, subtitle }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionTitle}>
      <View style={styles.number}>
        <AppText variant="caption" style={styles.numberText}>
          {number}
        </AppText>
      </View>
      <View style={styles.flex}>
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
        {subtitle ? <AppText variant="small">{subtitle}</AppText> : null}
      </View>
    </View>
  );
}

function Fact({ label, children, testID }) {
  const styles = useStyles();
  return (
    <View style={styles.fact} testID={testID}>
      <AppText variant="caption">{label}</AppText>
      {typeof children === 'string' ? <AppText variant="label">{children}</AppText> : children}
    </View>
  );
}

// Destination, flight, arrival, travellers found, current choice
function TripStrip({ trip, travellers, selection }) {
  const styles = useStyles();
  const { dateText, timeText } = landingTime(trip);
  return (
    <Card style={styles.strip} testID="ride-trip">
      <Fact label="Going to">{trip.destination}</Fact>
      <Fact label="Flight">
        <FlightCode>{formatFlightNumber(trip.flight?.flightNumber ?? '')}</FlightCode>
      </Fact>
      <Fact label="Arrives">{`${timeText} · ${dateText}`}</Fact>
      <Fact label="Compatible travellers" testID="ride-traveller-count">
        {String(travellers)}
      </Fact>
      <Fact label="Your choice" testID="ride-selection">
        {selection}
      </Fact>
    </Card>
  );
}

// One traveller in a shared ride: area, group, flight, landing time - never a name
function PoolMember({ member, index }) {
  const styles = useStyles();
  return (
    <View style={styles.member}>
      <UserIcon size={16} />
      <View style={styles.flex}>
      <TravellerProfile profile={member.profile} fallback={`Traveller ${index + 1}`} testID="pool-member-profile" />
      <AppText variant="small" style={styles.flex}>
        {member.area ?? 'Your destination'} · {plural(member.partySize, 'person', 'people')} ·{' '}
        {member.flightNumber ? formatFlightNumber(member.flightNumber) : 'flight'}
        {member.sameFlight ? ' (your flight)' : ''} · lands {landsRelative(member.minutesApart).toLowerCase()}
      </AppText>
      </View>
    </View>
  );
}

function PoolOption({ pool, selected, onPress, mine, partySize }) {
  const styles = useStyles();
  const seatsAfter = mine ? pool.seatsLeft : pool.seatsLeft - partySize;
  return (
    <SelectCard
      selected={selected}
      onPress={onPress}
      label={`${mine ? 'Your shared ride' : 'Shared ride'} with ${plural(pool.others.length, 'traveller', 'travellers')}`}
      testID={mine ? 'pool-mine' : `pool-${pool.id}`}
    >
      <AppText variant="label">
        {mine ? 'Your shared ride' : 'Join this shared ride'} · {plural(pool.others.length, 'other booking', 'other bookings')}
      </AppText>
      {pool.others.length ? (
        pool.others.map((m, i) => <PoolMember key={i} member={m} index={i} />)
      ) : (
        <AppText variant="small">Nobody else yet - compatible travellers can join you.</AppText>
      )}
      {pool.full ? (
        <AppText variant="label" style={styles.seatAlert} testID="pool-full">
          This shared ride is full.
        </AppText>
      ) : pool.seatsLeft === 1 ? (
        <AppText variant="label" style={styles.seatAlert} testID="pool-last-seat">
          Only 1 seat remaining in this shared ride.
        </AppText>
      ) : null}
      <AppText variant="caption" style={styles.poolMeta}>
        {plural(pool.seatsTaken, 'seat', 'seats')} of {pool.seats} taken
        {mine ? '' : ` · ${plural(Math.max(0, seatsAfter), 'seat', 'seats')} left after you join`}
        {pool.fare ? ` · your share ${formatRupees(pool.fare.yourShare)}` : ''}
      </AppText>
    </SelectCard>
  );
}

// After saving: what the server now has, with a way to change it
function SavedRide({ data, onChange, readOnly, tripId }) {
  const styles = useStyles();
  const ride = data.ride;
  const vehicle = ride.vehicle?.label ?? ride.vehicleType;
  const fare = ride.mode === 'solo' ? ride.soloFare : ride.pool?.fare;
  return (
    <View style={styles.gap} testID="ride-saved">
      <Alert tone="success" title={data.trip.booking?.status === 'confirmed' ? `Booked · ${data.trip.booking.reference}` : 'Your ride selection has been saved'}>
        {ride.mode === 'solo'
          ? `Travel alone in a ${vehicle}.`
          : `Shared ride in a ${vehicle}${ride.pool?.others?.length ? ` with ${plural(ride.pool.others.length, 'other booking', 'other bookings')}` : ' - compatible travellers can join you'}.`}
      </Alert>
      <Card style={styles.savedCard}>
        <VehicleIllustration type={ride.vehicleType} width={120} />
        <View style={styles.flex}>
          <AppText variant="overline">Your ride</AppText>
          <AppText variant="heading" testID="saved-ride-title">
            {MODE_LABELS[ride.mode]} · {vehicle}
          </AppText>
          <AppText variant="small">
            {ride.vehicle ? `Up to ${ride.vehicle.seats} people · ${ride.vehicle.bags} bags` : null}
          </AppText>
        </View>
      </Card>
      {ride.mode === 'shared' && ride.pool?.others?.length ? (
        <Card style={styles.gapSmall}>
          <AppText variant="label">Travelling with</AppText>
          {ride.pool.others.map((m, i) => (
            <PoolMember key={i} member={m} />
          ))}
        </Card>
      ) : null}
      <FareSummary
        fare={fare}
        kind={ride.mode === 'solo' ? 'solo' : 'mine'}
        partySize={data.trip.passengerCount}
        assumptions={data.fareAssumptions}
      />
      {data.trip.booking?.status === 'confirmed' ? (
        <Button onPress={() => router.push({ pathname: '/trip/[tripId]/booking', params: { tripId } })}>View booking</Button>
      ) : (
        <Button onPress={() => router.push(stepHref(5, tripId))} testID="to-summary">
          Continue to booking summary
        </Button>
      )}
      {!readOnly && (
        <Button variant="secondary" onPress={onChange} testID="ride-change">
          Change ride
        </Button>
      )}
      <Button variant="secondary" onPress={() => router.push('/trips')}>
        Go to My Trips
      </Button>
    </View>
  );
}

// ---- the screen ----------------------------------------------------------------

export default function RideSelectionScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { tripId } = useLocalSearchParams();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [mode, setMode] = useState(null);
  const [vehicleType, setVehicleType] = useState(null);
  const [poolChoice, setPoolChoice] = useState(null);
  const [editing, setEditing] = useState(false); // changing a saved ride
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false); // blocks a second tap before re-render

  // Load the options; restore unsaved choices, else the saved ride
  const load = useCallback(
    () =>
      getMatches(tripId).then(
        (result) => {
          setLoadError(null);
          setData(result);
          const draft = getRideDraft(tripId);
          const saved = result.ride;
          const start = draft ?? (saved ? { mode: saved.mode, vehicleType: saved.vehicleType, poolChoice: saved.pool?.id ?? null } : null);
          let nextMode = start?.mode ?? null;
          if (result.reason === 'custom_pickup' && nextMode === 'shared') nextMode = null;
          const vehicle = result.vehicles.find((v) => v.type === start?.vehicleType && v.fitsYourGroup);
          setMode(nextMode);
          setVehicleType(vehicle?.type ?? null);
          // A shared ride that is no longer offered falls back to "choose again"
          const myPoolId = saved?.mode === 'shared' ? saved.pool?.id : null;
          const offered = vehicle?.pools.some((p) => p.id === start?.poolChoice) || start?.poolChoice === myPoolId;
          setPoolChoice(start?.poolChoice === NEW_POOL || offered ? start.poolChoice : null);
          if (draft) setEditing(true); // a reload never ends editing that is under way
        },
        setLoadError,
      ),
    [tripId],
  );

  // Fresh seats and fares every time the screen comes into view
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // While in view: other passengers choosing now, and new / changed shared
  // rides (checked about every 4 s - when shared rides change, reload)
  const live = useLiveRide(tripId, { onPoolsChanged: load });

  function update(changes) {
    animate();
    const next = { mode, vehicleType, poolChoice, ...changes };
    setMode(next.mode);
    setVehicleType(next.vehicleType);
    setPoolChoice(next.poolChoice);
    setSubmitError(null);
    setNotice('');
    setRideDraft(tripId, next);
  }

  // ---- loading / errors before anything is shown ----
  if (!data) {
    return (
      <FormScreen header={<AppHeader showBack step={4} tripId={tripId} />}>
        <AppText variant="title" accessibilityRole="header" style={styles.title}>
          Choose your ride
        </AppText>
        {!loadError && (
          <View style={styles.loading} testID="ride-loading">
            <ActivityIndicator color={colors.primary} accessibilityLabel="Loading ride options" />
            <AppText variant="small">Loading ride options…</AppText>
          </View>
        )}
        {loadError && loadError.status !== 401 && (
          <View style={styles.gap}>
            <Alert
              tone={loadError.code === 'FLIGHT_NOT_VERIFIED' ? 'warning' : 'error'}
              title={loadError.code === 'FLIGHT_NOT_VERIFIED' ? 'Verify your flight first' : 'We couldn’t load ride options'}
            >
              {loadError.message}
            </Alert>
            {loadError.code === 'FLIGHT_NOT_VERIFIED' ? (
              <Button onPress={() => router.replace(stepHref(2, tripId))}>Verify your flight</Button>
            ) : loadError.code === 'TRIP_CANCELLED' || loadError.status === 404 ? (
              <Button onPress={startNewTrip}>Plan a new trip</Button>
            ) : (
              <Button variant="secondary" onPress={load} testID="ride-retry">
                Try again
              </Button>
            )}
          </View>
        )}
      </FormScreen>
    );
  }

  const { trip, ride, vehicles, travellers, reason } = data;
  const partySize = trip.passengerCount;
  const confirmed = ride?.mode === 'shared' && ride.pool?.status === 'confirmed';
  const booked = trip.booking?.status === 'confirmed'; // a booked ride can't change
  const readOnly = confirmed || booked || reason === 'expired';
  const showSaved = ride && !editing;

  // ---- the current selection ----
  const vehicle = vehicles.find((v) => v.type === vehicleType) ?? null;
  const myPool = ride?.mode === 'shared' ? ride.pool : null;
  const myPoolHere = myPool && myPool.vehicleType === vehicleType ? myPool : null;
  const joinable = vehicle?.pools ?? [];
  const selectedPool =
    poolChoice && poolChoice !== NEW_POOL
      ? (myPoolHere?.id === poolChoice ? myPoolHere : joinable.find((p) => p.id === poolChoice)) ?? null
      : null;

  let fare = null;
  let fareKind = null;
  let choice = null;
  let action = '';
  if (mode === 'solo' && vehicle) {
    fare = vehicle.soloFare;
    fareKind = 'solo';
    choice = { mode: 'solo', vehicleType };
    action = `Travel alone · ${vehicle.label}`;
  } else if (mode === 'shared' && vehicle && selectedPool) {
    const mine = selectedPool === myPoolHere;
    fare = selectedPool.fare;
    fareKind = mine ? 'mine' : 'join';
    choice = { mode: 'shared', vehicleType, poolId: selectedPool.id };
    action = `${mine ? 'Keep your shared ride' : 'Join a shared ride'} · ${vehicle.label}`;
  } else if (mode === 'shared' && vehicle && poolChoice === NEW_POOL) {
    fare = vehicle.soloFare;
    fareKind = 'new';
    choice = { mode: 'shared', vehicleType };
    action = `Start a shared ride · ${vehicle.label}`;
  }

  // What is still missing before Continue
  let missing = null;
  if (!mode) missing = 'Choose how you want to travel.';
  else if (!vehicle) missing = 'Choose a vehicle.';
  else if (mode === 'shared' && !choice) missing = 'Choose a shared ride to join, or start a new one.';

  const selectionText = mode ? `${MODE_LABELS[mode]}${vehicle ? ` · ${vehicle.label}` : ''}` : 'Not chosen yet';

  async function handleContinue() {
    if (inFlight.current || !choice) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setNotice('');
    try {
      const saved = await chooseRide(tripId, choice);
      clearRideDraft(tripId);
      await load(); // what the server saved (shown when coming back here)
      setEditing(false);
      // "Start a shared ride" when a compatible one had just been started: the
      // server joined it instead of making a duplicate - say so on the summary
      const summary = stepHref(5, tripId);
      router.push(saved?.outcome === 'joined_existing' ? { ...summary, params: { ...summary.params, joined: '1' } } : summary);
    } catch (error) {
      if (error.status === 401) return; // the session ended: the login screen takes over
      setSubmitError(error);
      if (STALE_CODES.includes(error.code)) {
        await load();
        setNotice('We’ve refreshed the ride options with the latest seats and fares.');
      } else if (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT') {
        await load(); // it may have been saved after all - the server's view
      }
      setEditing(true); // keep the choices and the message on screen
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const networkFailure = submitError && (submitError.code === 'NETWORK_ERROR' || submitError.code === 'TIMEOUT');

  return (
    <FormScreen header={<AppHeader showBack step={4} trip={trip} tripId={tripId} />}>
      <AppText variant="title" accessibilityRole="header" style={styles.title}>
        {showSaved ? 'Your ride' : 'Choose your ride'}
      </AppText>

      <LiveActivity live={live} />
      <TripStrip trip={trip} travellers={travellers.length} selection={showSaved ? `${MODE_LABELS[ride.mode]} · ${ride.vehicle?.label ?? ride.vehicleType}` : selectionText} />

      {showSaved ? (
        <SavedRide
          data={data}
          tripId={tripId}
          readOnly={readOnly}
          onChange={() => {
            animate();
            setEditing(true);
          }}
        />
      ) : (
        <View style={styles.sections}>
          {reason && (
            <Alert tone="info" title={reason === 'expired' ? 'This ride can’t be changed' : 'Travel alone only'}>
              {REASONS[reason]}
            </Alert>
          )}

          {/* 1. Pool or solo */}
          <View style={styles.gap}>
            <SectionTitle number={1} title="How do you want to travel?" />
            <SelectCard
              selected={mode === 'shared'}
              disabled={readOnly || reason === 'custom_pickup'}
              onPress={() => update({ mode: 'shared', poolChoice: null })}
              label="Pool with others"
              testID="mode-shared"
            >
              <View style={styles.optionHead}>
                <UsersIcon size={22} color={colors.primaryIcon} />
                <AppText variant="bodyStrong">Pool with others</AppText>
              </View>
              <AppText variant="small">
                Share your airport ride with compatible travellers going in the same direction and save on your
                journey.
              </AppText>
              <AppText variant="caption">
                {plural(travellers.length, 'compatible traveller', 'compatible travellers')} found for your flight time
                and route
              </AppText>
            </SelectCard>
            <SelectCard
              selected={mode === 'solo'}
              disabled={readOnly}
              onPress={() => update({ mode: 'solo', poolChoice: null })}
              label="Travel alone"
              testID="mode-solo"
            >
              <View style={styles.optionHead}>
                <UserIcon size={22} color={colors.primaryIcon} />
                <AppText variant="bodyStrong">Travel alone</AppText>
              </View>
              <AppText variant="small">Prefer your own ride? Travel alone directly to your destination.</AppText>
            </SelectCard>
          </View>

          {/* 2. Vehicle */}
          {mode && (
            <View style={styles.gap}>
              <SectionTitle
                number={2}
                title="Choose your vehicle"
                subtitle={`Your group: ${plural(partySize, 'person', 'people')} · ${plural(trip.luggageCount, 'bag', 'bags')}`}
              />
              {vehicles.map((v) => {
                const price = v.soloFare ? formatRupees(v.soloFare.total) : null;
                return (
                  <SelectCard
                    key={v.type}
                    selected={vehicleType === v.type}
                    disabled={readOnly || !v.fitsYourGroup}
                    onPress={() => update({ vehicleType: v.type, poolChoice: null })}
                    label={`${v.label}, up to ${v.seats} people and ${v.bags} bags${v.fitsYourGroup ? '' : ', too small for your group'}`}
                    testID={`vehicle-${v.type}`}
                  >
                    <View style={styles.vehicleRow}>
                      <VehicleIllustration type={v.type} width={96} muted={!v.fitsYourGroup} />
                      <View style={styles.flex}>
                        <AppText variant="bodyStrong">{v.label}</AppText>
                        <AppText variant="small">{v.description}</AppText>
                        <AppText variant="caption" testID={`vehicle-${v.type}-capacity`}>
                          Up to {v.seats} people · {v.bags} bags
                        </AppText>
                      </View>
                    </View>
                    {!v.fitsYourGroup ? (
                      <AppText variant="small" style={styles.warning} testID={`vehicle-${v.type}-too-small`}>
                        Too small for your group ({plural(partySize, 'person', 'people')},{' '}
                        {plural(trip.luggageCount, 'bag', 'bags')}).
                      </AppText>
                    ) : mode === 'solo' ? (
                      <AppText variant="label" testID={`vehicle-${v.type}-fare`}>
                        {price ? `${price} estimated for the whole cab` : 'No fare estimate for this drop-off'}
                      </AppText>
                    ) : (
                      <AppText variant="label" testID={`vehicle-${v.type}-fare`}>
                        {v.pools.length
                          ? `${plural(v.pools.length, 'shared ride', 'shared rides')} to join`
                          : 'No shared ride to join yet - start one'}
                        {price ? ` · alone ${price}` : ''}
                      </AppText>
                    )}
                  </SelectCard>
                );
              })}
            </View>
          )}

          {/* 3. Shared ride to join (pool only) */}
          {mode === 'shared' && vehicle && (
            <View style={styles.gap}>
              <SectionTitle
                number={3}
                title="Who to ride with"
                subtitle="Shared rides of compatible travellers that have room for your group. Names and contact details aren’t shown."
              />
              {myPoolHere && (
                <PoolOption
                  pool={myPoolHere}
                  mine
                  partySize={partySize}
                  selected={poolChoice === myPoolHere.id}
                  onPress={() => update({ poolChoice: myPoolHere.id })}
                />
              )}
              {joinable.map((p) => (
                <PoolOption
                  key={p.id}
                  pool={p}
                  partySize={partySize}
                  selected={poolChoice === p.id}
                  onPress={() => update({ poolChoice: p.id })}
                />
              ))}
              <SelectCard
                selected={poolChoice === NEW_POOL}
                onPress={() => update({ poolChoice: NEW_POOL })}
                label={myPoolHere ? 'Start a separate shared ride' : 'Start a new shared ride'}
                testID="pool-new"
              >
                <AppText variant="label">{myPoolHere ? 'Start a separate shared ride' : 'Start a new shared ride'}</AppText>
                <AppText variant="small">
                  {joinable.length
                    ? 'Your own shared ride that other compatible travellers can join.'
                    : 'No shared ride has room for you yet. Start one and compatible travellers who plan later can join you.'}
                </AppText>
              </SelectCard>
            </View>
          )}

          {/* Fare for the current choice */}
          {fareKind && <FareSummary fare={fare} kind={fareKind} partySize={partySize} assumptions={data.fareAssumptions} />}

          {notice ? <Alert tone="info">{notice}</Alert> : null}
          {submitError && (
            <Alert tone="error" title={networkFailure ? 'Your ride selection wasn’t confirmed' : 'We couldn’t save your ride'}>
              {networkFailure
                ? `${submitError.message} Tapping Continue again is safe - it won’t create a second ride.`
                : submitError.message}
            </Alert>
          )}

          <View style={styles.footer}>
            {action && !missing ? (
              <View style={styles.actionLine}>
                <CheckIcon size={16} color={colors.successIcon} />
                <AppText variant="small" testID="ride-action">
                  {action}
                </AppText>
              </View>
            ) : null}
            <Button
              onPress={handleContinue}
              loading={submitting}
              disabled={Boolean(missing) || readOnly}
              testID="ride-continue"
            >
              {submitting ? 'Saving your ride…' : 'Continue'}
            </Button>
            {missing && (
              <AppText variant="small" style={styles.center} accessibilityLiveRegion="polite" testID="ride-missing">
                {missing}
              </AppText>
            )}
            {ride && editing && !submitting && (
              <Button
                variant="secondary"
                onPress={() => {
                  clearRideDraft(tripId);
                  setEditing(false);
                  load();
                }}
              >
                Keep my saved ride
              </Button>
            )}
          </View>
        </View>
      )}
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  seatAlert: { marginTop: spacing[2] },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  title: { marginBottom: spacing[4] },
  loading: { alignItems: 'center', gap: spacing[3], marginTop: spacing[10] },
  gap: { gap: spacing[3] },
  gapSmall: { gap: spacing[2] },
  sections: { gap: spacing[6], marginTop: spacing[5] },
  strip: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[3], padding: spacing[4], marginBottom: spacing[1] },
  fact: { width: '50%', paddingRight: spacing[2], gap: 2 },
  sectionTitle: { flexDirection: 'row', gap: spacing[3], alignItems: 'flex-start' },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numberText: { color: colors.surface, fontWeight: fontWeight.semibold },
  optionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  warning: { color: colors.warning },
  member: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[2] },
  poolMeta: { marginTop: spacing[1] },
  savedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], borderRadius: radius.xl },
  footer: { gap: spacing[3] },
  actionLine: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], justifyContent: 'center' },
}));
