// Page 4: fare estimate for the current choice. All numbers come from the
// server (server/src/services/fare.service.js) - nothing is calculated here.
//
// mode "solo":   the whole cab, no split with other passengers
// mode "shared": the cab total split per person, your share, savings
import { formatRupees } from '../../utils/format';

function Row({ label, children, strong }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className={strong ? 'text-xl font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-800 dark:text-slate-200'}>
        {children}
      </dd>
    </div>
  );
}

const perPersonText = ({ min, max }) => (min === max ? formatRupees(min) : `${formatRupees(min)}–${formatRupees(max)}`);

export default function FareEstimateCard({ mode, vehicleLabel, fare, bookings, partySize, note, assumptions }) {
  return (
    <section
      aria-label="Fare estimate"
      className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900 dark:text-white">
          {mode === 'solo' ? 'Solo ride estimate' : 'Shared ride estimate'}
        </h2>
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
          Provisional
        </span>
      </div>

      {!fare && (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          We can&apos;t estimate a fare for this trip yet - the pickup point or destination isn&apos;t one of the areas we
          know. You can still continue.
        </p>
      )}

      {fare && mode === 'solo' && (
        <dl className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
          <Row label={`Whole cab (${vehicleLabel})`} strong>
            {formatRupees(fare.total)}
          </Row>
          <Row label="People in the cab">{fare.people} (only your group)</Row>
          {partySize > 1 && <Row label="Per person in your group">{perPersonText(fare.perPerson)}</Row>}
        </dl>
      )}

      {fare && mode === 'shared' && (
        <>
          <dl className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            <Row label={`Estimated taxi fare (${vehicleLabel})`}>{formatRupees(fare.total)}</Row>
            <Row label="People sharing">
              {fare.people}
              {bookings > 1 && <span className="font-normal text-slate-500 dark:text-slate-400"> · {bookings} bookings</span>}
            </Row>
            <Row label="Estimated cost per person" strong>
              {perPersonText(fare.perPerson)}
            </Row>
            {partySize > 1 && fare.yourShare != null && (
              <Row label={`Your group's share (${partySize} people)`}>{formatRupees(fare.yourShare)}</Row>
            )}
            {fare.soloFare != null && bookings > 1 && <Row label="Travelling alone instead">{formatRupees(fare.soloFare)}</Row>}
          </dl>
          {fare.savingsPerPerson > 0 && bookings > 1 && (
            <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
              You could save about {formatRupees(fare.savingsPerPerson)} per person by sharing.
            </p>
          )}
        </>
      )}

      {note && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{note}</p>}

      {assumptions?.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium text-sky-700 dark:text-sky-400">How this estimate works</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-500 dark:text-slate-400">
            {assumptions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
