// Phase 11: Ride Management - booking details, Cancel booking, Leave shared
// ride - through the real screens and a real FlyPool API
// (GET /trips/:id/booking, POST .../booking/cancel, POST .../booking/leave-pool).
// Runs for iOS and Android. Every booking, cancellation and pool change is
// made and checked by the server; nothing is mocked.
import fs from 'node:fs';
import path from 'node:path';
import nodeAxios from 'axios/dist/node/axios.cjs';
import { router } from 'expo-router';
import { screen, within } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { act, launchApp, newUserDetails, press, signedInUser, typeInto, waitFor } from './helpers';

const network = globalThis.network;
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
const PDF = fs.readFileSync(path.join(__dirname, 'fixtures', 'e-ticket.pdf'));

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
const manageView = async (token, trip) => (await server.get(`/trips/${trip.id}/booking`, as(token))).data.data;
const serverTrip = async (token, trip) => (await server.get(`/trips/${trip.id}`, as(token))).data.data.trip;

// This phone's passenger with a confirmed SOLO booking
async function soloBooking(details) {
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, uniqueSlot(), details);
  await choose(user.token, trip, { mode: 'solo', vehicleType: 'suv' });
  const booking = await book(user.token, trip);
  return { user, trip, booking };
}

// A confirmed SHARED booking: another passenger (host) and this phone's
// passenger, both booked in the same shared Sedan
async function sharedBooking() {
  const slot = uniqueSlot();
  const host = (await server.post('/auth/mobile/register', { ...newUserDetails(), name: 'Ravi Kumar' })).data.data;
  const hostTrip = await verifiedTrip(host.token, slot, { destination: 'Hiranandani Gardens, Powai' });
  const poolId = (await choose(host.token, hostTrip, { mode: 'shared', vehicleType: 'sedan' })).data.data.trip.poolId;
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, slot);
  await choose(user.token, trip, { mode: 'shared', vehicleType: 'sedan', poolId });
  const booking = await book(user.token, trip);
  await book(host.token, hostTrip);
  return { user, trip, booking, host, hostTrip, poolId };
}

function refreshControlOf(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.props?.refreshControl) return node.props.refreshControl;
  for (const child of node.children ?? []) {
    const found = refreshControlOf(child);
    if (found) return found;
  }
  return null;
}

async function openManage(trip) {
  await launchApp(`/trip/${trip.id}/manage`);
  await screen.findByTestId('ride-status');
}

// Ride Management refreshes itself every 30 s and the bell's count updates
// after an action - also while a test is waiting for the server. Those
// updates are expected, so React's act() checking is switched off outside
// RNTL's own act calls (as RNTL's waitFor does while it waits).
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});
afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.restoreAllMocks();
});

// ---- TEST 1 / 2: details ---------------------------------------------------------

test('a confirmed solo booking: details and status from the server; no Leave option', async () => {
  const { trip, booking } = await soloBooking({ destination: 'Juhu' });
  await openManage(trip);
  expect(screen.getByTestId('ride-status-label')).toHaveTextContent('Booking confirmed');
  expect(screen.getByTestId('manage-trip')).toHaveTextContent(/Mumbai Airport \(BOM\) · T2.*DestinationJuhu.*6E 2134/);
  expect(screen.getByTestId('manage-reference')).toHaveTextContent(booking.reference);
  expect(screen.getByTestId('manage-booking-status')).toHaveTextContent('Confirmed');
  expect(screen.getByTestId('manage-mode')).toHaveTextContent('Travel alone');
  expect(screen.getByTestId('manage-vehicle')).toHaveTextContent('SUV · up to 6 people');
  expect(screen.getByTestId('manage-party')).toHaveTextContent('1 person');
  expect(screen.getByTestId('ride-timeline')).toHaveTextContent(/Trip planned.*Flight verified.*Ride chosen.*Booking FP-\w+ confirmed/);
  expect(screen.getByTestId('cancel-booking')).toBeTruthy();
  expect(screen.queryByTestId('leave-pool')).toBeNull();
  expect(screen.queryByTestId('manage-chat')).toBeNull();
  expect(screen.queryByText(/Ride started|Ride scheduled|Driver/)).toBeNull(); // no made-up statuses
});

