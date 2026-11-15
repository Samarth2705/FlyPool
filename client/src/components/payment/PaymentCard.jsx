// "Payment" section of a booking: the taxi's total fare, how many people
// share it, THIS passenger's share, their payment status and Pay Now.
//
// Every number comes from the server (GET /api/trips/:tripId/payment), which
// works the shares out from FlyPool's fare rules. Pay Now sends no amount:
// POST /api/trips/:tripId/payment starts (or continues) this passenger's own
// payment and the server sets the amount. DEMO ONLY - nothing is charged.
//
// No double payment: the buttons lock while a request runs, the server keeps
// one open-or-paid payment per booking, and a paid booking can't be paid
// again. The status always comes back from the server, so it survives
// reloads and logging in elsewhere.
import { useCallback, useRef, useState } from 'react';
import Card from '../ui/Card';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import DetailList from '../ui/DetailList';
import { WalletIcon } from '../ui/icons';
import DemoPaymentDialog from './DemoPaymentDialog';
import { statusOf } from './paymentStatus';
import { completeDemoPayment, startPayment } from '../../api/payments.api';
import { useAuth } from '../../hooks/useAuth';
import { formatRupees } from '../../utils/format';
import { plural } from '../../utils/trips';

const BADGE_TONE = { error: 'warning' }; // Badge has no red tone
const when = (iso) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

// The amounts to show - from the payment view, or the shared ride's
// estimate while payment isn't open yet (someone hasn't booked)
function fareFigures(view) {
  const you = view.pool?.members?.find((m) => m.isYou);
  return {
    total: view.fare?.total ?? view.pool?.total ?? null,
    people: view.fare?.people ?? (view.pool ? view.pool.members.reduce((sum, m) => sum + m.partySize, 0) : null),
    share: view.amount ?? view.fare?.share ?? you?.share ?? view.payment?.amount ?? null,
    partySize: view.fare?.partySize ?? you?.partySize ?? 1,
  };
}

