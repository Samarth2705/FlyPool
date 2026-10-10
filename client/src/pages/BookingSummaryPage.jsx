// Page 5: Booking Summary.
// Loads the saved trip and ride from the server (GET /api/trips/:tripId/ride)
// and shows what was chosen on Pages 2-4: trip, flight verification, Shared
// Ride or Travel Alone, vehicle, co-travellers (shared only) and the fare.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import TravelBackdrop from '../components/layout/TravelBackdrop';
import Spinner from '../components/ui/Spinner';
import TripRecoveryLinks from '../components/ui/TripRecoveryLinks';
import { getRide } from '../api/trips.api';
import { MUMBAI_AIRPORT } from '../data/mumbaiLocations';
import { formatDate, formatTime } from '../utils/dates';
import { formatFlightNumber, formatRupees } from '../utils/format';
import { RIDE_MODE_LABELS } from '../utils/rideOptions';

const POOL_STATUS_TEXT = {
  open: 'Open - waiting for travellers. Not booked yet, no driver assigned.',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function Rows({ rows }) {
  return (
    <dl className="divide-y divide-slate-100 dark:divide-slate-800">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-2.5 text-sm">
          <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="text-right font-medium text-slate-800 dark:text-slate-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const perPersonText = ({ min, max }) => (min === max ? formatRupees(min) : `${formatRupees(min)}–${formatRupees(max)}`);

function rideRows(trip, ride) {
  const rows = [
    ['Ride', RIDE_MODE_LABELS[ride.mode]],
    ['Vehicle', `${ride.vehicle.label} (up to ${ride.vehicle.seats} people, ${ride.vehicle.bags} bags)`],
    ['Your group', `${trip.passengerCount} ${trip.passengerCount === 1 ? 'person' : 'people'} · ${trip.luggageCount} ${trip.luggageCount === 1 ? 'bag' : 'bags'}`],
  ];

  if (ride.mode === 'solo') {
    rows.push(['Estimated fare (whole cab)', ride.soloFare ? formatRupees(ride.soloFare.total) : 'Not available']);
    rows.push(['Status', 'Solo ride requested - not booked yet, no driver assigned']);
    return rows;
  }

  const pool = ride.pool;
  rows.push(['People in the cab', `${pool.seatsTaken} of ${pool.seats} seats · ${pool.bookings} ${pool.bookings === 1 ? 'booking' : 'bookings'}`]);
  pool.others.forEach((m, i) =>
    rows.push([
      `Co-traveller ${i + 1}${m.isDemo ? ' (sample)' : ''}`,
      `${m.area ?? 'Same destination'} · ${m.partySize} ${m.partySize === 1 ? 'person' : 'people'}${m.flightNumber ? ` · ${m.flightNumber}` : ''}`,
    ]),
  );
  if (pool.others.length === 0) rows.push(['Co-travellers', 'Nobody has joined yet']);
  if (pool.fare) {
    rows.push(['Estimated taxi fare', formatRupees(pool.fare.total)]);
    rows.push(['Estimated cost per person', perPersonText(pool.fare.perPerson)]);
    rows.push(['Your share', formatRupees(pool.fare.yourShare)]);
  } else {
    rows.push(['Fare', 'Estimate not available']);
  }
  rows.push(['Status', POOL_STATUS_TEXT[pool.status] ?? pool.status]);
  return rows;
}

export default function BookingSummaryPage() {
  const { tripId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRide(tripId).then(setData).catch(setError);
  }, [tripId]);

  const trip = data?.trip;
  const ride = data?.ride;
  const pickup =
    trip?.pickupLocation === MUMBAI_AIRPORT.name ? `${MUMBAI_AIRPORT.shortName} · ${trip.pickupTerminal}` : trip?.pickupLocation;
  const linkClass = 'inline-block text-sm font-medium text-sky-700 hover:underline dark:text-sky-400';

  return (
    <AppLayout title="Booking Summary" step={5} trip={trip ? { id: trip.id, status: trip.status } : { id: tripId }} backdrop={<TravelBackdrop />}>
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200/70 bg-white p-6 shadow-[0_28px_70px_-15px_rgba(12,74,110,0.35)] sm:p-8 dark:border-slate-800 dark:bg-slate-900 dark:shadow-[0_28px_80px_-12px_rgba(56,189,248,0.22)]">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Booking summary</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Your trip, flight and ride choice at a glance.</p>

        {!data && !error && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {error.message}
          </p>
        )}
        {error && <TripRecoveryLinks />}

        {trip && (
          <div className="mt-6 space-y-6">
            <section>
              <h2 className="font-semibold text-slate-900 dark:text-white">Trip</h2>
              <Rows
                rows={[
                  ['Pickup', pickup],
                  ['Drop-off', trip.destination],
                  ['Arrival', `${formatDate(trip.travelDate)} · ${formatTime(trip.expectedArrivalTime)}`],
                  ['Flight', trip.flight ? `${trip.flight.airline} · ${formatFlightNumber(trip.flight.flightNumber)}` : 'Not verified'],
                  [
                    'Verification',
                    trip.verification?.status === 'verified'
                      ? `Verified${trip.verification.method?.startsWith('demo') ? ' (demo)' : ''}`
                      : 'Not verified',
                  ],
                ]}
              />
            </section>

            {trip.status === 'cancelled' && (
              <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                This trip was cancelled.
              </p>
            )}

            {ride && trip.status !== 'cancelled' ? (
              <section>
                <h2 className="font-semibold text-slate-900 dark:text-white">Your ride</h2>
                <Rows rows={rideRows(trip, ride)} />
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Fares are provisional estimates, not live taxi quotes. Nothing has been booked or charged.
                </p>
              </section>
            ) : (
              trip.status !== 'cancelled' && (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                  No ride has been chosen for this trip yet, so there is no summary.
                </p>
              )
            )}

            {trip.status === 'cancelled' ? (
              <TripRecoveryLinks />
            ) : trip.verification?.status !== 'verified' ? (
              <Link to={`/trip/${tripId}/verify`} className={linkClass}>
                ← Verify your flight first
              </Link>
            ) : (
              <Link to={`/trip/${tripId}/matches`} className={linkClass}>
                {ride ? '← Change ride' : '← Choose your ride'}
              </Link>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