test('a confirmed shared booking: the other members (no names), Leave and the group chat offered', async () => {
  const { trip } = await sharedBooking();
  await openManage(trip);
  const members = screen.getByTestId('manage-travellers');
  expect(members).toHaveTextContent(/In your shared ride now.*You1 person/);
  expect(within(members).getAllByTestId('manage-traveller')).toHaveLength(1);
  expect(within(members).getByTestId('manage-traveller')).toHaveTextContent(/1 person · 6E 2134 · lands same time as you/);
  expect(screen.queryByText(/Ravi|Asha Verma/)).toBeNull();
  expect(screen.getByTestId('manage-mode')).toHaveTextContent('Pool with others');
  expect(screen.getByTestId('leave-pool')).toBeTruthy();
  expect(screen.getByTestId('manage-chat')).toBeTruthy();
});

// ---- TEST 3 / 4 / 10 / 11: cancelling ------------------------------------------------

test('cancel booking: confirm (or go back), reason saved, shown only after the server; stays in My Trips', async () => {
  const { user, trip, booking } = await soloBooking({ destination: 'Bandra West' });
  await openManage(trip);

  // "Keep booking" goes back without changing anything
  await press(screen.getByTestId('cancel-booking'));
  expect(screen.getByTestId('cancel-sheet')).toHaveTextContent(new RegExp(`Booking ${booking.reference} and its trip will be cancelled`));
  await press(screen.getByTestId('cancel-sheet-back'));
  expect(network.requests.filter((r) => r.url.includes('/booking/'))).toHaveLength(0);

  await press(screen.getByTestId('cancel-booking'));
  await typeInto(screen.getByLabelText('Reason (optional)'), 'My flight changed');
  await press(screen.getByTestId('cancel-sheet-confirm'));
  expect(await screen.findByTestId('manage-done')).toHaveTextContent(/Booking cancelled/);
  expect(screen.getByTestId('ride-status-label')).toHaveTextContent('Cancelled');
  expect(screen.getByTestId('manage-reason')).toHaveTextContent('My flight changed');
  expect(screen.getByTestId('manage-cancellation')).toHaveTextContent(/no cancellation fees or refunds/);
  expect(screen.queryByTestId('cancel-booking')).toBeNull();
  const post = network.requests.find((r) => r.method === 'POST' && r.url.includes('/booking/'));
  expect([post.url, JSON.parse(post.data), post.authorization]).toEqual([`/trips/${trip.id}/booking/cancel`, { reason: 'My flight changed' }, `Bearer ${user.token}`]);

  // In the database: cancelled, not deleted
  const saved = await serverTrip(user.token, trip);
  expect(saved.status).toBe('cancelled');
  expect(saved.booking).toMatchObject({ reference: booking.reference, status: 'cancelled', cancelReason: 'My flight changed' });

  // My Trips keeps it, under Cancelled
  await press(screen.getByLabelText(`Account menu for ${user.name}`));
  await press(screen.getByTestId('menu-trips'));
  const cancelled = await screen.findByTestId('trips-cancelled');
  expect(cancelled).toHaveTextContent(/Cancelled1.*Bandra West/);
  expect(within(cancelled).getByTestId('trip-booking')).toHaveTextContent(`Booking ${booking.reference} · Cancelled`);
});

test('cancelling twice: one request while busy; already cancelled elsewhere -> told so, screen refreshed', async () => {
  const { user, trip } = await soloBooking();
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.method === 'post') await gate;
    return adapter(config);
  });
  await openManage(trip);
  await press(screen.getByTestId('cancel-booking'));
  await press(screen.getByTestId('cancel-sheet-confirm'));
  await press(screen.getByTestId('cancel-sheet-confirm'));
  await press(screen.getByTestId('cancel-sheet-confirm'));
  await act(async () => release());
  expect(await screen.findByTestId('manage-done')).toBeTruthy();
  expect(network.requests.filter((r) => r.method === 'POST' && r.url.endsWith('/booking/cancel'))).toHaveLength(1);

  // The same cancellation again: refused, nothing changes
  const again = await server.post(`/trips/${trip.id}/booking/cancel`, {}, as(user.token)).catch((e) => e.response);
  expect([again.status, again.data.error.code]).toEqual([409, 'BOOKING_ALREADY_CANCELLED']);
});

