// Step 3: one shared ride (pool) as a selectable radio card - who is in it,
// seats and bags left and the estimated fare per person. Also used for
// "Start a new shared ride" (pool = null).
import ChoiceCard from '../ui/ChoiceCard';
import Badge from '../ui/Badge';
import { formatRupees } from '../../utils/format';
import { poolStatusOf, seatsText } from '../../live/useLiveRide';
import { profileLine } from '../../utils/profiles';

function CapacityBar({ label, taken, total }) {
  return (
    <span className="block min-w-0">
      <span className="tabular flex justify-between text-xs text-slate-600 dark:text-slate-400">
        <span>{label}</span>
        <span>
          {taken}/{total}
        </span>
      </span>
      <span className="mt-1 flex gap-0.5" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-sm ${i < taken ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </span>
    </span>
  );
}

export default function PoolCard({ pool, vehicleLabel, title, description, selected, onSelect, badge, disabled }) {
  const fare = pool?.fare;

  return (
    <ChoiceCard name="shared-ride" value={pool?.id ?? 'new'} checked={selected} onChange={onSelect} disabled={disabled}>
      <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
          {badge && <Badge tone="solid">{badge}</Badge>}
        </span>
        {fare && (
          <span className="text-sm text-slate-600 dark:text-slate-400">
            <span className="tabular text-lg font-bold text-slate-900 dark:text-white">{formatRupees(fare.perPerson.max)}</span>{' '}
            est. / person
          </span>
        )}
      </span>

      {description && <span className="mt-1 block text-sm text-slate-600 dark:text-slate-400">{description}</span>}

      {pool && (
        <>
          {/* Seats as the server counts them (people, not bookings) */}
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <span className="tabular text-sm font-medium text-slate-800 dark:text-slate-200" data-testid="pool-seats">
              {seatsText(pool)}
            </span>
            <Badge tone={poolStatusOf(pool).tone}>{poolStatusOf(pool).label}</Badge>
          </span>
          <span className="sr-only">
            {vehicleLabel}: {pool.bagsTaken} of {pool.bags} bags.
          </span>
          <span className="mt-3 grid grid-cols-2 gap-4" aria-hidden="true">
            <CapacityBar label="Seats taken" taken={pool.seatsTaken} total={pool.seats} />
            <CapacityBar label="Bags" taken={pool.bagsTaken} total={pool.bags} />
          </span>
          {pool.others.length > 0 && (
            <span className="mt-3 block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-400">Already in this ride</span>
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {pool.others.map((m, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {m.profile?.shared ? `${profileLine(m.profile)} · ` : ''}
                    {m.area ?? 'Same destination'} · {m.partySize} {m.partySize === 1 ? 'person' : 'people'}
                    {m.flightNumber ? ` · ${m.flightNumber}` : ''}
                    {m.isDemo ? ' · sample' : ''}
                  </span>
                ))}
              </span>
            </span>
          )}
          {fare?.savingsPerPerson > 0 && (
            <Badge tone="success" className="mt-3">
              Save about {formatRupees(fare.savingsPerPerson)} per person vs travelling alone
            </Badge>
          )}
        </>
      )}
    </ChoiceCard>
  );
}
