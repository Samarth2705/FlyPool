// DEMO payment confirmation. Stands in for a payment provider's checkout,
// which FlyPool doesn't have: it says plainly that nothing is charged, and it
// asks for NO card, UPI or bank details. The chosen result goes to the server
// (POST /api/payments/:id/demo-result), which decides the status.
//
// "Not now" just closes it: the payment stays pending and can be continued.
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from '../ui/Button';
import Alert from '../ui/Alert';
import DetailList from '../ui/DetailList';
import { formatFlightNumber, formatRupees } from '../../utils/format';
import { formatDate } from '../../utils/dates';
import { RIDE_MODE_LABELS } from '../../utils/rideOptions';

export default function DemoPaymentDialog({ open, payment, passengerName, trip, booking, busy, error, onResult, onClose }) {
  const titleId = useId();
  const confirmRef = useRef(null);
  const returnFocusRef = useRef(null);
  const latest = useRef({ busy, onClose });
  useEffect(() => {
    latest.current = { busy, onClose };
  });

  // Focus moves in when it opens and back when it closes; Escape = "Not now"
  useEffect(() => {
    if (!open) return undefined;
    returnFocusRef.current = document.activeElement;
    confirmRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape' && !latest.current.busy) latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      returnFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open || !payment) return null;
  const flight = trip?.flight?.flightNumber ? `${trip.flight.airline ?? ''} ${formatFlightNumber(trip.flight.flightNumber)}`.trim() : null;

  // Layout: the header (label, close, title, amount) and the footer (the
  // actions) always stay on screen; only the details in between scroll. The
  // dialog is never taller than the visible screen (dvh follows mobile browser
  // bars). It has no text fields, so no on-screen keyboard opens over it.
  // Rendered into <body>: on wide screens the payment section sits in a
  // sticky column, which would otherwise trap the overlay under the page
  // header.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl supports-[height:100dvh]:max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100vh-2rem)] sm:supports-[height:100dvh]:max-h-[calc(100dvh-2rem)] dark:border-slate-800 dark:bg-slate-900"
        data-testid="demo-payment"
      >
        <div className="shrink-0 border-b border-slate-100 px-5 pt-4 pb-3 sm:px-6 sm:pt-5 dark:border-slate-800" data-testid="demo-payment-header">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold tracking-wider text-amber-900 ring-1 ring-amber-300 ring-inset dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/40">
              DEMO PAYMENT
            </span>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Close"
              className="-mr-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                ×
              </span>
            </button>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-white">
              Confirm your share
            </h2>
            <p className="tabular text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white" data-testid="demo-amount">
              {formatRupees(payment.amount)}
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3 sm:px-6" data-testid="demo-payment-body" tabIndex={0} aria-label="Payment details">
          <DetailList
            rows={[
              ['Passenger', passengerName],
              ['Flight', flight],
              ['Date', trip?.travelDate ? formatDate(trip.travelDate) : null],
              ['Drop-off', trip?.destination],
              ['Ride', booking ? `${RIDE_MODE_LABELS[booking.mode] ?? booking.mode} · ${booking.vehicle?.label ?? booking.vehicleType}` : null],
              ['Booking', booking?.reference ?? payment.bookingReference],
            ]}
          />

          <Alert tone="warning" className="mt-3" title="This is a simulated payment">
            No real money is charged or transferred, and no card, UPI or bank details are needed.
          </Alert>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-5 py-3 sm:px-6 sm:pb-5 dark:border-slate-800" data-testid="demo-payment-actions">
          {error && (
            <p role="alert" className="mb-2 text-sm font-medium text-rose-700 dark:text-rose-400">
              {error}
            </p>
          )}
          <Button ref={confirmRef} onClick={() => onResult('success')} loading={busy} loadingText="Recording demo payment…">
            Confirm demo payment
          </Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" onClick={() => onResult('failure')} disabled={busy}>
              Simulate failure
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
