// Booking step 4: review the chosen ride, CONFIRM THE BOOKING, then manage it.
//
// Everything shown comes from the server:
//   GET  /api/trips/:tripId/booking             trip, ride, booking, status, timeline, allowed actions
//   POST /api/trips/:tripId/booking             "Confirm booking" (the ONLY place a booking is made)
//   POST /api/trips/:tripId/booking/cancel      cancel the booking - and its trip
//   POST /api/trips/:tripId/booking/leave-pool  leave the shared ride - the trip goes on
//   GET  /api/trips/:tripId/payment             payment status (read-only here)
//   GET  /api/trips/:tripId/live                seats and changes, every few seconds (useLiveRide)
//
// Duplicate bookings can't happen: the button is locked while a request runs,
// AND the server returns the existing booking when asked again (200, created:
// false) and writes a booking with one conditional update. If the response
// is lost (timeout, network), the page asks the server whether the booking
// was saved instead of sending another request.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import Button, { LinkButton } from '../components/ui/Button';
import Card from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/ui/PageHeader';
import DetailList from '../components/ui/DetailList';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import TripRecoveryLinks from '../components/ui/TripRecoveryLinks';
import TripSnapshot from '../components/trip/TripSnapshot';
import LiveActivity from '../components/live/LiveActivity';
import SeatAvailability from '../components/live/SeatAvailability';
import TravellerProfile from '../components/matches/TravellerProfile';
import { CheckCircleIcon, TicketIcon, WalletIcon } from '../components/ui/icons';
import { buttonClasses } from '../components/ui/buttonStyles';
import PaymentCard from '../components/payment/PaymentCard';
import ChatButton from '../components/chat/ChatButton';
import { cancelBooking, confirmBooking, getBooking, getPayment, leaveSharedRide } from '../api/trips.api';
import { useLiveRide } from '../live/useLiveRide';
import { formatRupees, formatFlightNumber } from '../utils/format';
import { formatDate, formatTime } from '../utils/dates';
import { RIDE_MODE_LABELS } from '../utils/rideOptions';
import { isDemoVerification, pickupLabel, plural } from '../utils/trips';
import { paymentText, reviewedRide } from '../utils/bookings';
import { airportByCode } from '../data/mumbaiLocations';

const perPersonText = ({ min, max }) => (min === max ? formatRupees(min) : `${formatRupees(min)}–${formatRupees(max)}`);
const formatMoment = (iso) =>
  iso
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
    : null;

// The ride changed between review and confirm: show the new summary, ask again
const REVIEW_AGAIN_CODES = ['BOOKING_REVIEW_CHANGED', 'BOOKING_CONFLICT', 'POOL_UNAVAILABLE', 'POOL_NO_TRAVELLERS', 'RIDE_NOT_SELECTED'];
// No answer from the server: the booking may or may not have been saved
const outcomeUnknown = (error) => !error.status || error.status >= 500 || error.code === 'NETWORK_ERROR';

function fareRows(ride) {
  if (ride.mode === 'solo') return ride.soloFare ? [['Whole cab', formatRupees(ride.soloFare.total), { emphasis: true }]] : [];
  const fare = ride.pool?.fare;
  if (!fare) return [];
  return [
    ['Estimated taxi fare', formatRupees(fare.total)],
    ['Cost per person', perPersonText(fare.perPerson)],
    ['Your share', formatRupees(fare.yourShare), { emphasis: true }],
  ];
}

// The fare saved with the booking (the estimate when it was confirmed)
function bookedFareRows(booking) {
  const fare = booking.fare;
  if (!fare) return [];
  if (booking.mode === 'solo') return [['Whole cab', formatRupees(fare.total), { emphasis: true }]];
  return [
    ['Estimated taxi fare', formatRupees(fare.total)],
    ['Cost per person', fare.perPerson ? perPersonText(fare.perPerson) : null],
    ['Your share', fare.yourShare != null ? formatRupees(fare.yourShare) : null, { emphasis: true }],
  ];
}

function arrivalText(trip) {
  const code = trip.flight?.arrivalAirport;
  if (!code) return null;
  const name = airportByCode(code)?.shortName ?? code;
  return trip.flight.arrivalTerminal ? `${name} · ${trip.flight.arrivalTerminal}` : name;
}

