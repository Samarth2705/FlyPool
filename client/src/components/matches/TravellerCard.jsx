// Step 3: one compatible co-traveller: short name, age and (only if they chose
// to show it) gender, plus pooling facts - destination area, group size,
// flight number and arrival time. Never contact details, a date of birth or
// an exact address. The facts sit in the same columns on every card, so
// travellers are easy to compare at a glance.
import Badge from '../ui/Badge';
import TravellerProfile from './TravellerProfile';

const VEHICLE_LABELS = { sedan: 'Sedan', suv: 'SUV' };

function rideStatus(traveller) {
  if (traveller.inYourPool) return { text: 'In your shared ride', tone: 'solid' };
  if (traveller.ride?.mode === 'shared') {
    const vehicle = VEHICLE_LABELS[traveller.ride.vehicleType] ?? 'cab';
    return { text: `In a shared ${vehicle}`, tone: 'brand' };
  }
  return { text: 'No ride chosen yet', tone: 'neutral' };
}

// "Same time as you" / "10 min after you" (short enough for a column)
function landsText(minutesApart) {
  if (minutesApart === 0) return 'Same time as you';
  return `${Math.abs(minutesApart)} min ${minutesApart > 0 ? 'after' : 'before'} you`;
}

function Fact({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="tabular mt-0.5 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{children}</dd>
    </div>
  );
}

export default function TravellerCard({ traveller, index }) {
  const status = rideStatus(traveller);

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <TravellerProfile profile={traveller.profile} fallback={`Traveller ${index + 1}`} />
        {traveller.sameFlight && <Badge tone="brand">Same flight</Badge>}
        <Badge tone={status.tone}>{status.text}</Badge>
        {traveller.isDemo && <Badge tone="warning">Sample data</Badge>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact label="Going to">{traveller.area ?? 'Your destination'}</Fact>
        <Fact label="Lands">{landsText(traveller.minutesApart)}</Fact>
        <Fact label="Flight">{traveller.flightNumber ?? '—'}</Fact>
        <Fact label="Group">
          {traveller.partySize} {traveller.partySize === 1 ? 'person' : 'people'}
        </Fact>
      </dl>
    </li>
  );
}
