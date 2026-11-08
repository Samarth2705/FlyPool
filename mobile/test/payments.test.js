// Phase 12: payments and fare splitting (DEMO MODE), through the real screens
// and a real FlyPool API (GET/POST /trips/:id/payment, POST
// /payments/:id/demo-result, GET /payments, POST /payments/webhook).
// Runs for iOS and Android. Every amount and status comes from the server;
// the demo checkout's result is decided by the server too. No real money.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nodeAxios from 'axios/dist/node/axios.cjs';
import { Alert as NativeAlert, StyleSheet } from 'react-native';
import { screen, within } from 'expo-router/testing-library';
import api from '../src/api/client';
import { darkColors } from '../src/theme';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { formatRupees } from '../src/shared/format';
import { act, launchApp, newUserDetails, press, signedInUser, typeInto, waitFor } from './helpers';

const network = globalThis.network;
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
const PDF = fs.readFileSync(path.join(__dirname, 'fixtures', 'e-ticket.pdf'));
const WEBHOOK_SECRET = 'mobile-test-webhook-secret'; // scripts/test-api.mjs

const randomIp = () => `10.${200 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const server = nodeAxios.create({
  baseURL: api.defaults.baseURL,
  headers: { 'X-Forwarded-For': randomIp() },
  httpAgent: new (require('node:http').Agent)({ keepAlive: false }),
});
const as = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

function uniqueSlot() {
  const minutes = 6 * 60 + 5 * Math.floor(Math.random() * 168);
  return {
    travelDate: addDays(todayInMumbai(), 20 + Math.floor(Math.random() * 340)),
    time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  };
}

async function verifiedTrip(token, slot, details = {}) {
  const body = {
    pickupLocation: AIRPORT,
    pickupTerminal: 'T2',
    destination: 'Powai',
    travelDate: slot.travelDate,
    expectedArrivalTime: slot.time,
    passengerCount: 1,
    luggageCount: 1,
    openToPooling: true,
    ...details,
  };
  const trip = (await server.post('/trips', body, as(token))).data.data.trip;
  const verification = {
    airline: 'IndiGo',
    flightNumber: '6E 2134',
    scheduledArrivalTime: slot.time,
    document: { mimeType: 'application/pdf', dataBase64: PDF.toString('base64') },
  };
  return (await server.post(`/trips/${trip.id}/verification`, verification, as(token))).data.data.trip;
}

const choose = (token, trip, ride) => server.put(`/trips/${trip.id}/ride`, ride, as(token));
const book = async (token, trip) => (await server.post(`/trips/${trip.id}/booking`, {}, as(token))).data.data.booking;
const paymentView = async (token, trip) => (await server.get(`/trips/${trip.id}/payment`, as(token))).data.data;
const startPay = async (token, trip) => (await server.post(`/trips/${trip.id}/payment`, {}, as(token))).data.data.payment;
const demoResult = (token, id, outcome) => server.post(`/payments/${id}/demo-result`, { outcome }, as(token));

async function soloBooking(details) {
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, uniqueSlot(), details);
  await choose(user.token, trip, { mode: 'solo', vehicleType: 'sedan' });
  const booking = await book(user.token, trip);
  return { user, trip, booking };
}

// A shared Sedan with another passenger ("host") and this phone's passenger;
// both booked unless hostBooks is false
async function sharedBooking({ hostBooks = true } = {}) {
  const slot = uniqueSlot();
  const host = (await server.post('/auth/mobile/register', newUserDetails())).data.data;
  const hostTrip = await verifiedTrip(host.token, slot, { destination: 'Hiranandani Gardens, Powai' });
  const poolId = (await choose(host.token, hostTrip, { mode: 'shared', vehicleType: 'sedan' })).data.data.trip.poolId;
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, slot);
  await choose(user.token, trip, { mode: 'shared', vehicleType: 'sedan', poolId });
  const booking = await book(user.token, trip);
  if (hostBooks) await book(host.token, hostTrip);
  return { user, trip, booking, host, hostTrip };
}

async function openPayment(trip) {
  await launchApp(`/trip/${trip.id}/payment`);
  await screen.findByTestId('payment-hero');
}

// Webhook as a provider sends it: signed raw body (Razorpay format)
function webhook(event, orderId, paise) {
  const raw = JSON.stringify({ entity: 'event', event, payload: { payment: { entity: { id: `pay_${crypto.randomBytes(5).toString('hex')}`, order_id: orderId, amount: paise, currency: 'INR' } } } });
  const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
  return server.post('/payments/webhook', raw, {
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature, 'X-Razorpay-Event-Id': crypto.randomUUID() },
    transformRequest: [(d) => d],
  });
}

const status = () => screen.getByTestId('payment-status');

// The payment screens refresh after actions while tests also talk to the
// server; those updates are expected (see test/chat.test.js)
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});
afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.restoreAllMocks();
});

// ---- 1: solo ------------------------------------------------------------------------

test('solo ride: the whole fare is the passenger’s; demo payment succeeds; the server records it', async () => {
  const { user, trip, booking } = await soloBooking({ destination: 'Juhu' });
  const server_ = await paymentView(user.token, trip);
  await launchApp(`/trip/${trip.id}/manage`);
  await press(await screen.findByTestId('manage-payment')); // entry point: Ride Management
  await screen.findByTestId('payment-hero');

  expect(screen.getByTestId('demo-banner')).toHaveTextContent(/No real money is charged or transferred/);
  expect(screen.getByTestId('payment-amount')).toHaveTextContent(formatRupees(server_.amount));
  expect(screen.getByTestId('payment-total')).toHaveTextContent(formatRupees(server_.fare.total));
  expect(screen.getByTestId('payment-share')).toHaveTextContent(formatRupees(server_.fare.total)); // solo: all of it
  expect(screen.getByTestId('payment-people')).toHaveTextContent('1 person');
  expect(screen.getByTestId('payment-reference')).toHaveTextContent(booking.reference);
  expect(screen.getByTestId('payment-mode')).toHaveTextContent('Solo');
  expect(screen.getByTestId('payment-vehicle')).toHaveTextContent('Sedan');
  expect(status()).toHaveTextContent('Not paid yet');

  await press(screen.getByTestId('pay'));
  const checkout = await screen.findByTestId('demo-checkout');
  expect(checkout).toHaveTextContent(/This is a simulated payment.*no card, UPI or bank details/);
  await press(screen.getByTestId('demo-success'));
  expect(await screen.findByTestId('payment-result')).toHaveTextContent(/Payment successful \(demo\).*No real money was transferred/);
  await waitFor(() => expect(status()).toHaveTextContent('Paid'));
  expect(screen.queryByTestId('pay')).toBeNull(); // can't pay twice
  const start = network.requests.find((r) => r.method === 'POST' && r.url === `/trips/${trip.id}/payment`);
  expect(JSON.parse(start.data)).toEqual({}); // the app never sends an amount
  expect(start.authorization).toBe(`Bearer ${user.token}`);
  const saved = await paymentView(user.token, trip);
  expect(saved.payment).toMatchObject({ status: 'paid', amount: server_.amount, mode: 'demo', bookingReference: booking.reference });
});

// ---- 2 / 3 / 4: pooled -------------------------------------------------------------

test('pooled ride: my share; I pay while the other is pending; then everyone has paid', async () => {
  const { user, trip, host, hostTrip } = await sharedBooking();
  const mine = await paymentView(user.token, trip);
  const hostShare = mine.pool.members.find((m) => !m.isYou).share;
  expect(mine.pool.members.reduce((s, m) => s + m.share, 0)).toBe(mine.pool.total); // shares add up
  await openPayment(trip);
  expect(screen.getByTestId('payment-people')).toHaveTextContent('2 people');
  expect(screen.getByTestId('payment-share')).toHaveTextContent(formatRupees(mine.amount));
  expect(screen.getByTestId('payment-mode')).toHaveTextContent('Pool');
  const members = () => screen.getAllByTestId('payment-member');
  // You first, then the other booking (by area - no name); each row's value: share · status
  expect(screen.getByText('You')).toBeTruthy();
  expect(screen.getByText('Traveller 1 · Powai')).toBeTruthy();
  expect(members()[0]).toHaveTextContent(`${formatRupees(mine.amount)} · Not paid`);
  expect(members()[1]).toHaveTextContent(`${formatRupees(hostShare)} · Not paid`);

  await press(screen.getByTestId('pay'));
  await press(await screen.findByTestId('demo-success'));
  await waitFor(() => expect(status()).toHaveTextContent('Paid'));
  // One paid, one pending
  expect(members()[0]).toHaveTextContent(/· Paid/);
  expect(members()[1]).toHaveTextContent(/· Not paid/);
  expect(screen.getByTestId('payment-collected')).toHaveTextContent(formatRupees(mine.amount));
  expect(screen.getByTestId('payment-outstanding')).toHaveTextContent(formatRupees(hostShare));
  expect(screen.queryByText(/Asha Verma|@example/)).toBeNull();

  // The other passenger pays on their phone -> shown after refreshing
  await demoResult(host.token, (await startPay(host.token, hostTrip)).id, 'success');
  await act(async () => refreshControlOf(screen.getByTestId('screen')).props.onRefresh());
  await waitFor(() => expect(members()[1]).toHaveTextContent(/· Paid/));
  expect(screen.getByTestId('payment-outstanding')).toHaveTextContent(formatRupees(0));
  expect(screen.getByTestId('payment-collected')).toHaveTextContent(formatRupees(mine.pool.total));
});

test('pooled ride: payment opens only when everyone in the shared ride has booked', async () => {
  const { trip } = await sharedBooking({ hostBooks: false });
  await openPayment(trip);
  expect(screen.getByTestId('payment-blocker')).toHaveTextContent(/Payment opens once everyone in your shared ride has booked - waiting for 1 traveller\./);
  expect(screen.queryByTestId('pay')).toBeNull();
  expect(screen.getAllByTestId('payment-member')[1]).toHaveTextContent(/Not booked yet/);
});

// ---- 5 / 6 / 7: failure, cancellation, duplicates ----------------------------------

test('a failed payment can be tried again; a cancelled one charges nothing; attempts are listed', async () => {
  const { user, trip } = await soloBooking();
  await openPayment(trip);
  await press(screen.getByTestId('pay'));
  await press(await screen.findByTestId('demo-failure'));
  expect(await screen.findByTestId('payment-result')).toHaveTextContent(/Payment failed \(demo\).*Nothing was charged/);
  await waitFor(() => expect(status()).toHaveTextContent('Failed'));

  await press(screen.getByTestId('pay')); // try again: a new attempt
  await press(await screen.findByTestId('demo-cancel'));
  expect(await screen.findByTestId('payment-result')).toHaveTextContent(/Payment cancelled.*Nothing was charged/);
  await waitFor(() => expect(status()).toHaveTextContent('Cancelled'));

  await press(screen.getByTestId('pay'));
  await press(await screen.findByTestId('demo-success'));
  await waitFor(() => expect(status()).toHaveTextContent('Paid'));
  const history = (await paymentView(user.token, trip)).history.map((p) => p.status);
  expect(history).toEqual(['paid', 'cancelled', 'failed']); // newest first
  expect(within(screen.getByTestId('payment-history')).getAllByText(/demo/)).toHaveLength(3);
});

test('pressing Pay repeatedly opens one payment; asking again returns the same open payment', async () => {
  const { user, trip } = await soloBooking();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.method === 'post' && config.url.endsWith('/payment')) await gate;
    return adapter(config);
  });
  await openPayment(trip);
  await press(screen.getByTestId('pay'));
  await press(screen.getByTestId('pay'));
  await press(screen.getByTestId('pay'));
  await act(async () => release());
  await screen.findByTestId('demo-checkout');
  expect(network.requests.filter((r) => r.method === 'POST' && r.url.endsWith('/payment'))).toHaveLength(1);
  // The same request again (e.g. after a lost answer): the same payment
  const open = await paymentView(user.token, trip);
  expect((await startPay(user.token, trip)).id).toBe(open.payment.id);
  expect(open.history).toHaveLength(1);
});

// ---- 11: cancelling the booking during a payment -----------------------------------

test('the booking is cancelled while paying: the payment can’t succeed, nothing is charged', async () => {
  const { user, trip } = await soloBooking();
  await openPayment(trip);
  await press(screen.getByTestId('pay'));
  await screen.findByTestId('demo-checkout');
  await server.post(`/trips/${trip.id}/booking/cancel`, {}, as(user.token)); // on another device
  await press(screen.getByTestId('demo-success'));
  await waitFor(() => expect(status()).toHaveTextContent('Cancelled'));
  expect(screen.queryByTestId('pay')).toBeNull();
  expect(screen.getByTestId('payment-blocker')).toHaveTextContent(/no confirmed booking/);
  const view = await paymentView(user.token, trip);
  expect(view.history.map((p) => [p.status, p.failureReason])).toEqual([['cancelled', 'booking_cancelled']]);
});

// ---- 13: network interruption -------------------------------------------------------

test('the answer to "pay" is lost: the app doesn’t claim anything; after reconnecting the server’s status shows', async () => {
  const { user, trip } = await soloBooking();
  await openPayment(trip);
  await press(screen.getByTestId('pay'));
  await screen.findByTestId('demo-checkout');
  network.mode = 'lose-response'; // the server records success, the app never hears back
  await press(screen.getByTestId('demo-success'));
  expect(await screen.findByTestId('payment-error')).toHaveTextContent(/won’t be charged twice/);
  expect(screen.queryByTestId('payment-result')).toBeNull(); // no success claimed by the app
  network.mode = 'online';
  await act(async () => refreshControlOf(screen.getByTestId('screen')).props.onRefresh());
  await waitFor(() => expect(status()).toHaveTextContent('Paid'));
  expect((await paymentView(user.token, trip)).history).toHaveLength(1); // one payment, not two
});

// ---- provider webhook statuses -----------------------------------------------------

test('a payment confirmed by a signed provider webhook shows Processing, then Paid', async () => {
  const { user, trip } = await soloBooking();
  const payment = await startPay(user.token, trip);
  await webhook('payment.authorized', payment.providerOrderId, payment.amount * 100);
  await openPayment(trip);
  expect(status()).toHaveTextContent('Processing');
  await webhook('payment.captured', payment.providerOrderId, payment.amount * 100);
  await act(async () => refreshControlOf(screen.getByTestId('screen')).props.onRefresh());
  await waitFor(() => expect(status()).toHaveTextContent('Paid'));
});

// ---- 10: someone else's payment ---------------------------------------------------

test('another passenger’s payment can’t be seen or completed', async () => {
  const theirs = await soloBooking();
  const theirPayment = await startPay(theirs.user.token, theirs.trip);
  const me = await signedInUser();
  await launchApp(`/trip/${theirs.trip.id}/payment`);
  expect(await screen.findByText('Payment not found')).toBeTruthy();
  const refused = await demoResult(me.token, theirPayment.id, 'success').catch((e) => e.response);
  expect([refused.status, refused.data.error.code]).toEqual([404, 'PAYMENT_NOT_FOUND']);
  expect((await paymentView(theirs.user.token, theirs.trip)).payment.status).toBe('pending');
});

// ---- 12 / 14: persistence ------------------------------------------------------------

test('a payment made earlier shows as Paid when the app is opened again', async () => {
  const { user, trip } = await soloBooking();
  await demoResult(user.token, (await startPay(user.token, trip)).id, 'success');
  await openPayment(trip);
  expect(status()).toHaveTextContent('Paid');
  expect(screen.queryByTestId('pay')).toBeNull();
});

test('payment history after logging out and in again; paid stays paid when the booking is cancelled', async () => {
  const { user, trip, booking } = await soloBooking({ destination: 'Worli' });
  const payment = await startPay(user.token, trip);
  await demoResult(user.token, payment.id, 'success');
  await server.post(`/trips/${trip.id}/booking/cancel`, {}, as(user.token));

  await launchApp('/settings');
  await screen.findByText('Appearance');
  jest.spyOn(NativeAlert, 'alert').mockImplementation((t, m, buttons) => buttons.find((b) => b.style === 'destructive').onPress());
  await press(screen.getByTestId('settings-logout'));
  await typeInto(await screen.findByLabelText('Email'), user.email);
  await typeInto(screen.getByLabelText('Password'), user.password);
  await press(screen.getByText('Log in'));
  await screen.findByText('Where are you headed?');

  await press(screen.getByLabelText(`Account menu for ${user.name}`));
  await press(screen.getByTestId('menu-trips'));
  await press(await screen.findByTestId('payment-history'));
  const row = await screen.findByTestId('payment-row');
  expect(row).toHaveTextContent(new RegExp(`${booking.reference}${formatRupees(payment.amount).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*Solo · Sedan · to Worli.*Paid.*Demo - no money moved`));
  await press(row);
  await waitFor(() => expect(status()).toHaveTextContent('Paid'));
  expect(screen.getByTestId('refund-note')).toHaveTextContent(/Refunds aren’t processed in the app yet, so no refund has been made\./);
});

test('the payment screen follows dark mode', async () => {
  const { trip } = await soloBooking();
  require('expo-secure-store').__store.set('flypool.theme', 'dark');
  await openPayment(trip);
  expect(StyleSheet.flatten(screen.getByTestId('screen').props.style).backgroundColor).toBe(darkColors.background);
});

function refreshControlOf(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.refreshControl) return node.props.refreshControl;
  for (const child of node.children ?? []) {
    const found = refreshControlOf(child);
    if (found) return found;
  }
  return null;
}
