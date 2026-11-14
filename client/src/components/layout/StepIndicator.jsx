// Shows where the passenger is in the booking journey, with each step as a
// link to its page. Desktop: all four steps in a row. Mobile: "Step 2 of 4"
// with a progress bar whose segments are links too.
//
// A step is only clickable once it can be opened for this trip:
//   Trip details   -> this trip's details (or a new trip if there is none)
//   Verify flight  -> needs a trip
//   Choose ride    -> needs a verified flight
//   Summary        -> needs a chosen ride
// The current step is not a link.
//
// A step shows a tick when the trip has really completed it (from its
// status), so going back to an earlier step doesn't "undo" later ones.
import { Link } from 'react-router';
import { CheckIcon } from '../ui/icons';

const BOOKING_STEPS = ['Trip details', 'Verify flight', 'Choose ride', 'Summary'];
const VERIFIED = ['flight_verified', 'ride_selected'];

// The page for each step, or null if it can't be opened yet
function stepLinks(trip) {
  const id = trip?.id;
  const status = trip?.status;
  return [
    id ? `/trip/${id}/edit` : '/trip/new',
    id ? `/trip/${id}/verify` : null,
    id && VERIFIED.includes(status) ? `/trip/${id}/matches` : null,
    id && status === 'ride_selected' ? `/trip/${id}/summary` : null,
  ];
}

// Which steps the trip has finished
function completedSteps(trip) {
  const status = trip?.status;
  return [
    Boolean(trip?.id),
    VERIFIED.includes(status),
    status === 'ride_selected',
    false, // the summary is a place to look, not a task
  ];
}

const focusRing =
  'rounded-md focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none dark:focus-visible:ring-brand-800';

// currentStep is 1-based: 1 = Trip details ... 4 = Summary
// trip: { id, status } of the trip being worked on, if any
export default function StepIndicator({ currentStep, trip }) {
  const total = BOOKING_STEPS.length;
  const links = stepLinks(trip);
  const completed = completedSteps(trip);
  const linkFor = (index) => (index + 1 === currentStep ? null : links[index]);

  return (
    <nav aria-label="Booking progress">
      {/* Mobile */}
      <div className="sm:hidden">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Step {currentStep} of {total} ·{' '}
          <span className="font-semibold text-slate-900 dark:text-white">{BOOKING_STEPS[currentStep - 1]}</span>
        </p>
        <div className="mt-0.5 flex gap-1.5">
          {BOOKING_STEPS.map((step, index) => {
            const filled = index < currentStep || completed[index];
            const bar = (
              <span
                className={`block h-1.5 rounded-full ${filled ? 'bg-brand-600 dark:bg-brand-400' : 'bg-slate-200 dark:bg-slate-700'}`}
              />
            );
            const to = linkFor(index);
            return to ? (
              <Link key={step} to={to} aria-label={`Go to ${step}`} className={`flex-1 py-2 ${focusRing}`}>
                {bar}
              </Link>
            ) : (
              <span key={step} className="flex-1 py-2" aria-hidden="true">
                {bar}
              </span>
            );
          })}
        </div>
      </div>

      {/* Tablet and desktop */}
      <ol className="hidden items-center sm:flex">
        {BOOKING_STEPS.map((step, index) => {
          const number = index + 1;
          const current = number === currentStep;
          const done = !current && (number < currentStep || completed[index]);
          const to = linkFor(index);

          const marker = (
            <span
              className={`tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                current
                  ? 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-900'
                  : done
                    ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/70 dark:text-brand-200'
                    : 'border border-slate-300 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-400'
              }`}
            >
              {done ? <CheckIcon className="h-3.5 w-3.5" /> : number}
            </span>
          );
          const labelColour = current
            ? 'font-semibold text-slate-900 dark:text-white'
            : done
              ? 'text-slate-700 dark:text-slate-300'
              : 'text-slate-500 dark:text-slate-400';
          const label = (
            <span className={`text-sm whitespace-nowrap ${labelColour} ${to ? 'group-hover:text-brand-700 group-hover:underline dark:group-hover:text-brand-300' : ''}`}>
              {step}
              {done && <span className="sr-only"> (completed)</span>}
            </span>
          );

          return (
            <li key={step} className="flex flex-1 items-center last:flex-none" aria-current={current ? 'step' : undefined}>
              {to ? (
                <Link to={to} className={`group -mx-1 flex items-center gap-2 px-1 py-1 ${focusRing}`}>
                  {marker}
                  {label}
                </Link>
              ) : (
                <span className="flex items-center gap-2">
                  {marker}
                  {label}
                </span>
              )}
              {number < total && (
                <span
                  className={`mx-3 h-px flex-1 ${number < currentStep || completed[index] ? 'bg-brand-300 dark:bg-brand-700' : 'bg-slate-200 dark:bg-slate-700'}`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
