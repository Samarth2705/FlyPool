// Payment for a booking: what the ride costs, how it is split, who has paid,
// and paying your own share.
//
//   GET  /trips/:tripId/payment            amount due, fare split, status
//   POST /trips/:tripId/payment            start (or continue) a payment -
//                                          the server works out the amount
//   POST /payments/:id/demo-result         DEMO MODE: the simulated result
//
// DEMO MODE: no payment provider is connected. The checkout is a labelled
// simulation - no money moves, no card/UPI/bank details are asked for. The
// SERVER decides every status; the screen only shows what it says, and
// reloads it whenever it comes into view (so it survives restarts, logout
// and lost connections).
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import AppHeader from '../../../../src/components/AppHeader';
import AppText from '../../../../src/components/AppText';
import Alert from '../../../../src/components/Alert';
import Button from '../../../../src/components/Button';
import DemoCheckoutSheet from '../../../../src/components/DemoCheckoutSheet';
import FlightCode from '../../../../src/components/FlightCode';
import FormScreen from '../../../../src/components/FormScreen';
import PaymentStatusBadge from '../../../../src/components/PaymentStatusBadge';
import SummaryCard, { SummaryRow } from '../../../../src/components/SummaryCard';
import { getPaymentView, startPayment } from '../../../../src/api/trips.api';
import { completeDemoPayment } from '../../../../src/api/payments.api';
import { formatDate, formatTime } from '../../../../src/shared/dates';
import { formatFlightNumber, formatRupees } from '../../../../src/shared/format';
import { RIDE_LABELS, VEHICLE_LABELS } from '../../../../src/shared/payments';
import { plural } from '../../../../src/shared/trips';
import { makeStyles, radius, spacing, useTheme } from '../../../../src/theme';

const when = (iso) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(
    new Date(iso),
  );

// What happened, from the server's final status
const RESULT = {
  paid: { tone: 'success', title: 'Payment successful (demo)', text: 'Simulated payment recorded. No real money was transferred.' },
  failed: { tone: 'error', title: 'Payment failed (demo)', text: 'Nothing was charged. You can try again.' },
  cancelled: { tone: 'info', title: 'Payment cancelled', text: 'Nothing was charged. You can pay later.' },
};

