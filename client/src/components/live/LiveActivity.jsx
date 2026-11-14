// The live activity line on the ride screens: other compatible passengers
// choosing a ride now, and the latest change (someone joined, a ride filled
// up...). Everything comes from the server via useLiveRide; it updates every
// few seconds (polling), so it says "updated every few seconds", not "instant".
//   <LiveActivity live={useLiveRide(tripId)} />
import { consideringText } from '../../live/useLiveRide';
import { UsersIcon } from '../ui/icons';

export default function LiveActivity({ live, className = '' }) {
  if (!live?.loaded && !live?.stale) return null;
  const count = consideringText(live.othersConsidering);

  return (
    <div
      className={`rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900 dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-100 ${className}`}
      data-testid="live-activity"
    >
      <p className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
        <span
          className={`h-2 w-2 rounded-full ${live.stale ? 'bg-amber-500' : 'bg-emerald-500 motion-safe:animate-pulse'}`}
          aria-hidden="true"
        />
        {live.stale ? 'Live updates paused' : 'Live · updated every few seconds'}
      </p>
      {/* Changes are announced politely to screen readers */}
      <div aria-live="polite" className="mt-1.5 space-y-1">
        {live.notice && (
          <p className="font-semibold" data-testid="live-notice">
            {live.notice.text}
          </p>
        )}
        {count && (
          <p className="flex items-start gap-2" data-testid="live-count">
            <UsersIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{count}</span>
          </p>
        )}
        {!count && !live.notice && !live.stale && !live.booked && (
          <p className="text-brand-800/80 dark:text-brand-200/80">No other compatible passengers are choosing a ride right now.</p>
        )}
        {live.stale && (
          <p data-testid="live-stale">We can’t reach FlyPool right now, so these may be the last known numbers. We’ll keep trying.</p>
        )}
      </div>
    </div>
  );
}
