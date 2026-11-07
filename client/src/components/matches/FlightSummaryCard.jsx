// Page 4: compact summary of the passenger's own flight and trip.
import { PlaneIcon, CalendarIcon, MapPinIcon, UsersIcon, CheckCircleIcon } from '../ui/icons';
import { MUMBAI_AIRPORT } from '../../data/mumbaiLocations';
import { formatDate, formatTime } from '../../utils/dates';
import { formatFlightNumber } from '../../utils/format';

function Item({ icon: Icon, label, children }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
        <p className="font-medium break-words text-slate-900 dark:text-white">{children}</p>
      </div>
    </div>
  );
}

export default function FlightSummaryCard({ trip }) {
  const fromAirport = trip.pickupLocation === MUMBAI_AIRPORT.name;
  const isDemo = trip.verification?.method?.startsWith('demo');

  return (
    <section
      aria-label="Your flight"
      className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Item icon={PlaneIcon} label="Flight">
          {trip.flight ? `${trip.flight.airline} · ${formatFlightNumber(trip.flight.flightNumber)}` : 'Not verified'}
        </Item>
        <Item icon={CalendarIcon} label="Arrival">
          {formatDate(trip.travelDate)} · {formatTime(trip.expectedArrivalTime)}
        </Item>
        <Item icon={MapPinIcon} label={fromAirport ? 'Airport → drop-off' : 'Pickup → drop-off'}>
          {fromAirport ? `BOM ${trip.pickupTerminal ?? ''}` : trip.pickupLocation} → {trip.destination}
        </Item>
        <Item icon={UsersIcon} label="Travelling together">
          {trip.passengerCount} {trip.passengerCount === 1 ? 'person' : 'people'} · {trip.luggageCount}{' '}
          {trip.luggageCount === 1 ? 'bag' : 'bags'}
        </Item>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
        <CheckCircleIcon className="h-4 w-4" />
        Flight verified{isDemo ? ' (demo verification)' : ''}
      </p>
    </section>
  );
}
