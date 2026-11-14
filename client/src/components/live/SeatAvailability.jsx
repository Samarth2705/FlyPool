// Seats in one shared ride, exactly as the server counts them (a booking can
// be a group: seats are people, not bookings). Nothing is worked out here.
//   <SeatAvailability pool={ride.pool} vehicleLabel="Sedan" />
import Badge from '../ui/Badge';
import { poolStatusOf, seatsText, sharingText } from '../../live/useLiveRide';

export default function SeatAvailability({ pool, vehicleLabel, showSharing = true, className = '' }) {
  if (!pool) return null;
  const status = poolStatusOf(pool);
  return (
    <div className={className} data-testid="seat-availability">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tabular text-sm font-semibold text-slate-900 dark:text-white" data-testid="seats-text">
          {seatsText(pool)}
        </p>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {Array.from({ length: pool.seats }, (_, i) => (
          <span key={i} className={`h-2 flex-1 rounded-sm ${i < pool.seatsTaken ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
        ))}
      </div>
      <p className="tabular mt-2 text-xs text-slate-600 dark:text-slate-400">
        {vehicleLabel ? `${vehicleLabel} · ` : ''}
        {pool.bagsTaken} of {pool.bags} bags
        {pool.full && pool.status === 'open' ? ' · no room for more passengers' : ''}
      </p>
      {showSharing && (
        <p className="mt-1 text-sm text-slate-700 dark:text-slate-300" data-testid="sharing-text">
          {sharingText(pool)}
        </p>
      )}
    </div>
  );
}
