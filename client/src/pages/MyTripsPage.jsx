// My Trips: the passenger's saved trips (GET /api/trips), split into
// in progress, upcoming, past and cancelled. Only real saved data is shown:
// the flight appears once verified, the fare once a ride is chosen, and
// "Booking confirmed" only when the server has a confirmed booking (a chosen
// ride is NOT a booking - utils/bookings.js tripState).
// This is also the logged-in "home" (the navbar logo links here).
import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import Button, { LinkButton } from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import FlightCode from '../components/ui/FlightCode';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import { ArrowRightIcon, PlusIcon, TicketIcon } from '../components/ui/icons';
import { cancelBooking, cancelTrip, listMyTrips } from '../api/trips.api';
import { formatDate, formatTime } from '../utils/dates';
import { formatFlightNumber, formatRupees } from '../utils/format';
import { rideTitle } from '../utils/rideOptions';
import { pickupLabel, plural } from '../utils/trips';
import { tripState } from '../utils/bookings';

// "₹150 est. / person" (shared) or "₹300 est. total" (solo)
function fareText(ride) {
  if (!ride) return null;
  if (ride.mode === 'solo') return ride.soloFare ? `${formatRupees(ride.soloFare.total)} est. total` : null;
  const fare = ride.pool?.fare;
  return fare ? `${formatRupees(fare.perPerson.max)} est. / person` : null;
}

function Fact({ label, children, muted }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`tabular mt-0.5 truncate text-sm ${muted ? 'text-slate-500 dark:text-slate-400' : 'font-medium text-slate-900 dark:text-slate-100'}`}
      >
        {children}
      </dd>
    </div>
  );
}

