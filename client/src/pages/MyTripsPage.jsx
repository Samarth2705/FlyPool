// My Trips: the passenger's saved trips (GET /api/trips), split into
// in progress, upcoming, past and cancelled. Only real saved data is shown:
// the flight appears once verified (Page 3) and the fare once a ride option
// is chosen (Page 4). Confirmed bookings don't exist yet.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import Spinner from '../components/ui/Spinner';
import { CalendarIcon, UsersIcon, TicketIcon } from '../components/ui/icons';
import { cancelTrip, listMyTrips } from '../api/trips.api';
import { MUMBAI_AIRPORT } from '../data/mumbaiLocations';
import { formatDate, formatTime } from '../utils/dates';
import { formatFlightNumber, formatRupees } from '../utils/format';
import { rideTitle } from '../utils/rideOptions';

const STATUS = {
  awaiting_verification: {
    label: 'Awaiting flight verification',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  },
  flight_verified: {
    label: 'Flight verified',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
  },
  ride_selected: {
    label: 'Ride requested',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
};

// Statuses where the passenger still has a step to do
const IN_PROGRESS = ['awaiting_verification', 'flight_verified'];

// Where an upcoming trip continues, by status
const NEXT_STEP = {
  awaiting_verification: { path: 'verify', label: 'Continue to flight verification →' },
  flight_verified: { path: 'matches', label: 'Find your ride →' },
  ride_selected: { path: 'summary', label: 'View summary →' },
};

// "₹150 est. / person" (shared) or "₹300 est. total" (solo)
function fareText(ride) {
  if (!ride) return '—';
  if (ride.mode === 'solo') return ride.soloFare ? `${formatRupees(ride.soloFare.total)} est. total` : '—';
  const fare = ride.pool?.fare;
  return fare ? `${formatRupees(fare.perPerson.max)} est. / person` : '—';
}

function pickupText(trip) {
  if (trip.pickupLocation !== MUMBAI_AIRPORT.name) return trip.pickupLocation;
  return trip.pickupTerminal ? `${MUMBAI_AIRPORT.shortName} · ${trip.pickupTerminal}` : MUMBAI_AIRPORT.shortName;
}

function TripCard({ trip, upcoming, onCancel }) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  async function handleCancel() {
    if (!window.confirm(`Cancel your trip to ${trip.destination}? This can't be undone.`)) return;
    setCancelling(true);
    setCancelError('');
    try {
      await onCancel(trip.id);
    } catch (error) {
      setCancelError(error.message);
      setCancelling(false);
    }
  }

  const status = STATUS[trip.status] ?? {
    label: trip.status,
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  };

  return (
    <li className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400 dark:text-slate-500">From {pickupText(trip)}</p>
          <p className="mt-0.5 truncate text-lg font-semibold text-slate-900 dark:text-white">To {trip.destination}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <CalendarIcon className="h-4 w-4" /> Date
          </dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{formatDate(trip.travelDate)}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Arrival</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{formatTime(trip.expectedArrivalTime)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
            <UsersIcon className="h-4 w-4" /> Passengers
          </dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{trip.passengerCount}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Bags</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{trip.luggageCount}</dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Flight</dt>
          {trip.flight ? (
            <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
              {formatFlightNumber(trip.flight.flightNumber)}
            </dd>
          ) : (
            <dd className="mt-0.5 text-slate-500 dark:text-slate-400">Not verified yet</dd>
          )}
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Ride</dt>
          <dd className={`mt-0.5 ${trip.ride ? 'font-medium text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
            {trip.ride ? rideTitle(trip.ride) : 'Not chosen yet'}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400 dark:text-slate-500">Fare</dt>
          <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{fareText(trip.ride)}</dd>
        </div>
        {trip.ride?.mode === 'shared' && trip.ride.pool && (
          <div>
            <dt className="text-slate-400 dark:text-slate-500">Shared with</dt>
            <dd className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">
              {trip.ride.pool.bookings === 1
                ? 'Nobody yet'
                : `${trip.ride.pool.bookings - 1} ${trip.ride.pool.bookings - 1 === 1 ? 'booking' : 'bookings'}`}{' '}
              ·{' '}
              {trip.ride.pool.seatsTaken}/{trip.ride.pool.seats} seats
            </dd>
          </div>
        )}
      </dl>

      {upcoming && trip.status !== 'cancelled' && (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
          {NEXT_STEP[trip.status] && (
            <Link
              to={`/trip/${trip.id}/${NEXT_STEP[trip.status].path}`}
              className="inline-flex items-center rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:ring-4 focus-visible:ring-sky-300 focus-visible:outline-none"
            >
              {NEXT_STEP[trip.status].label}
            </Link>
          )}
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="py-2 text-sm font-medium text-rose-600 hover:underline disabled:opacity-60 dark:text-rose-400"
          >
            {cancelling ? 'Cancelling…' : 'Cancel trip'}
          </button>
        </div>
      )}
      {cancelError && (
        <p role="alert" className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          {cancelError}
        </p>
      )}
    </li>
  );
}

function TripSection({ title, trips, upcoming, onCancel }) {
  if (trips.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
        {title} · {trips.length}
      </h2>
      <ul className="mt-3 space-y-4">
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} upcoming={upcoming} onCancel={onCancel} />
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
    inProgress: active.filter((t) => future(t) && IN_PROGRESS.includes(t.status)).reverse(),
    upcoming: active.filter((t) => future(t) && !IN_PROGRESS.includes(t.status)).reverse(),
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
        .then((list) => setTrips(groupTrips(list)))
        .catch(setError),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function handleCancel(tripId) {
    await cancelTrip(tripId); // throws on failure; the card shows the error
    await load();
  }

  return (
    <AppLayout title="My Trips">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">My Trips</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Your airport rides - in progress, upcoming and past.</p>

        {!trips && !error && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            Couldn&apos;t load your trips: {error.message}
          </p>
        )}

        {trips?.all.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
              <TicketIcon className="h-6 w-6" />
            </span>
            <p className="mt-4 font-semibold text-slate-900 dark:text-white">No trips yet</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Trips you plan are saved to your account and show up here.</p>
            <Link
              to="/trip/new"
              className="mt-5 inline-flex rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:ring-4 focus-visible:ring-sky-300 focus-visible:outline-none"
            >
              Plan Your First Ride
            </Link>
          </div>
        )}

        {trips?.all.length > 0 && (
          <>
            <TripSection title="In progress" trips={trips.inProgress} upcoming onCancel={handleCancel} />
            <TripSection title="Upcoming" trips={trips.upcoming} upcoming onCancel={handleCancel} />
            <TripSection title="Past" trips={trips.past} upcoming={false} />
            <TripSection title="Cancelled" trips={trips.cancelled} upcoming={false} />
          </>
        )}
      </div>
    </AppLayout>
  );
}
