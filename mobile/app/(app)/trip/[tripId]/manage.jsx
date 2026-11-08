// Ride Management: a booked trip's details, status and history, with
// "Cancel booking" and (shared rides) "Leave shared ride".
//
//   GET  /trips/:tripId/booking              status, timeline, booking, and
//                                            what the server allows now
//   POST /trips/:tripId/booking/cancel       { reason? } cancels the booking
//                                            and its trip (kept as history)
//   POST /trips/:tripId/booking/leave-pool   leaves the shared ride: the
//                                            booking ends, the trip goes on
//
// Only statuses FlyPool really has are shown (booking confirmed, arrival
// time passed, cancelled) - there is no driver or ride dispatch yet. The
// screen refreshes when it comes into view, every 30 s while it is on
// screen, and by pulling down. A result is shown only after the server
// confirms it; buttons can't be pressed twice while a request is running.
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppHeader from '../../../../src/components/AppHeader';
import AppText from '../../../../src/components/AppText';
import Alert from '../../../../src/components/Alert';
import Button from '../../../../src/components/Button';
import ConfirmSheet from '../../../../src/components/ConfirmSheet';
import FlightCode from '../../../../src/components/FlightCode';
import FormScreen from '../../../../src/components/FormScreen';
import SummaryCard, { SummaryRow } from '../../../../src/components/SummaryCard';
import TextField from '../../../../src/components/TextField';
import { cancelBooking, getBookingManagement, leaveSharedRide } from '../../../../src/api/trips.api';
import { useNotifications } from '../../../../src/notifications/NotificationsProvider';
import { stepHref } from '../../../../src/navigation/tripSteps';
import { formatDate, formatTime } from '../../../../src/shared/dates';
import { formatFlightNumber } from '../../../../src/shared/format';
import { pickupLabel, plural } from '../../../../src/shared/trips';
import { landsRelative } from '../../../../src/utils/travellers';
import { fontWeight, makeStyles, radius, spacing, useTheme } from '../../../../src/theme';

const REFRESH_EVERY_MS = 30 * 1000;
const MODE_LABELS = { shared: 'Pool with others', solo: 'Travel alone' };
const BOOKING_STATUS = { confirmed: 'Confirmed', cancelled: 'Cancelled', left_pool: 'Ended - you left the shared ride' };
// Things changed on the server since the screen loaded: reload and say so
const STALE_CODES = ['BOOKING_ALREADY_CANCELLED', 'NO_ACTIVE_BOOKING', 'NOT_IN_POOL', 'TRIP_IN_PAST', 'RIDE_COMPLETED', 'POOL_CONFIRMED', 'TRIP_CANCELLED'];

const dateTime = (iso) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(
    new Date(iso),
  );

function StatusCard({ status }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const tone = {
    confirmed: [colors.successSurface, colors.successText, colors.successIcon],
    arrived: [colors.primarySoft, colors.primarySoftText, colors.primaryIcon],
    cancelled: [colors.surfaceMuted, colors.textSecondary, colors.textMuted],
    not_booked: [colors.warningSurface, colors.warningText, colors.warningIcon],
  }[status.code];
  const note = {
    confirmed: 'FlyPool has saved your booking. Payment and driver details aren’t part of the app yet.',
    arrived: 'Your flight’s arrival time has passed.',
    cancelled: 'This booking is cancelled and kept in your history.',
    not_booked: 'This trip has no confirmed booking right now.',
  }[status.code];
  return (
    <View style={[styles.status, { backgroundColor: tone[0] }]} testID="ride-status">
      <View style={[styles.statusDot, { backgroundColor: tone[2] }]} />
      <View style={styles.flex}>
        <AppText variant="heading" style={{ color: tone[1] }} testID="ride-status-label">
          {status.label}
        </AppText>
        <AppText variant="small" style={{ color: tone[1] }}>
          {note}
        </AppText>
      </View>
    </View>
  );
}

function Timeline({ events }) {
  const styles = useStyles();
  return (
    <View testID="ride-timeline">
      {events.map((e, i) => (
        <View key={`${e.key}-${i}`} style={styles.event}>
          <View style={styles.rail}>
            <View style={[styles.eventDot, i === events.length - 1 && styles.eventDotLast]} />
            {i < events.length - 1 && <View style={styles.eventLine} />}
          </View>
          <View style={styles.eventText}>
            <AppText variant={i === events.length - 1 ? 'label' : 'small'}>{e.label}</AppText>
            <AppText variant="caption">{dateTime(e.at)}</AppText>
          </View>
        </View>
      ))}
    </View>
  );
}

function Traveller({ member, testID }) {
  return (
    <SummaryRow
      label={member.area ?? 'Your destination'}
      value={`${plural(member.partySize, 'person', 'people')} · ${member.flightNumber ? formatFlightNumber(member.flightNumber) : 'flight'} · lands ${landsRelative(member.minutesApart).toLowerCase()}`}
      testID={testID}
    />
  );
}