export default function PaymentCard({ tripId, view, trip, booking, onChanged }) {
  const user = useAuth()?.user;
  const [checkout, setCheckout] = useState(null); // the open payment while the dialog shows
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); // { title, message }
  const [dialogError, setDialogError] = useState('');
  const [result, setResult] = useState(null); // the payment the dialog just finished
  const inFlight = useRef(false);
  // Closing leaves the payment pending: "Continue payment" picks it up
  const closeDialog = useCallback(() => !inFlight.current && setCheckout(null), []);

  if (!view) return null;
  const payment = view.payment;
  const status = statusOf(payment);
  const figures = fareFigures(view);
  const continuing = payment?.status === 'pending' || payment?.status === 'processing';

  async function payNow() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    setDialogError('');
    try {
      const { payment: open } = await startPayment(tripId);
      setCheckout(open);
    } catch (failure) {
      if (failure.status !== 401) setError({ title: 'Payment not started', message: failure.message });
      await onChanged?.();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function finish(outcome) {
    if (inFlight.current || !checkout) return;
    inFlight.current = true;
    setBusy(true);
    setDialogError('');
    try {
      const { payment: done } = await completeDemoPayment(checkout.id, outcome);
      // Load the server's status first, so the result message and the status
      // badge change together (never "successful" next to "Not paid yet")
      await onChanged?.();
      setCheckout(null);
      setResult(done);
    } catch (failure) {
      await onChanged?.(); // always show the server's status
      if (failure.code === 'NETWORK_ERROR') {
        setDialogError(`${failure.message} Your status is shown below - you can’t be charged twice.`);
      } else {
        setCheckout(null);
        if (failure.status !== 401) setError({ title: 'Payment not completed', message: failure.message });
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Card as="section" id="payment" aria-labelledby="payment-heading" data-testid="payment-card">
      <div className="flex items-center justify-between gap-3">
        <h2 id="payment-heading" className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white">
          <WalletIcon className="h-5 w-5 text-brand-600 dark:text-brand-300" />
          Payment
        </h2>
        <span data-testid="payment-status">
          <Badge tone={BADGE_TONE[status.tone] ?? status.tone}>{status.label}</Badge>
        </span>
      </div>

      {view.demo && (
        <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-300">Demo mode - payments are simulated and no money moves.</p>
      )}

      <DetailList
        className="mt-2"
        rows={[
          ['Total taxi fare', figures.total != null ? formatRupees(figures.total) : null],
          ['Passengers sharing', figures.people != null ? plural(figures.people, 'person', 'people') : null],
          [
            figures.partySize > 1 ? `Your share (${figures.partySize} people)` : 'Your share',
            figures.share != null ? (
              <span key="share" data-testid="payment-share">
                {formatRupees(figures.share)}
              </span>
            ) : null,
            { emphasis: true },
          ],
        ]}
      />

      {result?.status === 'paid' && (
        <Alert tone="success" className="mt-3" title="Payment successful (Demo)">
          <p data-testid="payment-receipt">
            {formatRupees(result.amount)} recorded for booking <span className="font-mono">{result.bookingReference}</span>
            {result.paidAt ? ` on ${when(result.paidAt)}` : ''}. Demo reference{' '}
            <span className="font-mono break-all">{result.providerPaymentId}</span>. No real money was transferred.
          </p>
        </Alert>
      )}
      {result?.status === 'failed' && (
        <Alert tone="error" className="mt-3" title="Payment failed (Demo)">
          Nothing was charged. You can try again.
        </Alert>
      )}
      {error && (
        <Alert tone="error" className="mt-3" title={error.title}>
          {error.message}
        </Alert>
      )}

      {payment?.status === 'paid' && !result && (
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-300" data-testid="payment-paid-note">
          You paid {formatRupees(payment.amount)}
          {payment.paidAt ? ` on ${when(payment.paidAt)}` : ''}
          {payment.mode === 'demo' ? ' (demo - no money was transferred)' : ''}.
        </p>
      )}
      {payment?.status === 'paid' && payment.needsRefund && (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
          This booking ended after it was paid. Refunds aren’t processed in FlyPool yet, so no refund has been made.
        </p>
      )}

      {view.mode === 'off' && (
        <Alert tone="info" className="mt-3" title="Payments aren’t available yet">
          Your share is shown above, but it can’t be paid in FlyPool yet.
        </Alert>
      )}
      {view.blocker && view.blocker.code !== 'NO_ACTIVE_BOOKING' && view.mode !== 'off' && payment?.status !== 'paid' && (
        <Alert tone="info" className="mt-3" title="You can’t pay yet">
          {view.blocker.message}
        </Alert>
      )}

      {view.canPay && (
        <div className="mt-4">
          <Button onClick={payNow} loading={busy && !checkout} loadingText="Opening payment…">
            {continuing ? 'Continue payment' : `Pay now · ${formatRupees(view.amount)}`}
          </Button>
        </div>
      )}

      {view.pool && view.pool.members.length > 1 && (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-900 dark:text-white">Who has paid</p>
          <ul className="mt-1.5 space-y-1 text-sm" data-testid="payment-members">
            {[...view.pool.members]
              .sort((a, b) => Number(b.isYou) - Number(a.isYou))
              .map((m) => (
                <li key={m.label} className="flex justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-300">
                    {m.isYou ? 'You' : m.label}
                    {!m.isYou && m.area ? ` · ${m.area}` : ''}
                  </span>
                  <span className="tabular text-slate-600 dark:text-slate-400">
                    {m.share != null ? formatRupees(m.share) : '—'} · {m.paid ? 'Paid' : m.booked ? 'Not paid' : 'Not booked yet'}
                  </span>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Each passenger pays their own share. Only paid / not paid is shown.</p>
        </div>
      )}

      <DemoPaymentDialog
        open={Boolean(checkout)}
        payment={checkout}
        passengerName={user?.name}
        trip={trip}
        booking={booking}
        busy={busy}
        error={dialogError}
        onResult={finish}
        onClose={closeDialog}
      />
    </Card>
  );
}
