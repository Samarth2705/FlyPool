// Page 4: one compatible co-traveller. Only pooling facts are shown -
// destination area, group size, flight number and arrival time - never a
// name, contact details or an exact address.
import { UsersIcon } from '../ui/icons';
import { arrivalText } from '../../utils/rideOptions';

const chip = 'rounded-full px-2 py-0.5 text-xs font-semibold';
const VEHICLE_LABELS = { sedan: 'Sedan', suv: 'SUV' };

function rideStatus(traveller) {
  if (traveller.inYourPool) return { text: 'In your shared ride', className: 'bg-sky-600 text-white' };
  if (traveller.ride?.mode === 'shared') {
    const vehicle = VEHICLE_LABELS[traveller.ride.vehicleType] ?? 'cab';
    return { text: `In a shared ${vehicle}`, className: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' };
  }
  return { text: "Hasn't chosen a ride yet", className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
}

export default function TravellerCard({ traveller, index }) {
  const status = rideStatus(traveller);

  return (
    <li className="flex items-start gap-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <UsersIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="font-semibold text-slate-900 dark:text-white">Traveller {index + 1}</p>
          <span className={`${chip} bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300`}>
            Compatible route
          </span>
          {traveller.sameFlight && (
            <span className={`${chip} bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300`}>Same flight</span>
          )}
          {traveller.isDemo && (
            <span className={`${chip} bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300`}>
              Sample data
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {traveller.flightNumber ? `${traveller.flightNumber} · ` : ''}
          Going to <span className="font-medium">{traveller.area ?? 'the same destination as you'}</span> ·{' '}
          {traveller.partySize} {traveller.partySize === 1 ? 'person' : 'people'}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          {arrivalText(traveller.minutesApart)}
          <span className={`${chip} ${status.className}`}>{status.text}</span>
        </p>
      </div>
    </li>
  );
}
