// Shows where the passenger is in the booking journey, with each step as a
// link to its page. Desktop: all five steps in a row. Mobile: "Step 2 of 5"
// with a progress bar whose segments are links too.
//
// A step is only clickable once it can be opened for this trip:
//   Account          -> My Profile (always)
//   Trip Details     -> this trip's details (or a new trip if there is none)
//   Verify Flight    -> needs a trip
//   Find Your Ride   -> needs a verified flight
//   Booking Summary  -> needs a chosen ride
// The current step is not a link.
import { Link } from 'react-router';

const BOOKING_STEPS = ['Account', 'Trip Details', 'Verify Flight', 'Find Your Ride', 'Booking Summary'];
const VERIFIED = ['flight_verified', 'ride_selected'];

// The page for each step, or null if it can't be opened yet
function stepLinks(trip) {
  const id = trip?.id;
  const status = trip?.status;
  return [
    '/profile',
    id ? `/trip/${id}/edit` : '/trip/new',
    id ? `/trip/${id}/verify` : null,
    id && VERIFIED.includes(status) ? `/trip/${id}/matches` : null,
    id && status === 'ride_selected' ? `/trip/${id}/summary` : null,
  ];
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M8.1 14.2 4.3 10.4l1.4-1.4 2.4 2.4 6.2-6.2 1.4 1.4-7.6 7.6Z" />
    </svg>
  );
}

const focusRing =
  'rounded-lg focus-visible:ring-4 focus-visible:ring-sky-100 focus-visible:outline-none dark:focus-visible:ring-sky-900';

// currentStep is 1-based: 1 = Account, 2 = Trip Details, ...
// trip: { id, status } of the trip being worked on, if any
export default function StepIndicator({ currentStep, trip }) {
  const total = BOOKING_STEPS.length;
  const links = stepLinks(trip);
  const linkFor = (index) => (index + 1 === currentStep ? null : links[index]);

  return (
    <nav aria-label="Booking progress">
      {/* Mobile */}
      <div className="sm:hidden">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Step {currentStep} of {total} ·{' '}
          <span className="font-semibold text-slate-900 dark:text-white">{BOOKING_STEPS[currentStep - 1]}</span>
        </p>
        <div className="mt-0.5 flex gap-1.5">
          {BOOKING_STEPS.map((step, index) => {
            const bar = (
              <span
                className={`block h-1.5 rounded-full ${index < currentStep ? 'bg-sky-600' : 'bg-slate-200 dark:bg-slate-700'}`}
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
          const done = number < currentStep;
          const current = number === currentStep;
          const to = linkFor(index);

          const circle = (
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                done
                  ? 'bg-sky-600 text-white'
                  : current
                    ? 'bg-sky-600 text-white ring-4 ring-sky-100 dark:ring-sky-900'
                    : 'border border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500'
              }`}
            >
              {done ? <CheckIcon /> : number}
            </span>
          );
          const labelColour = current
            ? 'font-semibold text-slate-900 dark:text-white'
            : done
              ? 'text-slate-600 dark:text-slate-300'
              : 'text-slate-400 dark:text-slate-500';

          return (
            <li key={step} className="flex flex-1 items-center last:flex-none" aria-current={current ? 'step' : undefined}>
              {to ? (
                <Link to={to} className={`group -mx-1 flex items-center gap-2 px-1 py-1 ${focusRing}`}>
                  {circle}
                  <span
                    className={`text-sm whitespace-nowrap group-hover:text-sky-700 group-hover:underline dark:group-hover:text-sky-400 ${labelColour}`}
                  >
                    {step}
                    {done && <span className="sr-only"> (completed)</span>}
                  </span>
                </Link>
              ) : (
                <span className="flex items-center gap-2">
                  {circle}
                  <span className={`text-sm whitespace-nowrap ${labelColour}`}>{step}</span>
                </span>
              )}
              {number < total && (
                <span
                  className={`mx-3 h-px flex-1 ${done ? 'bg-sky-600' : 'bg-slate-200 dark:bg-slate-700'}`}
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
