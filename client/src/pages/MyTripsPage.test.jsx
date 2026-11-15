// My Trips: booking states from the server, links to the right step, and
// cancelling a booked trip through its booking.
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import MyTripsPage from './MyTripsPage';
import * as api from '../api/trips.api';
import * as payApi from '../api/payments.api';
import * as chat from '../api/chat.api';
import { makeBooking, makePool, makeRide, makeTrip } from '../test/fixtures';

vi.mock('../api/trips.api', () => ({
  listMyTrips: vi.fn(),
  cancelTrip: vi.fn(),
  cancelBooking: vi.fn(),
}));
vi.mock('../api/payments.api', () => ({ listMyPayments: vi.fn(), getPayment: vi.fn() }));
vi.mock('../api/chat.api', () => ({ getMessages: vi.fn() }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user1', name: 'Juliet Demo' } }) }));
vi.mock('../components/layout/AppLayout', () => ({ default: ({ children }) => <main>{children}</main> }));

const ride = makeRide();
const withRide = (trip) => ({ ...trip, ride });
const TRIPS = [
  withRide(makeTrip({ id: 'booked1', destination: 'Bandra West', booking: makeBooking(ride, { reference: 'FP-BOOKED22' }) })),
  withRide(makeTrip({ id: 'chosen1', destination: 'Powai' })),
  { ...makeTrip({ id: 'verified1', status: 'flight_verified', destination: 'Worli' }), ride: null },
  withRide(makeTrip({ id: 'cancelled1', status: 'cancelled', destination: 'Colaba', booking: makeBooking(ride, { reference: 'FP-CANCEL22', status: 'cancelled' }) })),
];
const card = (destination) => screen.getByRole('listitem', { name: `To ${destination}` });

beforeEach(() => {
  vi.clearAllMocks();
  payApi.listMyPayments.mockResolvedValue([]);
  payApi.getPayment.mockResolvedValue(payView());
  chat.getMessages.mockResolvedValue({ conversation: null, messages: [], hasOlder: false, serverTime: '2026-11-14T10:00:00.000Z' });
});

test('10. My Trips shows each trip’s real booking state and the right next step', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  render(
    <MemoryRouter>
      <MyTripsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'To Bandra West' });

  const booked = within(card('Bandra West'));
  expect(booked.getByText('Booking confirmed')).toBeInTheDocument();
  expect(booked.getByText('FP-BOOKED22')).toBeInTheDocument();
  expect(booked.getByRole('link', { name: /View booking/ })).toHaveAttribute('href', '/trip/booked1/summary');
  expect(booked.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument();

  const chosen = within(card('Powai'));
  expect(chosen.getByText('Ride selected · not booked yet')).toBeInTheDocument(); // not shown as booked
  expect(chosen.queryByText('Booking confirmed')).not.toBeInTheDocument();
  expect(chosen.getByRole('link', { name: /Review & book/ })).toHaveAttribute('href', '/trip/chosen1/summary');
  expect(chosen.getByRole('button', { name: 'Cancel trip' })).toBeInTheDocument();

  expect(within(card('Worli')).getByRole('link', { name: /Choose ride/ })).toHaveAttribute('href', '/trip/verified1/matches');

  const cancelled = within(card('Colaba'));
  expect(cancelled.getByText('Booking cancelled')).toBeInTheDocument();
  expect(cancelled.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument();

  // Sections: unfinished steps first
  expect(within(screen.getByRole('region', { name: /In progress/ })).getAllByRole('listitem')).toHaveLength(2);
  expect(within(screen.getByRole('region', { name: /Upcoming/ })).getAllByRole('listitem')).toHaveLength(1);
});

test('cancelling a booked trip goes through the booking (after a confirmation); an unbooked trip through the trip', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  api.cancelBooking.mockResolvedValue({});
  api.cancelTrip.mockResolvedValue({});
  render(
    <MemoryRouter>
      <MyTripsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'To Bandra West' });

  await userEvent.click(within(card('Bandra West')).getByRole('button', { name: 'Cancel booking' }));
  const dialog = screen.getByRole('alertdialog', { name: 'Cancel booking FP-BOOKED22?' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel booking' }));
  expect(api.cancelBooking).toHaveBeenCalledWith('booked1');
  expect(api.cancelTrip).not.toHaveBeenCalled();
  expect(api.listMyTrips).toHaveBeenCalledTimes(2); // reloaded with the server's state

  await userEvent.click(within(card('Powai')).getByRole('button', { name: 'Cancel trip' }));
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel trip' }));
  expect(api.cancelTrip).toHaveBeenCalledWith('chosen1');
  expect(api.cancelBooking).toHaveBeenCalledTimes(1);
});

test('a refused cancellation shows the server’s reason', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  api.cancelBooking.mockRejectedValue({ status: 409, code: 'TRIP_IN_PAST', message: 'This trip has already happened, so it can’t be cancelled.' });
  render(
    <MemoryRouter>
      <MyTripsPage />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'To Bandra West' });
  await userEvent.click(within(card('Bandra West')).getByRole('button', { name: 'Cancel booking' }));
  await userEvent.click(screen.getByRole('button', { name: 'Yes, cancel booking' }));
  expect(await within(screen.getByRole('alertdialog')).findByRole('alert')).toHaveTextContent('already happened');
});

