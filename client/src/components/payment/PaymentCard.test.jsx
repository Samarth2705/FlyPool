// Pay Now (DEMO), against a mocked API that answers like
// server/src/services/payment.service.js. Synthetic data only.
import { useState } from 'react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PaymentCard from './PaymentCard';
import * as payments from '../../api/payments.api';
import { makeBooking, makeRide, makeTrip } from '../../test/fixtures';

vi.mock('../../api/payments.api', () => ({ startPayment: vi.fn(), completeDemoPayment: vi.fn() }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user1', name: 'Juliet Demo' } }) }));

const TRIP = makeTrip();
const BOOKING = makeBooking(makeRide());
const member = (overrides) => ({ label: 'You', isYou: true, area: 'Bandra West', partySize: 1, booked: true, share: 300, paid: false, ...overrides });

// GET /trips/:id/payment - a shared taxi: ₹900 for 3 people; this passenger owes ₹300
function payView(overrides = {}) {
  return {
    mode: 'demo',
    demo: true,
    amount: 300,
    fare: { total: 900, people: 3, partySize: 1, share: 300, perPerson: { min: 300, max: 300 } },
    blocker: null,
    payment: null,
    canPay: true,
    pool: {
      vehicleType: 'sedan',
      total: 900,
      collected: 0,
      outstanding: 900,
      overCollected: 0,
      allPaid: false,
      members: [member(), member({ label: 'Traveller 1', isYou: false, area: 'Juhu', partySize: 2, share: 600 })],
    },
    history: [],
    ...overrides,
  };
}
const PENDING = { id: 'pay1', amount: 300, status: 'pending', mode: 'demo', bookingReference: 'FP-TESTAB23' };
const PAID = { ...PENDING, status: 'paid', paidAt: '2026-11-15T09:00:00.000Z', providerPaymentId: 'demo_pay_0a1b2c' };

// The page reloads the view from the server after every payment step (onChanged)
let serverViews;
const onChanged = vi.fn();
function Harness({ initial }) {
  const [view, setView] = useState(initial);
  return (
    <PaymentCard
      tripId="trip1"
      view={view}
      trip={TRIP}
      booking={BOOKING}
      onChanged={async () => {
        onChanged();
        if (serverViews.length) setView(serverViews.shift());
      }}
    />
  );
}
const renderCard = (initial = payView(), ...next) => {
  serverViews = next;
  return render(<Harness initial={initial} />);
};
const status = () => screen.getByTestId('payment-status');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('payment section', () => {
  test('shows the taxi’s total fare, how many share it, THIS passenger’s share and status', () => {
    renderCard();
    expect(screen.getByText('Total taxi fare').nextSibling).toHaveTextContent('₹900');
    expect(screen.getByText('Passengers sharing').nextSibling).toHaveTextContent('3 people');
    expect(screen.getByTestId('payment-share')).toHaveTextContent('₹300');
    expect(status()).toHaveTextContent('Not paid yet');
    expect(screen.getByText(/Demo mode/)).toBeInTheDocument();
    const who = within(screen.getByTestId('payment-members'));
    expect(who.getByText('You').nextSibling).toHaveTextContent('₹300 · Not paid');
    expect(who.getByText('Traveller 1 · Juhu').nextSibling).toHaveTextContent('₹600 · Not paid');
    expect(screen.getByRole('button', { name: 'Pay now · ₹300' })).toBeEnabled();
  });

  test('Pay now sends NO amount; the DEMO PAYMENT dialog shows name, ride and share, asks for no financial details; confirming = Paid (Demo)', async () => {
    payments.startPayment.mockResolvedValue({ payment: PENDING, created: true });
    payments.completeDemoPayment.mockResolvedValue({ payment: PAID, changed: true });
    renderCard(payView(), payView({ payment: PAID, canPay: false, pool: { ...payView().pool, members: [member({ paid: true }), payView().pool.members[1]] } }));

    await userEvent.click(screen.getByRole('button', { name: 'Pay now · ₹300' }));
    expect(payments.startPayment).toHaveBeenCalledTimes(1);
    expect(payments.startPayment.mock.calls[0]).toEqual(['trip1']); // only the trip - the server sets the amount

    const dialog = within(screen.getByRole('dialog', { name: 'Confirm your share' }));
    expect(dialog.getByText('DEMO PAYMENT')).toBeInTheDocument();
    expect(dialog.getByTestId('demo-amount')).toHaveTextContent('₹300');
    expect(dialog.getByText('Passenger').nextSibling).toHaveTextContent('Juliet Demo');
    expect(dialog.getByText('Flight').nextSibling).toHaveTextContent('IndiGo 6E 2134');
    expect(dialog.getByText('Booking').nextSibling).toHaveTextContent('FP-TESTAB23');
    expect(dialog.getByText(/No real money is charged/)).toBeInTheDocument();
    // No card / UPI / bank fields of any kind
    expect(screen.getByTestId('demo-payment').querySelectorAll('input, select, textarea')).toHaveLength(0);

    await userEvent.click(dialog.getByRole('button', { name: 'Confirm demo payment' }));
    expect(payments.completeDemoPayment).toHaveBeenCalledWith('pay1', 'success');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Payment successful (Demo)')).toBeInTheDocument();
    expect(screen.getByTestId('payment-receipt')).toHaveTextContent('₹300 recorded for booking FP-TESTAB23');
    expect(screen.getByTestId('payment-receipt')).toHaveTextContent('demo_pay_0a1b2c');
    expect(status()).toHaveTextContent('Paid (Demo)');
    expect(screen.queryByRole('button', { name: /Pay now/ })).not.toBeInTheDocument(); // can't pay twice
    expect(within(screen.getByTestId('payment-members')).getByText('You').nextSibling).toHaveTextContent('Paid');
    expect(within(screen.getByTestId('payment-members')).getByText('Traveller 1 · Juhu').nextSibling).toHaveTextContent('Not paid'); // only mine changed
  });

  test('no duplicate payments: Pay now and Confirm pressed twice in the same instant send ONE request each', async () => {
    let started;
    let finished;
    payments.startPayment.mockImplementation(() => new Promise((resolve) => (started = resolve)));
    payments.completeDemoPayment.mockImplementation(() => new Promise((resolve) => (finished = resolve)));
    renderCard(payView(), payView({ payment: PAID, canPay: false }));

    const pay = screen.getByRole('button', { name: 'Pay now · ₹300' });
    act(() => {
      pay.click();
      pay.click();
    });
    await act(async () => started({ payment: PENDING, created: true }));
    expect(payments.startPayment).toHaveBeenCalledTimes(1);

    const confirm = screen.getByRole('button', { name: 'Confirm demo payment' });
    act(() => {
      confirm.click();
      confirm.click();
    });
    await act(async () => finished({ payment: PAID, changed: true }));
    expect(payments.completeDemoPayment).toHaveBeenCalledTimes(1);
    expect(status()).toHaveTextContent('Paid (Demo)');
  });

  test('a paid share stays paid when the page is opened again (the status comes from the server)', () => {
    renderCard(payView({ payment: PAID, canPay: false }));
    expect(status()).toHaveTextContent('Paid (Demo)');
    expect(screen.getByTestId('payment-paid-note')).toHaveTextContent('You paid ₹300');
    expect(screen.getByTestId('payment-paid-note')).toHaveTextContent('demo - no money was transferred');
    expect(screen.queryByRole('button', { name: /Pay now|Continue payment/ })).not.toBeInTheDocument();
  });

  test('a simulated failure shows Payment failed (Demo) and can be tried again', async () => {
    const FAILED = { ...PENDING, status: 'failed', failureReason: 'Demo: payment declined' };
    payments.startPayment.mockResolvedValue({ payment: PENDING, created: true });
    payments.completeDemoPayment.mockResolvedValue({ payment: FAILED, changed: true });
    renderCard(payView(), payView({ payment: FAILED }));

    await userEvent.click(screen.getByRole('button', { name: 'Pay now · ₹300' }));
    await userEvent.click(screen.getByRole('button', { name: 'Simulate failure' }));
    expect(payments.completeDemoPayment).toHaveBeenCalledWith('pay1', 'failure');
    expect(await screen.findByRole('alert')).toHaveTextContent('Payment failed (Demo)');
    expect(status()).toHaveTextContent('Payment failed (Demo)');
    expect(screen.getByRole('button', { name: 'Pay now · ₹300' })).toBeEnabled();
  });

  test('"Not now" closes the dialog without a result: the payment stays pending and can be continued', async () => {
    payments.startPayment.mockResolvedValue({ payment: PENDING, created: false });
    renderCard(payView({ payment: PENDING }));
    expect(status()).toHaveTextContent('Payment pending');
    await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }));
    await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(payments.completeDemoPayment).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Continue payment' })).toBeEnabled();
  });

  test('payment opens once everyone in the taxi has booked; the share still comes from the server', () => {
    renderCard(
      payView({
        amount: null,
        fare: null,
        canPay: false,
        blocker: { code: 'WAITING_FOR_BOOKINGS', message: 'Payment opens once everyone in your shared ride has booked - waiting for 1 traveller.' },
        pool: { ...payView().pool, members: [member(), member({ label: 'Traveller 1', isYou: false, area: 'Juhu', partySize: 2, share: 600, booked: false })] },
      }),
    );
    expect(screen.getByText('Total taxi fare').nextSibling).toHaveTextContent('₹900');
    expect(screen.getByTestId('payment-share')).toHaveTextContent('₹300');
    expect(screen.getByText(/waiting for 1 traveller/)).toBeInTheDocument();
    expect(screen.getByText('Traveller 1 · Juhu').nextSibling).toHaveTextContent('₹600 · Not booked yet');
    expect(screen.queryByRole('button', { name: /Pay now/ })).not.toBeInTheDocument();
  });

  test('the taxi changed before confirming: the server refuses and nothing is paid', async () => {
    payments.startPayment.mockResolvedValue({ payment: PENDING, created: true });
    payments.completeDemoPayment.mockRejectedValue({
      status: 409,
      code: 'AMOUNT_CHANGED',
      message: 'Your share changed because the shared ride changed. Nothing was charged - please start the payment again.',
    });
    renderCard(payView(), payView({ amount: 450, fare: { ...payView().fare, total: 900, people: 2, share: 450 } }));
    await userEvent.click(screen.getByRole('button', { name: 'Pay now · ₹300' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm demo payment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your share changed because the shared ride changed');
    expect(status()).toHaveTextContent('Not paid yet');
    expect(screen.getByRole('button', { name: 'Pay now · ₹450' })).toBeEnabled(); // the new share, from the server
    expect(onChanged).toHaveBeenCalled();
  });

  test('payments switched off: the share is shown, nothing can be paid', () => {
    renderCard(payView({ mode: 'off', demo: false, canPay: false }));
    expect(screen.getByText('Payments aren’t available yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pay now/ })).not.toBeInTheDocument();
  });
});

describe('demo payment dialog on short screens', () => {
  async function openDialog() {
    payments.startPayment.mockResolvedValue({ payment: PENDING, created: true });
    renderCard();
    await userEvent.click(screen.getByRole('button', { name: 'Pay now · ₹300' }));
    return screen.getByTestId('demo-payment');
  }

  test('never taller than the visible screen; only the details scroll - heading, amount and actions stay outside', async () => {
    const dialog = await openDialog();
    expect(dialog.className).toMatch(/max-h-\[calc\(100dvh-1\.5rem\)\]/); // follows mobile browser bars
    expect(dialog.className).toMatch(/max-h-\[calc\(100vh-1\.5rem\)\]/); // fallback without dvh
    expect(dialog).toHaveClass('flex', 'flex-col', 'overflow-hidden');

    const body = screen.getByTestId('demo-payment-body');
    expect(body).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
    expect(within(body).getByText('Passenger')).toBeInTheDocument(); // the details scroll
    // ...but these never scroll away
    const header = screen.getByTestId('demo-payment-header');
    const actions = screen.getByTestId('demo-payment-actions');
    expect(header).toHaveClass('shrink-0');
    expect(actions).toHaveClass('shrink-0');
    expect(within(header).getByRole('heading', { name: 'Confirm your share' })).toBeInTheDocument();
    expect(within(header).getByTestId('demo-amount')).toHaveTextContent('₹300');
    expect(within(header).getByRole('button', { name: 'Close' })).toBeInTheDocument();
    for (const name of ['Confirm demo payment', 'Simulate failure', 'Not now']) {
      expect(within(actions).getByRole('button', { name })).toBeInTheDocument();
      expect(body).not.toContainElement(within(actions).getByRole('button', { name }));
    }
    // Focus starts on the main action; there are no text fields (no keyboard opens over it)
    expect(within(actions).getByRole('button', { name: 'Confirm demo payment' })).toHaveFocus();
    expect(dialog.querySelectorAll('input, textarea, select, [contenteditable]')).toHaveLength(0);
  });

  test('the Close (×) button and Escape close it without a result - the payment stays pending', async () => {
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pay now · ₹300' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(payments.completeDemoPayment).not.toHaveBeenCalled();
  });

  test('while a result is being recorded nothing can close it', async () => {
    payments.completeDemoPayment.mockImplementation(() => new Promise(() => {}));
    await openDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm demo payment' }));
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

test('the success message and the Paid (Demo) status appear TOGETHER - the status is reloaded first', async () => {
  let release;
  payments.startPayment.mockResolvedValue({ payment: PENDING, created: true });
  payments.completeDemoPayment.mockResolvedValue({ payment: PAID, changed: true });
  function SlowReload() {
    const [view, setView] = useState(payView());
    const onReload = () =>
      new Promise((resolve) => {
        release = () => {
          setView(payView({ payment: PAID, canPay: false }));
          resolve();
        };
      });
    return <PaymentCard tripId="trip1" view={view} trip={TRIP} booking={BOOKING} onChanged={onReload} />;
  }
  render(<SlowReload />);
  await userEvent.click(screen.getByRole('button', { name: 'Pay now · ₹300' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm demo payment' }));
  await waitFor(() => expect(release).toBeDefined());
  // The server recorded it, the status is still loading: no success message yet
  expect(screen.queryByText('Payment successful (Demo)')).not.toBeInTheDocument();
  expect(status()).toHaveTextContent('Not paid yet');
  await act(async () => release());
  expect(screen.getByText('Payment successful (Demo)')).toBeInTheDocument();
  expect(status()).toHaveTextContent('Paid (Demo)');
});

test('the dialog is rendered at the top of the page (not inside the payment section), so no sticky column or header can cover it', async () => {
  payments.startPayment.mockResolvedValue({ payment: PENDING, created: true });
  renderCard();
  await userEvent.click(screen.getByRole('button', { name: 'Pay now · ₹300' }));
  const overlay = screen.getByRole('dialog').parentElement;
  expect(overlay).toHaveClass('fixed', 'inset-0', 'z-50');
  expect(overlay.parentElement).toBe(document.body);
  expect(screen.getByTestId('payment-card')).not.toContainElement(screen.getByRole('dialog'));
});