export default function PaymentScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { tripId } = useLocalSearchParams();
  const [view, setView] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkout, setCheckout] = useState(null); // the open payment while the demo checkout shows
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const inFlight = useRef(false);

  const load = useCallback(
    () =>
      getPaymentView(tripId).then(
        (v) => {
          setLoadError(null);
          setView(v);
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

  async function pullToRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // Start (or continue) a payment - the server returns the open one if any
  async function pay() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { payment } = await startPayment(tripId);
      setCheckout(payment);
    } catch (failure) {
      if (failure.status !== 401) {
        setError(failure);
        load();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function finish(outcome) {
    if (inFlight.current || !checkout) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { payment } = await completeDemoPayment(checkout.id, outcome);
      setCheckout(null);
      setResult(payment.status);
    } catch (failure) {
      setCheckout(null);
      if (failure.status !== 401) setError(failure);
    } finally {
      await load(); // always show the server's status
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <FormScreen header={<AppHeader showBack title="Payment" />}>
        {!loadError && <ActivityIndicator style={styles.loading} color={colors.primary} accessibilityLabel="Loading payment" />}
        {loadError && loadError.status !== 401 && (
          <View style={styles.gap}>
            <Alert tone="error" title={loadError.status === 404 ? 'Payment not found' : 'We couldn’t load the payment'}>
              {loadError.status === 404 ? 'This trip doesn’t exist or isn’t yours.' : loadError.message}
            </Alert>
            {loadError.status !== 404 && (
              <Button variant="secondary" onPress={load} testID="payment-retry">
                Try again
              </Button>
            )}
          </View>
        )}
      </FormScreen>
    );
  }

  const { trip, booking, fare, payment, pool } = view;
  const status = payment?.status ?? 'none';
  const shown = booking ?? null;
  const networkFailure = error && (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT');
  const paidForEndedBooking = payment?.status === 'paid' && (trip.status === 'cancelled' || !booking || booking.reference !== payment.bookingReference);

  return (
    <FormScreen header={<AppHeader showBack title="Payment" />} onRefresh={pullToRefresh} refreshing={refreshing}>
      <View style={styles.sections}>
        {view.demo && (
          <Alert tone="warning" title="Demo payment mode" testID="demo-banner">
            Payments here are simulated for testing. No real money is charged or transferred.
          </Alert>
        )}
        {view.mode === 'off' && (
          <Alert tone="info" title="Payments aren’t available yet">
            Your fare is shown below, but payments can’t be made in the app yet.
          </Alert>
        )}
        {result && RESULT[result] && (
          <Alert tone={RESULT[result].tone} title={RESULT[result].title} testID="payment-result">
            {RESULT[result].text}
          </Alert>
        )}
        {error && (
          <Alert tone="error" title={networkFailure ? 'We couldn’t reach FlyPool' : 'Payment not completed'} testID="payment-error">
            {networkFailure
              ? `${error.message} Pull down to see the latest status before trying again - you won’t be charged twice.`
              : error.message}
          </Alert>
        )}

        {/* Your share and its status */}
        <View style={styles.hero} testID="payment-hero">
          <AppText variant="overline">Your contribution</AppText>
          <AppText variant="display" testID="payment-amount">
            {view.amount != null ? formatRupees(view.amount) : payment ? formatRupees(payment.amount) : '—'}
          </AppText>
          <PaymentStatusBadge status={status} testID="payment-status" />
          {payment?.paidAt ? (
            <AppText variant="caption">
              Paid {when(payment.paidAt)}
              {payment.mode === 'demo' ? ' · demo payment, no money transferred' : ''}
            </AppText>
          ) : null}
          {payment?.needsRefund || paidForEndedBooking ? (
            <AppText variant="small" style={styles.warning} testID="refund-note">
              This booking ended after it was paid. Refunds aren’t processed in the app yet, so no refund has been made.
            </AppText>
          ) : null}
        </View>

        {view.blocker && (
          <Alert tone="info" title="You can’t pay yet" testID="payment-blocker">
            {view.blocker.message}
          </Alert>
        )}

        {view.canPay && (
          <Button onPress={pay} loading={busy && !checkout} testID="pay">
            {status === 'pending' || status === 'processing' ? 'Continue payment' : `Pay ${formatRupees(view.amount)}${view.demo ? ' (demo)' : ''}`}
          </Button>
        )}

        <SummaryCard title="Booking" testID="payment-booking">
          <SummaryRow label="Reference" value={shown?.reference ?? payment?.bookingReference ?? '—'} strong testID="payment-reference" />
          <SummaryRow label="Flight">
            {trip.flight?.flightNumber ? <FlightCode>{formatFlightNumber(trip.flight.flightNumber)}</FlightCode> : <AppText variant="label">—</AppText>}
          </SummaryRow>
          <SummaryRow label="Arrives" value={`${formatDate(trip.travelDate)} · ${formatTime(trip.flight?.scheduledArrivalTime ?? trip.expectedArrivalTime)}`} />
          <SummaryRow label="Ride type" value={RIDE_LABELS[shown?.mode ?? payment?.rideMode] ?? '—'} testID="payment-mode" />
          <SummaryRow label="Vehicle" value={VEHICLE_LABELS[shown?.vehicleType ?? payment?.vehicleType] ?? '—'} testID="payment-vehicle" />
        </SummaryCard>

        {fare && (
          <SummaryCard title="Fare" testID="payment-fare">
            <SummaryRow label="Total ride fare" value={formatRupees(fare.total)} strong testID="payment-total" />
            <SummaryRow label="Passengers sharing" value={plural(fare.people, 'person', 'people')} testID="payment-people" />
            {fare.people > 1 ? (
              <SummaryRow
                label="Per person"
                value={fare.perPerson.min === fare.perPerson.max ? formatRupees(fare.perPerson.min) : `${formatRupees(fare.perPerson.min)}–${formatRupees(fare.perPerson.max)}`}
              />
            ) : null}
            <SummaryRow
              label={fare.partySize > 1 ? `Your contribution (${fare.partySize} people)` : 'Your contribution'}
              value={formatRupees(fare.share)}
              strong
              testID="payment-share"
            />
            <AppText variant="caption" style={styles.note}>
              Estimated from FlyPool’s pricing rules and worked out by FlyPool’s server.
              {fare.people > 1 ? ' The fare is split equally per person.' : ''}
            </AppText>
          </SummaryCard>
        )}

        {pool && (
          <SummaryCard title="Who has paid" testID="payment-pool">
            {[...pool.members].sort((a, b) => Number(b.isYou) - Number(a.isYou)).map((m) => (
              <SummaryRow
                key={m.label}
                label={m.isYou ? 'You' : `${m.label}${m.area ? ` · ${m.area}` : ''}`}
                value={`${m.share != null ? formatRupees(m.share) : '—'} · ${m.paid ? 'Paid' : m.booked ? 'Not paid' : 'Not booked yet'}`}
                testID="payment-member"
              />
            ))}
            {pool.total != null ? (
              <>
                <SummaryRow label="Collected" value={formatRupees(pool.collected)} testID="payment-collected" />
                <SummaryRow label="Still to pay" value={formatRupees(pool.outstanding)} testID="payment-outstanding" />
              </>
            ) : null}
            {pool.overCollected > 0 ? (
              <AppText variant="caption" style={styles.note}>
                {formatRupees(pool.overCollected)} more than the current fare was paid, because the shared ride changed after
                payment. Adjustments and refunds aren’t supported yet.
              </AppText>
            ) : null}
            <AppText variant="caption" style={styles.note}>
              Only whether each booking has paid is shown - never names or payment details.
            </AppText>
          </SummaryCard>
        )}

        {view.history.length > 0 && (
          <SummaryCard title="Payment attempts" testID="payment-history">
            {view.history.map((p) => (
              <SummaryRow key={p.id} label={`${when(p.createdAt)}${p.mode === 'demo' ? ' · demo' : ''}`}>
                <View style={styles.attempt}>
                  <AppText variant="label">{formatRupees(p.amount)}</AppText>
                  <PaymentStatusBadge status={p.status} />
                </View>
              </SummaryRow>
            ))}
          </SummaryCard>
        )}

        <Button variant="secondary" onPress={() => router.push('/payments')}>
          All payments
        </Button>
      </View>

      <DemoCheckoutSheet visible={Boolean(checkout)} amount={checkout?.amount ?? 0} busy={busy} onResult={finish} onClose={() => finish('cancelled')} />
    </FormScreen>
  );
}

const useStyles = makeStyles((colors) => ({
  loading: { marginTop: spacing[10] },
  gap: { gap: spacing[3] },
  sections: { gap: spacing[4] },
  hero: {
    alignItems: 'center',
    gap: spacing[2],
    padding: spacing[5],
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  warning: { color: colors.warning, textAlign: 'center' },
  note: { marginTop: spacing[2] },
  attempt: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
}));