function bookingRows(trip, booking, statusLabel, payment) {
  return [
    ['Booking reference', <span key="reference" className="font-mono tracking-wide">{booking.reference}</span>],
    ['Status', statusLabel],
    ['Confirmed on', formatMoment(booking.confirmedAt)],
    ['Cancelled on', formatMoment(booking.cancelledAt)],
    ['Flight', trip.flight ? `${trip.flight.airline ?? ''} ${formatFlightNumber(trip.flight.flightNumber)}`.trim() : null],
    ['Arriving at', arrivalText(trip)],
    ['Pickup', pickupLabel(trip)],
    ['Destination', trip.destination],
    ['Date', formatDate(trip.travelDate)],
    ['Lands', formatTime(trip.expectedArrivalTime)],
    ['Ride', `${RIDE_MODE_LABELS[booking.mode]} · ${booking.vehicle?.label ?? booking.vehicleType}`],
    ['Passengers', plural(booking.partySize, 'person', 'people')],
    ['Payment', paymentText(payment)],
  ];
}

// Others in the shared ride: short name, age, gender (only if they show it) and ride facts
function CoTravellers({ pool }) {
  if (!pool) return null;
  if (pool.others.length === 0) {
    return <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Nobody else has joined yet.</p>;
  }
  return (
    <ul className="mt-2 space-y-2" data-testid="co-travellers">
      {pool.others.map((m, i) => (
        <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
          <span className="flex flex-wrap items-center gap-2">
            <TravellerProfile profile={m.profile} fallback={`Passenger ${i + 1}`} />
            <span className="text-slate-700 dark:text-slate-300">{m.area ?? 'Same destination'}</span>
          </span>
          <span className="tabular text-slate-600 dark:text-slate-400">
            {plural(m.partySize, 'person', 'people')}
            {m.flightNumber ? ` · ${formatFlightNumber(m.flightNumber)}` : ''}
            {m.isDemo ? ' · sample' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function BookingSummaryPage() {
  const { tripId } = useParams();
  const location = useLocation();
  const justRequested = Boolean(location.state?.justRequested);
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [payment, setPayment] = useState(null);
  const [flash, setFlash] = useState(null); // { tone, title, text }
  const [confirmError, setConfirmError] = useState(null); // { title, message }
  const [confirming, setConfirming] = useState(false);
  const confirmLock = useRef(false); // a second click in the same instant is ignored
  const [dialog, setDialog] = useState(null); // 'cancel' | 'leave' | null
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [reason, setReason] = useState('');
  const flashRef = useRef(null);

  // silent: a refresh (live change, after an action) - a failure keeps the page as it is
  const load = useCallback(
    (silent = false) =>
      getBooking(tripId)
        .then((result) => {
          setError(null);
          setView(result);
          return result;
        })
        .catch((err) => {
          if (!silent) setError(err);
          return null;
        }),
    [tripId],
  );

  useEffect(() => {
    load();
  }, [load]);

  const trip = view?.trip;
  const ride = view?.ride;
  const booking = view?.booking;
  const booked = booking?.status === 'confirmed';
  const cancelled = trip?.status === 'cancelled';
  const lastLeft = !booking ? (view?.pastBookings ?? []).at(-1) : null;

  // Payment for a booking (current or cancelled): loaded when its status
  // changes, after a payment, and when the shared ride changes (the share is
  // re-worked out by the server). Only shown while there is a booking.
  const bookingKey = booking ? `${booking.reference}:${booking.status}` : null;
  const paymentRequest = useRef(0);
  const loadPayment = useCallback(() => {
    const request = ++paymentRequest.current; // an older answer never replaces a newer one
    return getPayment(tripId)
      .then((result) => request === paymentRequest.current && setPayment(result))
      .catch(() => request === paymentRequest.current && setPayment(null));
  }, [tripId]);
  useEffect(() => {
    if (!bookingKey) return undefined;
    loadPayment();
    return () => {
      paymentRequest.current += 1;
    };
  }, [bookingKey, loadPayment]);

  // Live seats while the trip is active and has a ride
  const liveOn = Boolean(ride) && !cancelled && ['flight_verified', 'ride_selected'].includes(trip?.status);
  const live = useLiveRide(tripId, {
    enabled: liveOn,
    onChange: () => {
      load(true);
      if (bookingKey) loadPayment();
    },
  });

  useEffect(() => {
    if (flash) flashRef.current?.focus();
  }, [flash]);

  // Opened from "Pay your share" (My Trips): bring the payment section into view once
  const scrolledToPayment = useRef(false);
  useEffect(() => {
    if (location.hash !== '#payment' || !payment || scrolledToPayment.current) return;
    scrolledToPayment.current = true;
    document.getElementById('payment')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [location.hash, payment]);

  async function handleConfirm() {
    if (confirmLock.current || !ride || booked) return;
    confirmLock.current = true;
    setConfirming(true);
    setConfirmError(null);
    setFlash(null);
    try {
      const result = await confirmBooking(tripId, reviewedRide(ride));
      await load(true);
      setFlash(
        result.created
          ? { tone: 'success', title: 'Booking confirmed', text: `Your booking reference is ${result.booking.reference}.` }
          : { tone: 'success', title: 'Already booked', text: `This ride was already booked (${result.booking.reference}). No second booking was made.` },
      );
    } catch (err) {
      if (outcomeUnknown(err)) {
        // The response may be lost after the server saved it: ask, don't send again
        const fresh = await load(true);
        if (fresh?.booking?.status === 'confirmed') {
          setFlash({
            tone: 'success',
            title: 'Booking confirmed',
            text: `The connection dropped, but your booking ${fresh.booking.reference} was saved. No second booking was made.`,
          });
        } else {
          setConfirmError({
            title: fresh ? 'Your booking wasn’t confirmed' : 'We couldn’t reach FlyPool',
            message: fresh
              ? 'The connection failed before your booking was saved. You can try again - you can never be booked twice.'
              : 'We couldn’t check whether your booking was saved. Check your connection, then try again - a repeat can’t create a second booking.',
          });
        }
      } else if (REVIEW_AGAIN_CODES.includes(err.code)) {
        await load(true);
        setConfirmError({ title: 'Please review your ride again', message: err.message });
      } else {
        setConfirmError({ title: 'Your booking wasn’t confirmed', message: err.message });
      }
    } finally {
      confirmLock.current = false;
      setConfirming(false);
    }
  }

  async function runAction() {
    const kind = dialog;
    const reference = booking?.reference;
    setActionBusy(true);
    setActionError('');
    try {
      const next = kind === 'cancel' ? await cancelBooking(tripId, reason.trim() || undefined) : await leaveSharedRide(tripId);
      setView(next);
      setDialog(null);
      setReason('');
      setFlash(
        kind === 'cancel'
          ? { tone: 'neutral', title: `Booking ${reference} cancelled`, text: 'Your trip is cancelled too. Your seats are free for other passengers.' }
          : {
              tone: 'success',
              title: 'You left the shared ride',
              text: `Booking ${reference} has ended and your seats are free again. Your trip is still active - choose a new ride when you’re ready.`,
            },
      );
    } catch (err) {
      setActionError(err.message);
      load(true); // show what the server has now (e.g. already cancelled)
    } finally {
      setActionBusy(false);
    }
  }

  const closeDialog = useCallback(() => {
    setDialog(null);
    setActionError('');
  }, []);

  const pool = ride?.mode === 'shared' ? ride.pool : null;
  // The group chat belongs to the shared ride of a CONFIRMED booking
  const sharedPoolId = booked && booking.mode === 'shared' ? (booking.poolId ?? pool?.id ?? null) : null;
  const waitingForOthers = !booked && pool && pool.status === 'open' && pool.others.length === 0;
  const canConfirm = Boolean(ride) && !booked && !cancelled && trip?.status === 'ride_selected' && !waitingForOthers && pool?.status !== 'cancelled';
  const actions = view?.actions;

  return (
    <AppLayout title={booked ? 'Your booking' : 'Review and book'} step={4} trip={trip ? { id: trip.id, status: trip.status } : { id: tripId }}>
      <PageHeader
        title={booked ? 'Your booking' : cancelled ? 'Booking summary' : 'Review and book'}
        description={booked ? 'Your confirmed booking, live seats and what you can change.' : 'Check your ride and fare, then confirm your booking.'}
      />

      {!view && !error && <LoadingState label="Loading your booking…" />}
      {error && (
        <div className="mt-6 sm:mt-8">
          <ErrorState error={error} title="We couldn’t load this booking" onRetry={() => load()} />
        </div>
      )}

      {trip && (
        <div className="mt-6 grid items-start gap-6 sm:mt-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
          <div className="space-y-6">
            {flash && (
              <Alert ref={flashRef} tone={flash.tone} title={flash.title}>
                {flash.text}
              </Alert>
            )}

            {booked && (
              <div className="flex items-start gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900/70 dark:bg-emerald-950/30" data-testid="booking-confirmed">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <CheckCircleIcon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-emerald-950 dark:text-emerald-100">{view.status.label}</p>
                  <p className="mt-0.5 text-sm text-emerald-900/85 dark:text-emerald-200/85">
                    Reference <span className="font-mono font-semibold tracking-wide">{booking.reference}</span>. FlyPool has saved your
                    booking. This pilot doesn’t assign drivers yet.
                  </p>
                  {(sharedPoolId || payment?.canPay) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sharedPoolId && <ChatButton tripId={tripId} poolId={sharedPoolId} size="sm" />}
                      {payment?.canPay && (
                        <a href="#payment" className={buttonClasses({ variant: 'primary', size: 'sm', fullWidth: false })}>
                          <WalletIcon className="h-4 w-4" />
                          {payment.payment?.status === 'pending' ? 'Continue payment' : 'Pay your share'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {!booked && ride && !cancelled && justRequested && !flash && (
              <Alert tone="info" title="Ride chosen - not booked yet">
                Review the details below, then press Confirm booking.
              </Alert>
            )}

            {cancelled && (
              <Card>
                <Alert tone="neutral" title={booking ? `Booking ${booking.reference} was cancelled` : 'This trip was cancelled'}>
                  {booking ? 'This booking and its trip are cancelled. ' : 'There is nothing to book for it any more. '}
                  {booking && paymentText(payment) ? `Payment: ${paymentText(payment)}.` : ''}
                </Alert>
                <TripRecoveryLinks />
              </Card>
            )}

            {lastLeft && !cancelled && !ride && (
              <Alert tone="info" title="You left your shared ride">
                Booking {lastLeft.reference} ended. Your trip is still active.
              </Alert>
            )}

            <TripSnapshot
              trip={trip}
              badge={
                trip.verification?.status === 'verified' ? (
                  <Badge tone="success" icon={CheckCircleIcon}>
                    Verified{isDemoVerification(trip) ? ' (demo)' : ''}
                  </Badge>
                ) : (
                  <Badge tone="warning">Not verified</Badge>
                )
              }
            />

            {booking && (
              <Card as="section" aria-labelledby="booking-heading">
                <h2 id="booking-heading" className="font-semibold text-slate-900 dark:text-white">
                  Booking details
                </h2>
                <DetailList className="mt-2" rows={bookingRows(trip, booking, view.status.label, payment)} />
              </Card>
            )}

            {ride && !cancelled && (
              <Card as="section" aria-labelledby="ride-heading">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="ride-heading" className="font-semibold text-slate-900 dark:text-white">
                    {ride.mode === 'shared' ? 'Your shared ride' : 'Your ride'}
                  </h2>
                  <Badge tone="brand">{`${RIDE_MODE_LABELS[ride.mode]} · ${ride.vehicle.label}`}</Badge>
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {ride.vehicle.label} · up to {ride.vehicle.seats} people, {ride.vehicle.bags} bags · your group:{' '}
                  {plural(trip.passengerCount, 'person', 'people')}, {plural(trip.luggageCount, 'bag', 'bags')}
                </p>
                {pool && (
                  <>
                    <SeatAvailability pool={pool} vehicleLabel={ride.vehicle.label} className="mt-4" />
                    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Other passengers in this ride</p>
                      <CoTravellers pool={pool} />
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Contact details stay private. Gender is shown only for passengers who chose to show it.
                      </p>
                    </div>
                  </>
                )}
              </Card>
            )}

            {liveOn && (!booked || pool) && <LiveActivity live={live} />}

            {!ride && !cancelled && (
              <Card>
                <Alert tone="neutral" title="No ride chosen yet">
                  {trip.verification?.status === 'verified'
                    ? 'Choose a shared or solo ride to review and book it.'
                    : 'Verify your flight first, then choose a ride.'}
                </Alert>
                <div className="mt-4">
                  {trip.verification?.status === 'verified' ? (
                    <LinkButton to={`/trip/${tripId}/matches`}>Choose a ride</LinkButton>
                  ) : (
                    <LinkButton to={`/trip/${tripId}/verify`}>Verify your flight</LinkButton>
                  )}
                </div>
              </Card>
            )}
          </div>

          <aside className="space-y-6 lg:sticky lg:top-40" aria-label="Fare and actions">
            {ride && !booked && !cancelled && (
              <Card as="section" aria-labelledby="fare-heading">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="fare-heading" className="font-semibold text-slate-900 dark:text-white">
                    Fare estimate
                  </h2>
                  <Badge tone="warning">Provisional</Badge>
                </div>
                {fareRows(ride).length > 0 ? (
                  <DetailList className="mt-2" rows={fareRows(ride)} />
                ) : (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">An estimate isn&apos;t available for this route.</p>
                )}
                {ride.mode === 'shared' && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Your share changes as passengers join or leave.</p>
                )}

                {waitingForOthers && (
                  <Alert tone="info" className="mt-4" title="Waiting for another passenger">
                    A shared ride can be booked once someone else has joined it. This page updates by itself when they do - or
                    choose to travel alone.
                  </Alert>
                )}
                {confirmError && (
                  <Alert tone="error" className="mt-4" title={confirmError.title}>
                    {confirmError.message}
                  </Alert>
                )}
                <div className="mt-4">
                  <Button onClick={handleConfirm} loading={confirming} loadingText="Confirming your booking…" disabled={!canConfirm}>
                    Confirm booking
                  </Button>
                </div>
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                  Nothing is booked until you press Confirm booking. No payment is taken here.
                </p>
              </Card>
            )}

            {booking && (
              <PaymentCard
                tripId={tripId}
                view={payment}
                trip={trip}
                booking={booking}
                onChanged={loadPayment}
              />
            )}

            {booking && (
              <Card as="section" aria-labelledby="booked-fare-heading">
                <h2 id="booked-fare-heading" className="font-semibold text-slate-900 dark:text-white">
                  Fare when you booked
                </h2>
                {bookedFareRows(booking).length > 0 ? (
                  <DetailList className="mt-2" rows={bookedFareRows(booking)} />
                ) : (
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">No fare estimate was available for this route.</p>
                )}
                {booked && pool?.fare && booking.fare?.yourShare != null && pool.fare.yourShare !== booking.fare.yourShare && (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    Your share now: <span className="font-semibold">{formatRupees(pool.fare.yourShare)}</span> (the ride changed since you
                    booked).
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Estimates, not live taxi quotes.</p>
              </Card>
            )}

            {booked && actions && (
              <Card as="section" aria-labelledby="manage-heading">
                <h2 id="manage-heading" className="font-semibold text-slate-900 dark:text-white">
                  Manage booking
                </h2>
                <div className="mt-3 space-y-3">
                  {booking.mode === 'shared' && (
                    <div>
                      <Button variant="secondary" onClick={() => setDialog('leave')} disabled={!actions.leavePool.allowed}>
                        Leave shared ride
                      </Button>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                        {actions.leavePool.allowed
                          ? 'Ends this booking but keeps your trip, so you can choose another ride.'
                          : actions.leavePool.reason}
                      </p>
                    </div>
                  )}
                  <div>
                    <Button variant="danger" onClick={() => setDialog('cancel')} disabled={!actions.cancel.allowed}>
                      Cancel booking
                    </Button>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      {actions.cancel.allowed ? 'Cancels this booking and the whole trip.' : actions.cancel.reason}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {view?.timeline?.length > 0 && (
              <Card as="section" aria-labelledby="timeline-heading">
                <h2 id="timeline-heading" className="font-semibold text-slate-900 dark:text-white">
                  History
                </h2>
                <ol className="mt-2 space-y-1.5 text-sm">
                  {view.timeline.map((event, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="text-slate-800 dark:text-slate-200">{event.label}</span>
                      <span className="tabular shrink-0 text-slate-500 dark:text-slate-400">{formatMoment(event.at)}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}

            <div className="flex flex-col gap-3">
              <LinkButton to="/trips" fullWidth variant={booked ? 'primary' : 'secondary'}>
                <TicketIcon className="h-5 w-5" />
                Go to My Trips
              </LinkButton>
              {!booked && !cancelled && trip.verification?.status === 'verified' && ride && (
                <LinkButton to={`/trip/${tripId}/matches`} variant="secondary" fullWidth>
                  Change ride
                </LinkButton>
              )}
              {lastLeft && !ride && !cancelled && (
                <LinkButton to={`/trip/${tripId}/matches`} fullWidth>
                  Choose a new ride
                </LinkButton>
              )}
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={dialog === 'cancel'}
        title={`Cancel booking ${booking?.reference ?? ''}?`}
        confirmLabel="Yes, cancel booking"
        busyLabel="Cancelling…"
        cancelLabel="Keep booking"
        tone="danger"
        busy={actionBusy}
        error={actionError}
        onConfirm={runAction}
        onClose={closeDialog}
      >
        <p>This cancels your booking and your whole trip. It can&apos;t be undone.</p>
        {booking?.mode === 'shared' && <p>If you only want to leave this shared ride and keep your trip, choose Leave shared ride instead.</p>}
        <label className="block">
          <span className="text-sm font-medium text-slate-900 dark:text-white">Reason (optional)</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={200}
            rows={2}
            className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'leave'}
        title="Leave this shared ride?"
        confirmLabel="Yes, leave shared ride"
        busyLabel="Leaving…"
        cancelLabel="Stay in ride"
        busy={actionBusy}
        error={actionError}
        onConfirm={runAction}
        onClose={closeDialog}
      >
        <p>
          Booking {booking?.reference} ends and your seats are freed for others. Your trip is <strong>not</strong> cancelled: you can
          choose another shared ride or travel alone.
        </p>
      </ConfirmDialog>
    </AppLayout>
  );
}