test('a screen still showing a booking cancelled on another device: the app says so and refreshes', async () => {
  const { user, trip } = await soloBooking();
  await openManage(trip);
  await server.post(`/trips/${trip.id}/booking/cancel`, { reason: 'from the website' }, as(user.token));
  await press(screen.getByTestId('cancel-booking'));
  await press(screen.getByTestId('cancel-sheet-confirm'));
  expect(await screen.findByTestId('manage-error')).toHaveTextContent(/This booking is already cancelled\./);
  await waitFor(() => expect(screen.getByTestId('ride-status-label')).toHaveTextContent('Cancelled'));
  expect(screen.getByTestId('manage-reason')).toHaveTextContent('from the website');
});

test('a cancelled booking is shown the same after opening the app again (from the server)', async () => {
  const { user, trip, booking } = await soloBooking();
  await server.post(`/trips/${trip.id}/booking/cancel`, { reason: 'Earlier session' }, as(user.token));
  await openManage(trip);
  expect(screen.getByTestId('ride-status-label')).toHaveTextContent('Cancelled');
  expect(screen.getByTestId('manage-reference')).toHaveTextContent(booking.reference);
  expect(screen.getByTestId('ride-timeline')).toHaveTextContent(new RegExp(`Booking ${booking.reference} cancelled`));
});

test('a lost connection while cancelling: not shown as cancelled; nothing changed on the server', async () => {
  const { user, trip } = await soloBooking();
  await openManage(trip);
  network.mode = 'offline';
  await press(screen.getByTestId('cancel-booking'));
  await press(screen.getByTestId('cancel-sheet-confirm'));
  expect(await screen.findByTestId('manage-error')).toHaveTextContent(/The booking wasn’t cancelled/);
  expect(screen.queryByTestId('manage-done')).toBeNull();
  network.mode = 'online';
  expect((await serverTrip(user.token, trip)).booking.status).toBe('confirmed');
});

// ---- TEST 5 / 6: not allowed ----------------------------------------------------------

test('someone else’s booking: not found, nothing to cancel; the server refuses it too', async () => {
  const theirs = await sharedBooking(); // booked by the host (and this phone's first user)
  const outsider = await signedInUser();
  await launchApp(`/trip/${theirs.hostTrip.id}/manage`);
  expect(await screen.findByText('Booking not found')).toBeTruthy();
  expect(screen.queryByTestId('cancel-booking')).toBeNull();
  const refused = await server.post(`/trips/${theirs.hostTrip.id}/booking/cancel`, {}, as(outsider.token)).catch((e) => e.response);
  expect([refused.status, refused.data.error.code]).toEqual([404, 'TRIP_NOT_FOUND']);
});

test('a ride whose arrival time has passed can’t be cancelled (FlyPool has no "completed" state yet)', async () => {
  // A flight that landed 30 minutes ago today (Mumbai time)
  const now = new Date(Date.now() + 330 * 60 * 1000);
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes() - 30;
  if (minutes < 0) return; // just after midnight in Mumbai: "30 minutes ago" was yesterday
  const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, { travelDate: todayInMumbai(), time });
  await choose(user.token, trip, { mode: 'solo', vehicleType: 'sedan' });
  await book(user.token, trip);

  await openManage(trip);
  expect(screen.getByTestId('ride-status-label')).toHaveTextContent('Arrival time passed');
  expect(screen.queryByTestId('cancel-booking')).toBeNull();
  expect(screen.getByTestId('cancel-unavailable')).toHaveTextContent('The arrival time has passed, so this booking can no longer be changed or cancelled.');
  const refused = await server.post(`/trips/${trip.id}/booking/cancel`, {}, as(user.token)).catch((e) => e.response);
  expect([refused.status, refused.data.error.code]).toEqual([409, 'TRIP_IN_PAST']);
});

// ---- TEST 7 / 8 / 9: leaving a shared ride --------------------------------------------