// GET /trips/:id/payment, as payment.service.js getPaymentView answers
function payView(overrides = {}) {
  return { mode: 'demo', demo: true, amount: 300, fare: { total: 600, people: 2, share: 300 }, blocker: null, payment: null, canPay: true, pool: null, ...overrides };
}
const PAID = { id: 'p2', status: 'paid', amount: 300, mode: 'demo', bookingReference: 'FP-PAID2222' };
const renderTrips = () =>
  render(
    <MemoryRouter>
      <MyTripsPage />
    </MemoryRouter>,
  );

test('Pay is offered ONLY when the server says the booking can be paid now; otherwise the real status or a waiting message', async () => {
  const shared = makeRide();
  const otherTaxi = makeRide({ pool: makePool({ id: 'pool2' }) });
  const thirdTaxi = makeRide({ pool: makePool({ id: 'pool3' }) });
  const solo = makeRide({ mode: 'solo' });
  const booked = (id, destination, r, reference) => ({ ...makeTrip({ id, destination, booking: makeBooking(r, { reference }) }), ride: r });
  api.listMyTrips.mockResolvedValue([
    booked('paid1', 'Bandra West', shared, 'FP-PAID2222'),
    booked('open1', 'Juhu', otherTaxi, 'FP-OPEN2222'),
    booked('waiting1', 'Andheri West', thirdTaxi, 'FP-WAIT2222'),
    booked('pending1', 'Worli', solo, 'FP-PEND2222'),
  ]);
  const views = {
    paid1: payView({ payment: PAID, canPay: false }),
    open1: payView(),
    waiting1: payView({
      amount: null,
      canPay: false,
      blocker: { code: 'WAITING_FOR_BOOKINGS', message: 'Payment opens once everyone in your shared ride has booked - waiting for 1 traveller.' },
    }),
    pending1: payView({ payment: { id: 'p9', status: 'pending', amount: 600, mode: 'demo', bookingReference: 'FP-PEND2222' } }),
  };
  payApi.getPayment.mockImplementation((tripId) => Promise.resolve(views[tripId]));
  renderTrips();
  await screen.findByRole('heading', { name: 'To Bandra West' });
  expect(payApi.getPayment.mock.calls.map(([id]) => id).sort()).toEqual(['open1', 'paid1', 'pending1', 'waiting1']); // each booking asks for itself

  const paid = within(card('Bandra West'));
  expect(await paid.findByTestId('trip-payment')).toHaveTextContent('Paid (Demo) · ₹300');
  expect(paid.queryByRole('link', { name: /Pay your share|Continue payment/ })).not.toBeInTheDocument();
  expect(paid.getByRole('link', { name: 'Group chat' })).toHaveAttribute('href', '/trip/paid1/chat');

  const open = within(card('Juhu'));
  expect(await open.findByTestId('trip-payment')).toHaveTextContent('Not paid yet');
  expect(open.getByRole('link', { name: /Pay your share/ })).toHaveAttribute('href', '/trip/open1/summary#payment');
  expect(open.getByRole('link', { name: 'Group chat' })).toHaveAttribute('href', '/trip/open1/chat');

  // The shared taxi is still waiting for someone to book: a message, no button
  const waiting = within(card('Andheri West'));
  expect(await waiting.findByTestId('trip-payment')).toHaveTextContent('Waiting for others to book');
  expect(waiting.queryByRole('link', { name: /Pay your share|Continue payment/ })).not.toBeInTheDocument();
  expect(waiting.getByRole('link', { name: 'Group chat' })).toBeInTheDocument();

  // A solo booking with a payment already started
  const pending = within(card('Worli'));
  expect(await pending.findByTestId('trip-payment')).toHaveTextContent('Payment pending');
  expect(pending.getByRole('link', { name: /Continue payment/ })).toHaveAttribute('href', '/trip/pending1/summary#payment');
  expect(pending.queryByRole('link', { name: /Group chat/ })).not.toBeInTheDocument();
  // Each taxi's own chat is checked for new messages
  expect(chat.getMessages).toHaveBeenCalledWith('pool1', expect.anything());
  expect(chat.getMessages).toHaveBeenCalledWith('pool3', expect.anything());
});

