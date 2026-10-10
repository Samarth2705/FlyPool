// Page 4: one shared ride (pool) as a selectable radio card - who is in it,
// seats left and the estimated fare per person. Also used for "Start a new
// shared ride" (pool = null).
import { formatRupees } from '../../utils/format';

function SeatBar({ taken, seats }) {
  return (
    <span className="mt-2 flex gap-1" aria-hidden="true">
      {Array.from({ length: seats }, (_, i) => (
        <span key={i} className={`h-1.5 flex-1 rounded-full ${i < taken ? 'bg-sky-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
      ))}
    </span>
  );
}

export default function PoolCard({ pool, vehicleLabel, title, description, selected, onSelect, badge }) {
  const fare = pool?.fare;

  return (
    <label
      className={`block cursor-pointer rounded-2xl border bg-white p-4 transition has-focus-visible:ring-4 has-focus-visible:ring-sky-100 dark:bg-slate-900 dark:has-focus-visible:ring-sky-900 ${
        selected
          ? 'border-sky-500 ring-1 ring-sky-500'
          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
      }`}
    >
      <input type="radio" name="shared-ride" checked={selected} onChange={onSelect} className="sr-only" />
      <span className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900 dark:text-white">{title}</span>
          {badge && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
              {badge}
            </span>
          )}
        </span>
        {fare && (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            <span className="text-lg font-bold text-slate-900 dark:text-white">{formatRupees(fare.perPerson.max)}</span> est. /
            person
          </span>
        )}
      </span>

      {description && <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">{description}</span>}

      {pool && (
        <>
          <span className="mt-2 block text-sm text-slate-600 dark:text-slate-300">
            {vehicleLabel} · {pool.seatsTaken} of {pool.seats} seats taken · {pool.seatsLeft}{' '}
            {pool.seatsLeft === 1 ? 'seat' : 'seats'} left · {pool.bagsTaken} of {pool.bags} bags
          </span>
          <SeatBar taken={pool.seatsTaken} seats={pool.seats} />
          {pool.others.length > 0 && (
            <span className="mt-3 flex flex-wrap gap-2">
              {pool.others.map((m, i) => (
                <span
                  key={i}
                  className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {m.area ?? 'Same destination'} · {m.partySize} {m.partySize === 1 ? 'person' : 'people'}
                  {m.flightNumber ? ` · ${m.flightNumber}` : ''}
                  {m.isDemo ? ' · sample' : ''}
                </span>
              ))}
            </span>
          )}
          {fare?.savingsPerPerson > 0 && (
            <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              Save about {formatRupees(fare.savingsPerPerson)} per person vs travelling alone
            </span>
          )}
        </>
      )}
    </label>
  );
}