export default function RideManagementScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { tripId } = useLocalSearchParams();
  const { refresh: refreshBell } = useNotifications();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState(null); // 'cancel' | 'leave' | null
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [done, setDone] = useState(null); // success message, after the server confirmed
  const inFlight = useRef(false);

  const load = useCallback(
    () =>
      getBookingManagement(tripId).then(
        (result) => {
          setLoadError(null);
          setData(result);
        },
        setLoadError,
      ),
    [tripId],
  );

  // Fresh when it comes into view, then every 30 s while on screen
  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(() => AppState.currentState !== 'background' && load(), REFRESH_EVERY_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  async function pullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function run(action) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionError(null);
    try {
      const result = action === 'cancel' ? await cancelBooking(tripId, { reason: reason.trim() }) : await leaveSharedRide(tripId);
      setData(result);
      setSheet(null);
      setReason('');
      setDone(action);
      refreshBell();
    } catch (error) {
      if (error.status === 401) return; // the login screen takes over
      setSheet(null);
      setActionError({ action, error });
      if (STALE_CODES.includes(error.code)) await load();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <FormScreen header={<AppHeader showBack title="Your ride" />}>
        {!loadError && (
          <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="Loading your ride" />
        )}
        {loadError && loadError.status !== 401 && (
          <View style={styles.gap}>
            <Alert tone="error" title={loadError.status === 404 ? 'Booking not found' : 'We couldn’t load your ride'}>
              {loadError.status === 404 ? 'This trip doesn’t exist or isn’t yours.' : loadError.message}
            </Alert>
            {loadError.status === 404 ? (
              <Button onPress={() => router.replace('/trips')}>Go to My Trips</Button>
            ) : (
              <Button variant="secondary" onPress={load} testID="manage-retry">
                Try again
              </Button>
            )}
          </View>
        )}
      </FormScreen>
    );
  }

  const { trip, ride, booking, pastBookings, status, timeline, actions } = data;
  const shownBooking = booking ?? null;
  const shared = shownBooking?.mode === 'shared';
  const live = shownBooking?.status === 'confirmed';
  // Who is in the shared ride now (live), or who was at booking (cancelled)
  const travellers = live ? (ride?.pool?.others ?? []) : (shownBooking?.travellers ?? []);
  const landing = trip.flight?.scheduledArrivalTime ?? trip.expectedArrivalTime;
  const networkFailure = actionError && (actionError.error.code === 'NETWORK_ERROR' || actionError.error.code === 'TIMEOUT');

  return (
    <FormScreen header={<AppHeader showBack title="Your ride" />} onRefresh={pullToRefresh} refreshing={refreshing}>
      <View style={styles.sections}>
        {done === 'cancel' && (
          <Alert tone="success" title="Booking cancelled" testID="manage-done">
            {`Booking ${shownBooking?.reference ?? ''} and its trip are cancelled. They stay in My Trips under Cancelled.`}
          </Alert>
        )}
        {done === 'leave' && (
          <View style={styles.gap}>
            <Alert tone="success" title="You left the shared ride" testID="manage-done">
              {`Booking ${pastBookings.at(-1)?.reference ?? ''} has ended. Your trip is still on - choose a new ride when you’re ready.`}
            </Alert>
            <Button onPress={() => router.push(stepHref(4, trip.id))} testID="choose-new-ride">
              Choose a new ride
            </Button>
          </View>
        )}
        {actionError && (
          <Alert tone="error" title={actionError.action === 'cancel' ? 'The booking wasn’t cancelled' : 'You haven’t left the shared ride'} testID="manage-error">
            {networkFailure
              ? `${actionError.error.message} Check My Trips or pull down to refresh before trying again.`
              : actionError.error.message}
          </Alert>
        )}

        <StatusCard status={status} />

        <SummaryCard title="Trip" testID="manage-trip">
          <SummaryRow label="From" value={pickupLabel(trip)} />
          <SummaryRow label="Destination" value={trip.destination} testID="manage-destination" />
          <SummaryRow label="Flight">
            {trip.flight?.flightNumber ? <FlightCode>{formatFlightNumber(trip.flight.flightNumber)}</FlightCode> : <AppText variant="label">Not added</AppText>}
          </SummaryRow>
          <SummaryRow label="Arrives" value={`${formatDate(trip.travelDate)} · ${formatTime(landing)}`} />
        </SummaryCard>

        {shownBooking ? (
          <SummaryCard title="Booking" testID="manage-booking">
            <SummaryRow label="Reference" value={shownBooking.reference} strong testID="manage-reference" />
            <SummaryRow label="Status" value={BOOKING_STATUS[shownBooking.status]} testID="manage-booking-status" />
            <SummaryRow label="Booked on" value={dateTime(shownBooking.confirmedAt)} />
            <SummaryRow label="Ride type" value={MODE_LABELS[shownBooking.mode]} testID="manage-mode" />
            <SummaryRow
              label="Vehicle"
              value={`${shownBooking.vehicle?.label ?? shownBooking.vehicleType}${shownBooking.vehicle ? ` · up to ${shownBooking.vehicle.seats} people` : ''}`}
              testID="manage-vehicle"
            />
            <SummaryRow label="Passengers" value={plural(shownBooking.partySize, 'person', 'people')} testID="manage-party" />
          </SummaryCard>
        ) : null}

        {shownBooking && shared ? (
          <SummaryCard title={live ? 'In your shared ride now' : 'In the shared ride when you booked'} testID="manage-travellers">
            <SummaryRow label="You" value={plural(shownBooking.partySize, 'person', 'people')} />
            {travellers.map((m, i) => (
              <Traveller key={i} member={m} testID="manage-traveller" />
            ))}
            {travellers.length === 0 ? <AppText variant="small">Nobody else is in this shared ride now.</AppText> : null}
            <AppText variant="caption">Other travellers are shown by drop-off area - FlyPool doesn’t share names here.</AppText>
          </SummaryCard>
        ) : null}

        {trip.status === 'cancelled' ? (
          <SummaryCard title="Cancellation" testID="manage-cancellation">
            <SummaryRow label="Cancelled on" value={trip.cancelledAt ? dateTime(trip.cancelledAt) : '—'} />
            {shownBooking?.cancelReason ? <SummaryRow label="Reason" value={shownBooking.cancelReason} testID="manage-reason" /> : null}
            <AppText variant="caption" style={styles.note}>
              FlyPool doesn’t take payments yet, so there are no cancellation fees or refunds.
            </AppText>
          </SummaryCard>
        ) : null}

        <SummaryCard title="History">
          <Timeline events={timeline} />
        </SummaryCard>

        {pastBookings.length ? (
          <SummaryCard title="Earlier bookings for this trip" testID="manage-past">
            {pastBookings.map((b) => (
              <SummaryRow key={b.reference} label={b.reference} value={`${MODE_LABELS[b.mode]} · ${BOOKING_STATUS[b.status]}`} />
            ))}
          </SummaryCard>
        ) : null}

        {/* Actions - shown as the server allows them */}
        <View style={styles.gap}>
          {booking || pastBookings.length ? (
            <Button
              variant={live ? 'primary' : 'secondary'}
              onPress={() => router.push({ pathname: '/trip/[tripId]/payment', params: { tripId: trip.id } })}
              testID="manage-payment"
            >
              {live ? 'Pay for this booking' : 'View payments'}
            </Button>
          ) : null}
          {live && shared && trip.poolId ? (
            <Button variant="secondary" onPress={() => router.push({ pathname: '/chat/[poolId]', params: { poolId: trip.poolId } })} testID="manage-chat">
              Open group chat
            </Button>
          ) : null}
          {!booking && trip.status !== 'cancelled' ? (
            <Button onPress={() => router.push(stepHref(4, trip.id))}>Choose a ride</Button>
          ) : null}
          {actions.leavePool.allowed ? (
            <Button variant="danger" onPress={() => setSheet('leave')} testID="leave-pool">
              Leave shared ride
            </Button>
          ) : null}
          {actions.cancel.allowed ? (
            <Button variant="danger" onPress={() => setSheet('cancel')} testID="cancel-booking">
              Cancel booking
            </Button>
          ) : live ? (
            <AppText variant="caption" style={styles.center} testID="cancel-unavailable">
              {actions.cancel.reason}
            </AppText>
          ) : null}
        </View>
      </View>

      <ConfirmSheet
        visible={sheet === 'cancel'}
        title="Cancel this booking?"
        message={`Booking ${booking?.reference ?? ''} and its trip will be cancelled${shared ? ', and you’ll leave the shared ride and its group chat' : ''}. They stay in your history. This can’t be undone - to travel, you’d plan a new trip.`}
        confirmLabel="Cancel booking"
        backLabel="Keep booking"
        busy={busy}
        onConfirm={() => run('cancel')}
        onClose={() => setSheet(null)}
        testID="cancel-sheet"
      >
        <TextField
          label="Reason (optional)"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. My plans changed"
          maxLength={200}
          testID="cancel-reason"
        />
      </ConfirmSheet>

      <ConfirmSheet
        visible={sheet === 'leave'}
        title="Leave the shared ride?"
        message={`You’ll leave this shared ride and booking ${booking?.reference ?? ''} will end. Your trip stays - you can then travel alone or join another shared ride. You’ll lose access to this ride’s group chat, and the others will be told.`}
        confirmLabel="Leave shared ride"
        backLabel="Stay in this ride"
        busy={busy}
        onConfirm={() => run('leave')}
        onClose={() => setSheet(null)}
        testID="leave-sheet"
      />
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  loading: { marginTop: spacing[10] },
  gap: { gap: spacing[3] },
  sections: { gap: spacing[4] },
  note: { marginTop: spacing[2] },
  status: { flexDirection: 'row', gap: spacing[3], padding: spacing[4], borderRadius: radius.xl, alignItems: 'flex-start' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginTop: 6 },
  event: { flexDirection: 'row', gap: spacing[3] },
  rail: { width: 14, alignItems: 'center' },
  eventDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.borderStrong, marginTop: 5 },
  eventDotLast: { backgroundColor: colors.primary },
  eventLine: { flex: 1, width: 2, backgroundColor: colors.border, marginTop: 2 },
  eventText: { flex: 1, paddingBottom: spacing[3] },
  label: { fontWeight: fontWeight.semibold },
}));
