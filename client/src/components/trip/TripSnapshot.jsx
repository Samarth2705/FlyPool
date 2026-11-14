// The passenger's trip at a glance, styled like a boarding pass:
//   FROM  BOM · Terminal 2   ──✈──   TO  Powai
//   ------------------------------------------- (perforation)
//   Date · Lands · Flight · Travelling
//
// Used on Verify flight, Choose ride and Summary, so the trip always looks
// the same. `badge` is shown top right (e.g. "Flight verified"), `footer`
// under the details (e.g. an "Edit trip details" link).
import FlightCode from '../ui/FlightCode';
import { formatDate, formatTime } from '../../utils/dates';
import { formatFlightNumber } from '../../utils/format';
import { isAirportPickup, partyLabel, terminalLabel } from '../../utils/trips';
import { airportOf } from '../../data/mumbaiLocations';
import { PlaneIcon } from '../ui/icons';

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="tabular mt-0.5 font-medium text-slate-900 dark:text-white">{children}</dd>
    </div>
  );
}

export default function TripSnapshot({ trip, badge, footer, className = '' }) {
  const fromAirport = isAirportPickup(trip);

  return (
    <section
      aria-label="Your trip"
      className={`overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {/* Route */}
      <div className="px-4 pt-4 pb-4 sm:px-6 sm:pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-slate-400">Your trip</p>
          {badge}
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-500 dark:text-slate-400">From</p>
            <p className="text-lg leading-tight font-bold tracking-tight break-words text-slate-900 sm:text-2xl dark:text-white">
              {fromAirport ? airportOf(trip).code : trip.pickupLocation}
            </p>
            <p className="truncate text-sm text-slate-600 dark:text-slate-400">
              {fromAirport ? [airportOf(trip).city, terminalLabel(trip)].filter(Boolean).join(' · ') : 'Pickup point'}
            </p>
          </div>
          <div className="flex w-12 items-center text-slate-300 sm:w-24 dark:text-slate-600" aria-hidden="true">
            <span className="h-px flex-1 border-t border-dashed border-current" />
            <PlaneIcon className="mx-1 h-5 w-5 rotate-45 text-brand-600 dark:text-brand-400" />
            <span className="h-px flex-1 border-t border-dashed border-current" />
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400">To</p>
            <p className="text-lg leading-tight font-bold tracking-tight break-words text-slate-900 sm:text-2xl dark:text-white">
              {trip.destination}
            </p>
            <p className="truncate text-sm text-slate-600 dark:text-slate-400">Drop-off</p>
          </div>
        </div>
      </div>

      {/* Perforation */}
      <div className="mx-4 border-t border-dashed border-slate-200 sm:mx-6 dark:border-slate-700" aria-hidden="true" />

      {/* Details */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-sm sm:grid-cols-4 sm:px-6">
        <Fact label="Date">{formatDate(trip.travelDate)}</Fact>
        <Fact label="Lands">{formatTime(trip.flight?.scheduledArrivalTime ?? trip.expectedArrivalTime)}</Fact>
        <Fact label="Flight">
          {trip.flight ? (
            <FlightCode>{formatFlightNumber(trip.flight.flightNumber)}</FlightCode>
          ) : (
            <span className="font-normal text-slate-500 dark:text-slate-400">Not verified yet</span>
          )}
        </Fact>
        <Fact label="Travelling">{partyLabel(trip)}</Fact>
      </dl>

      {footer && <div className="border-t border-slate-100 px-4 py-2.5 sm:px-6 dark:border-slate-800">{footer}</div>}
    </section>
  );
}