test('payments switched off on the server: "Payments not available yet" and no Pay button', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  payApi.getPayment.mockResolvedValue(payView({ mode: 'off', demo: false, canPay: false }));
  renderTrips();
  const booked = within(await screen.findByRole('listitem', { name: 'To Bandra West' }));
  expect(await booked.findByTestId('trip-payment')).toHaveTextContent('Payments not available yet');
  expect(booked.queryByRole('link', { name: /Pay your share|Continue payment/ })).not.toBeInTheDocument();
});

test('a share that can’t be paid in the app (no fare estimate) gets no Pay button either', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  payApi.getPayment.mockResolvedValue(
    payView({ amount: null, canPay: false, blocker: { code: 'FARE_UNAVAILABLE', message: 'There is no fare estimate for this shared ride.' } }),
  );
  renderTrips();
  const booked = within(await screen.findByRole('listitem', { name: 'To Bandra West' }));
  expect(await booked.findByTestId('trip-payment')).toHaveTextContent('Can’t be paid in FlyPool yet');
  expect(booked.queryByRole('link', { name: /Pay your share/ })).not.toBeInTheDocument();
});

test('if the payment status can’t be loaded, trips still show - without a payment line or a guessed Pay button', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  payApi.getPayment.mockRejectedValue({ status: 500, code: 'SERVER_ERROR', message: 'Oops' });
  payApi.listMyPayments.mockRejectedValue({ status: 500, code: 'SERVER_ERROR', message: 'Oops' });
  renderTrips();
  const booked = within(await screen.findByRole('listitem', { name: 'To Bandra West' }));
  expect(booked.getByText('Booking confirmed')).toBeInTheDocument();
  await waitFor(() => expect(payApi.getPayment).toHaveBeenCalled());
  expect(booked.queryByTestId('trip-payment')).not.toBeInTheDocument();
  expect(booked.queryByRole('link', { name: /Pay your share/ })).not.toBeInTheDocument();
});

test('a cancelled booking shows what was recorded for it (and is never offered for payment)', async () => {
  api.listMyTrips.mockResolvedValue(TRIPS);
  payApi.listMyPayments.mockResolvedValue([
    { id: 'p7', tripId: 'cancelled1', bookingReference: 'FP-CANCEL22', status: 'paid', amount: 300, mode: 'demo' },
    { id: 'p6', tripId: 'cancelled1', bookingReference: 'FP-OLDREF22', status: 'paid', amount: 250, mode: 'demo' }, // an earlier booking
  ]);
  renderTrips();
  const cancelled = within(await screen.findByRole('listitem', { name: 'To Colaba' }));
  expect(await cancelled.findByTestId('trip-payment')).toHaveTextContent('Paid (Demo) · ₹300');
  expect(cancelled.queryByRole('link', { name: /Pay your share/ })).not.toBeInTheDocument();
  expect(payApi.getPayment).not.toHaveBeenCalledWith('cancelled1');
});