function TripCard({ trip, onCancel }) {
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const state = tripState(trip);
  const closeDialog = useCallback(() => {
    setConfirming(false);
    setCancelError('');
  }, []);

  async function handleCancel() {
    setCancelling(true);
    setCancelError('');
    try {
      await onCancel(trip, state.cancel);
    } catch (error) {
      setCancelError(error.message); // shown in the dialog; the list reloads with the server's state
      setCancelling(false);
    }
  }

  const next = state.next;
  const fare = fareText(trip.ride);
  const headingId = `trip-${trip.id}`;
  const bookingRef = trip.booking?.reference;

  return (
    <li
      aria-labelledby={headingId}
      className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {formatDate(trip.travelDate)} · lands {formatTime(trip.expectedArrivalTime)}
          </p>
          <h3 id={headingId} className="mt-0.5 text-lg font-semibold break-words text-slate-900 dark:text-white">
            To {trip.destination}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">From {pickupLabel(trip)}</p>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-4 sm:px-5 dark:border-slate-800">
        <Fact label="Flight" muted={!trip.flight}>
          {trip.flight ? <FlightCode>{formatFlightNumber(trip.flight.flightNumber)}</FlightCode> : 'Not verified yet'}
        </Fact>
        <Fact label="Travelling">
          {plural(trip.passengerCount, 'person', 'people')} · {plural(trip.luggageCount, 'bag', 'bags')}
        </Fact>
        <Fact label="Ride" muted={!trip.ride}>
          {trip.ride ? rideTitle(trip.ride) : 'Not chosen yet'}
        </Fact>
        <Fact label="Fare" muted={!fare}>
          {fare ?? '—'}
        </Fact>
        {trip.ride?.mode === 'shared' && trip.ride.pool && (
          <Fact label="Shared with">
            {trip.ride.pool.bookings === 1 ? 'Nobody yet' : plural(trip.ride.pool.bookings - 1, 'booking', 'bookings')} ·{' '}
            {trip.ride.pool.seatsTaken}/{trip.ride.pool.seats} seats
          </Fact>
        )}
        {bookingRef && (
          <Fact label="Booking">
            <span className="font-mono">{bookingRef}</span>
          </Fact>
        )}
      </dl>

      {(next || state.cancel) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
          {next && (
            <LinkButton to={`/trip/${trip.id}/${next.path}`} size="sm" variant={state.inProgress ? 'primary' : 'secondary'}>
              {next.label}
              <ArrowRightIcon className="h-4 w-4" />
            </LinkButton>
          )}
          {state.cancel && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth={false}
              onClick={() => setConfirming(true)}
              className="ml-auto text-rose-700! hover:bg-rose-50! dark:text-rose-400! dark:hover:bg-rose-950/40!"
            >
              {state.cancel === 'booking' ? 'Cancel booking' : 'Cancel trip'}
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={state.cancel === 'booking' ? `Cancel booking ${bookingRef}?` : 'Cancel this trip?'}
        confirmLabel={state.cancel === 'booking' ? 'Yes, cancel booking' : 'Yes, cancel trip'}
        cancelLabel={state.cancel === 'booking' ? 'Keep booking' : 'Keep trip'}
        busyLabel="Cancelling…"
        tone="danger"
        busy={cancelling}
        error={cancelError}
        onConfirm={handleCancel}
        onClose={closeDialog}
      >
        <p>
          {state.cancel === 'booking'
            ? 'This cancels your confirmed booking and the trip. It can’t be undone. To leave only a shared ride and keep the trip, open the booking instead.'
            : 'This can’t be undone.'}
        </p>
      </ConfirmDialog>
    </li>
  );
}

function TripSection({ title, description, trips, onCancel }) {
  if (trips.length === 0) return null;
  const id = `section-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section className="mt-8" aria-labelledby={id}>
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="text-base font-semibold text-slate-900 dark:text-white">
          {title}
        </h2>
        <span className="tabular text-sm text-slate-500 dark:text-slate-400">{trips.length}</span>
      </div>
      {description && <p className="text-sm text-slate-600 dark:text-slate-400">{description}</p>}
      <ul className="mt-3 space-y-3">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} onCancel={onCancel} />
        ))}
      </ul>
    </section>
  );
}

// In progress / upcoming: soonest first. Past / cancelled: most recent first
// (the API's order).
function groupTrips(trips, now = Date.now()) {
  const future = (t) => new Date(t.arrivalAt) >= now;
  const active = trips.filter((t) => t.status !== 'cancelled');
  return {
    all: trips,
    inProgress: active.filter((t) => future(t) && tripState(t, now).inProgress).reverse(),
    upcoming: active.filter((t) => future(t) && !tripState(t, now).inProgress).reverse(),
    past: active.filter((t) => !future(t)),
    cancelled: trips.filter((t) => t.status === 'cancelled'),
  };
}

export default function MyTripsPage() {
  const [trips, setTrips] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    () =>
      listMyTrips()
        .then((list) => {
          setError(null);
          setTrips(groupTrips(list));
        })
        .catch(setError),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  // A booked trip is cancelled through its booking (the server keeps the booking
  // record as cancelled); others with the trip cancellation. Errors are shown in
  // the card's dialog, and the list is reloaded either way.
  async function handleCancel(trip, kind) {
    try {
      if (kind === 'booking') await cancelBooking(trip.id);
      else await cancelTrip(trip.id);
    } finally {
      await load();
    }
  }

  const hasTrips = trips?.all.length > 0;

  return (
    <AppLayout title="My Trips">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title="My Trips"
          description="Pick up where you left off, or look back at past rides."
          actions={
            hasTrips && (
              <LinkButton to="/trip/new" size="sm">
                <PlusIcon className="h-4 w-4" />
                Plan a ride
              </LinkButton>
            )
          }
        />

        {!trips && !error && <LoadingState label="Loading your trips…" />}

        {error && (
          <div className="mt-6">
            <ErrorState error={error} title="We couldn’t load your trips" onRetry={load} />
          </div>
        )}

        {trips?.all.length === 0 && (
          <EmptyState
            className="mt-8"
            icon={TicketIcon}
            title="No trips yet"
            action={
              <LinkButton to="/trip/new">
                <PlusIcon className="h-5 w-5" />
                Plan your first ride
              </LinkButton>
            }
          >
            Tell us about your flight and destination. We&apos;ll find verified passengers heading your way.
          </EmptyState>
        )}

        {hasTrips && (
          <>
            <TripSection
              title="In progress"
              description="These trips still need a step from you."
              trips={trips.inProgress}
              onCancel={handleCancel}
            />
            <TripSection title="Upcoming" trips={trips.upcoming} onCancel={handleCancel} />
            <TripSection title="Past" trips={trips.past} onCancel={handleCancel} />
            <TripSection title="Cancelled" trips={trips.cancelled} onCancel={handleCancel} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