test('leave the shared ride: the trip goes on, the booking ends (kept), the chat closes for them', async () => {
  const { user, trip, booking, host, hostTrip, poolId } = await sharedBooking();
  await server.post(`/pools/${poolId}/messages`, { text: 'Hello from Ravi', clientMessageId: require('node:crypto').randomUUID() }, as(host.token));
  await openManage(trip);

  await press(screen.getByTestId('leave-pool'));
  expect(screen.getByTestId('leave-sheet')).toHaveTextContent(/Your trip stays.*lose access to this ride’s group chat/);
  await press(screen.getByTestId('leave-sheet-confirm'));
  expect(await screen.findByTestId('manage-done')).toHaveTextContent(new RegExp(`You left the shared ride.*Booking ${booking.reference} has ended`));
  expect(screen.getByTestId('ride-status-label')).toHaveTextContent('Not booked');
  expect(screen.getByTestId('manage-past')).toHaveTextContent(new RegExp(`${booking.reference}.*Ended - you left the shared ride`));
  expect(screen.getByTestId('ride-timeline')).toHaveTextContent(/Left the shared ride/);

  // Server: trip active again, booking kept as history, out of the pool
  const mine = await serverTrip(user.token, trip);
  expect(mine.status).toBe('flight_verified');
  expect(mine.booking).toBeNull();
  expect(mine.pastBookings).toEqual([expect.objectContaining({ reference: booking.reference, status: 'left_pool' })]);
  // The host sees the updated membership and was told
  const hostView = await manageView(host.token, hostTrip);
  expect(hostView.ride.pool.others).toHaveLength(0);
  expect((await server.get('/notifications', as(host.token))).data.data.notifications[0].type).toBe('pool_left');
  // The former member can't read or write the chat any more; the host keeps it
  const denied = await server.get(`/pools/${poolId}/messages`, as(user.token)).catch((e) => e.response);
  expect([denied.status, denied.data.error.code]).toEqual([404, 'CHAT_NOT_FOUND']);
  await act(async () => router.push({ pathname: '/chat/[poolId]', params: { poolId } }));
  expect(await screen.findByText('This chat isn’t available')).toBeTruthy();
  expect((await server.get(`/pools/${poolId}/messages`, as(host.token))).data.data.messages.map((m) => m.text)).toEqual(['Hello from Ravi']);
});

test('after leaving, the trip can be booked again; "Choose a new ride" leads there', async () => {
  const { user, trip, booking } = await sharedBooking();
  await openManage(trip);
  await press(screen.getByTestId('leave-pool'));
  await press(screen.getByTestId('leave-sheet-confirm'));
  await press(await screen.findByTestId('choose-new-ride'));
  expect(await screen.findByTestId('ride-trip')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/ride`);
  await choose(user.token, trip, { mode: 'solo', vehicleType: 'sedan' });
  const rebooked = await book(user.token, trip);
  expect(rebooked.reference).not.toBe(booking.reference);
  expect((await serverTrip(user.token, trip)).pastBookings[0].reference).toBe(booking.reference);
});

test('a remaining member sees the updated shared ride after someone leaves (pull to refresh)', async () => {
  const { user, trip, host, hostTrip } = await sharedBooking();
  // This phone's passenger stays; the host leaves on their own phone
  await openManage(trip);
  expect(within(screen.getByTestId('manage-travellers')).getAllByTestId('manage-traveller')).toHaveLength(1);
  await server.post(`/trips/${hostTrip.id}/booking/leave-pool`, {}, as(host.token));

  // Pull down: the scroll view's refreshControl (the native control itself
  // isn't rendered in tests, so its onRefresh is called directly)
  await act(async () => refreshControlOf(screen.getByTestId('screen')).props.onRefresh());
  await waitFor(() => expect(within(screen.getByTestId('manage-travellers')).queryAllByTestId('manage-traveller')).toHaveLength(0));
  expect(screen.getByTestId('manage-travellers')).toHaveTextContent(/Nobody else is in this shared ride now./);
  expect((await server.get('/notifications', as(user.token))).data.data.notifications[0].type).toBe('pool_left');
});

test('My Trips: a booked ride is listed under Booked rides and opens Ride Management', async () => {
  const { trip, booking } = await soloBooking({ destination: 'Worli' });
  await launchApp('/trips');
  const booked = await screen.findByTestId('trips-booked');
  expect(booked).toHaveTextContent(/Booked rides1.*Booked.*Worli.*6E 2134.*Ride: Travel Alone · SUV/);
  await press(within(booked).getByLabelText(/^Trip to Worli/));
  expect(await screen.findByTestId('manage-reference')).toHaveTextContent(booking.reference);
  expect(screen).toHavePathname(`/trip/${trip.id}/manage`);
});
