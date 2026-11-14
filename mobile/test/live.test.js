// Live pooling with several passengers at once, through the real ride screens
// and a real FlyPool API. The phone is User A; Users B, C and D are other
// accounts acting through the API (as their own phones would - every one of
// their "ride screens" is a GET /trips/:id/live check).
// Updates arrive by POLLING (about every 4 s), so the tests wait for them.
import { AppState } from 'react-native';
import nodeAxios from 'axios/dist/node/axios.cjs';
import { screen } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { describeChange } from '../src/live/useLiveRide';
import { act, launchApp, newUserDetails, press, signedInUser, waitFor } from './helpers';
import { ticketFor } from './tickets';

const network = globalThis.network;
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
const LIVE_WAIT = { timeout: 15_000 }; // a few polling rounds
const randomIp = () => `10.${200 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const server = nodeAxios.create({
  baseURL: api.defaults.baseURL,
  headers: { 'X-Forwarded-For': randomIp() },
  httpAgent: new (require('node:http').Agent)({ keepAlive: false }),
  validateStatus: () => true,
});
const as = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const wait = (ms) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

function uniqueSlot() {
  const minutes = 6 * 60 + 5 * Math.floor(Math.random() * 168);
  return {
    travelDate: addDays(todayInMumbai(), 20 + Math.floor(Math.random() * 340)),
    time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  };
}

async function verifiedTrip(token, slot, details = {}) {
  const body = { pickupLocation: AIRPORT, pickupTerminal: 'T2', destination: 'Powai', travelDate: slot.travelDate, expectedArrivalTime: slot.time, passengerCount: 1, luggageCount: 1, openToPooling: true, ...details };
  const trip = (await server.post('/trips', body, as(token))).data.data.trip;
  const verification = { airline: 'IndiGo', flightNumber: '6E 2134', scheduledArrivalTime: slot.time, document: await ticketFor(token, trip) };
  return (await server.post(`/trips/${trip.id}/verification`, verification, as(token))).data.data.trip;
}

// Another passenger with a verified trip on the same slot; `screen()` = their app's live check
async function otherPassenger(slot, details) {
  const { token } = (await server.post('/auth/mobile/register', newUserDetails())).data.data;
  const trip = await verifiedTrip(token, slot, details);
  return {
    token,
    trip,
    onScreen: () => server.get(`/trips/${trip.id}/live`, as(token)),
    leaveScreen: () => server.delete(`/trips/${trip.id}/live`, as(token)),
    choose: (choice) => server.put(`/trips/${trip.id}/ride`, choice, as(token)),
  };
}

const liveRequests = (trip) => network.requests.filter((r) => r.method === 'GET' && r.url === `/trips/${trip.id}/live`);

// The app's AppState: background / foreground, as the phone reports it
function appStateControl() {
  const spy = jest.spyOn(AppState, 'addEventListener');
  const original = AppState.currentState;
  return {
    set(state) {
      AppState.currentState = state;
      for (const [event, handler] of spy.mock.calls) if (event === 'change') handler(state);
    },
    restore() {
      AppState.currentState = original;
    },
  };
}

async function openRide(slot) {
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, slot);
  await launchApp(`/trip/${trip.id}/ride`);
  await screen.findByTestId('mode-shared');
  await press(screen.getByTestId('mode-shared'));
  await press(screen.getByTestId('vehicle-sedan'));
  return { user, trip };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});
afterEach(() => jest.restoreAllMocks());

// ---- 1-5: who else is choosing --------------------------------------------------------

test('1-5. the count of other compatible passengers updates by itself as they arrive and leave', async () => {
  const slot = uniqueSlot();
  const B = await otherPassenger(slot);
  const C = await otherPassenger(slot);
  const elsewhere = await otherPassenger(slot, { destination: 'Colaba' }); // not on the way
  await B.onScreen();
  await elsewhere.onScreen();
  await openRide(slot); // A

  expect(await screen.findByText('1 other passenger on a compatible flight is also choosing a ride.', {}, LIVE_WAIT)).toBeTruthy();
  // B sees A too (the server's count, never A itself)
  expect((await B.onScreen()).data.data.activity.othersConsidering).toBe(1);

  await C.onScreen();
  expect(await screen.findByText('2 other passengers on compatible flights are also choosing a ride.', {}, LIVE_WAIT)).toBeTruthy();

  await B.leaveScreen();
  expect(await screen.findByText('1 other passenger on a compatible flight is also choosing a ride.', {}, LIVE_WAIT)).toBeTruthy();
});

// ---- 6-10: shared rides appear and change without a manual refresh ---------------------------

test('6-10. a new shared ride appears on its own; joining and filling it update the seats; full rides disappear', async () => {
  const slot = uniqueSlot();
  const B = await otherPassenger(slot);
  const C = await otherPassenger(slot, { passengerCount: 2 });
  await openRide(slot); // A, choosing "Pool with others" + Sedan

  // B starts a shared sedan
  const poolId = (await B.choose({ mode: 'shared', vehicleType: 'sedan' })).data.data.trip.poolId;
  expect(await screen.findByText('Someone just started a shared ride for your flight!', {}, LIVE_WAIT)).toBeTruthy();
  expect(await screen.findByTestId(`pool-${poolId}`, {}, LIVE_WAIT)).toHaveTextContent(/1 seat of 4 taken/);

  // C (2 people) joins: the seats A sees change by themselves - 1 left
  await C.choose({ mode: 'shared', vehicleType: 'sedan', poolId });
  await waitFor(() => expect(screen.getByTestId(`pool-${poolId}`)).toHaveTextContent(/3 seats of 4 taken/), LIVE_WAIT);
  expect(screen.getByTestId('pool-last-seat')).toHaveTextContent('Only 1 seat remaining in this shared ride.');

  // Someone else takes the last seat: full, so it's no longer offered to A
  const D = await otherPassenger(slot);
  await D.choose({ mode: 'shared', vehicleType: 'sedan', poolId });
  await waitFor(() => expect(screen.queryByTestId(`pool-${poolId}`)).toBeNull(), LIVE_WAIT);
  expect(screen.getByText('A shared ride you could join is now full or no longer available.')).toBeTruthy();
});

test('your own shared ride: someone joining, the last seat and "full" are shown as they happen', async () => {
  const slot = uniqueSlot();
  const B = await otherPassenger(slot, { luggageCount: 0 }); // seats, not bags, fill this sedan (it takes 3 bags)
  const poolId = (await B.choose({ mode: 'shared', vehicleType: 'sedan' })).data.data.trip.poolId;
  // A is in B's shared ride (chosen earlier) and has the ride screen open
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, slot, { luggageCount: 0 });
  await server.put(`/trips/${trip.id}/ride`, { mode: 'shared', vehicleType: 'sedan', poolId }, as(user.token));
  await launchApp(`/trip/${trip.id}/ride`);
  await waitFor(() => expect(liveRequests(trip).length).toBeGreaterThanOrEqual(1), LIVE_WAIT);

  // C joins A's ride: told, and the ride's numbers come from the server
  const C = await otherPassenger(slot, { luggageCount: 0 });
  await C.choose({ mode: 'shared', vehicleType: 'sedan', poolId });
  expect(await screen.findByText('Another passenger has joined your shared ride.', {}, LIVE_WAIT)).toBeTruthy();
  await waitFor(async () => {
    const mine = (await server.get(`/trips/${trip.id}/live`, as(user.token))).data.data.myPool;
    expect([mine.bookings, mine.seatsLeft]).toEqual([3, 1]);
  }, LIVE_WAIT);

  // D takes the last seat: full
  const D = await otherPassenger(slot, { luggageCount: 0 });
  await D.choose({ mode: 'shared', vehicleType: 'sedan', poolId });
  expect(await screen.findByText('Your shared ride is now full.', {}, LIVE_WAIT)).toBeTruthy();
  // ...and a fifth passenger can't get in
  const E = await otherPassenger(slot, { luggageCount: 0 });
  expect((await E.choose({ mode: 'shared', vehicleType: 'sedan', poolId })).data.error.code).toBe('POOL_FULL');
});

test('describeChange: messages come only from the server’s numbers', () => {
  const pool = (id, bookings, seatsLeft, full = false) => ({ id, bookings, seatsLeft, full });
  const snap = (pools, myPool = null) => ({ pools, myPool });
  expect(describeChange(null, snap([]))).toBeNull(); // first check: nothing "changed"
  expect(describeChange(snap([]), snap([pool('p1', 1, 3)]))?.kind).toBe('new_pool');
  expect(describeChange(snap([pool('p1', 1, 3)]), snap([]))?.kind).toBe('gone');
  expect(describeChange(snap([], pool('m', 1, 3)), snap([], pool('m', 2, 2)))?.text).toBe('Another passenger has joined your shared ride.');
  expect(describeChange(snap([], pool('m', 2, 2)), snap([], pool('m', 3, 0, true)))?.text).toBe('Your shared ride is now full.');
  expect(describeChange(snap([], pool('m', 2, 2)), snap([], pool('m', 1, 3)))?.kind).toBe('left');
  expect(describeChange(snap([pool('p1', 1, 3)]), snap([pool('p1', 1, 3)]))).toBeNull();
});

// ---- 14-15: one polling loop, safe retries -----------------------------------------------

test('14. backgrounding stops polling; foregrounding (even several times) resumes ONE loop', async () => {
  const slot = uniqueSlot();
  const appState = appStateControl();
  try {
    const { trip } = await openRide(slot);
    await waitFor(() => expect(liveRequests(trip).length).toBeGreaterThanOrEqual(2), LIVE_WAIT); // polling

    // Background: nothing is polled at all
    appState.set('background');
    await wait(500);
    const atBackground = liveRequests(trip).length;
    await wait(9000);
    expect(liveRequests(trip).length).toBe(atBackground);

    // Back to the foreground several times in a row: one immediate check, then one loop
    appState.set('active');
    appState.set('active');
    appState.set('background');
    appState.set('active');
    await wait(300);
    const resumed = liveRequests(trip).length;
    expect(resumed - atBackground).toBeLessThanOrEqual(3); // the immediate checks (never overlapping)
    await wait(9000);
    // ~4 s apart: 2-3 more in 9 s. Two loops would make 4-6.
    const more = liveRequests(trip).length - resumed;
    expect(more).toBeGreaterThanOrEqual(1);
    expect(more).toBeLessThanOrEqual(3);
  } finally {
    appState.restore();
  }
});

test('15. a failing network shows "can’t update" and retries; it never books or joins anything', async () => {
  const slot = uniqueSlot();
  const { user, trip } = await openRide(slot);
  await waitFor(() => expect(liveRequests(trip).length).toBeGreaterThanOrEqual(1), LIVE_WAIT);

  network.mode = 'offline';
  expect(await screen.findByTestId('live-activity-stale', {}, LIVE_WAIT)).toHaveTextContent(/Can’t update right now/);
  const offlineChecks = liveRequests(trip).length;
  network.mode = 'online';
  await waitFor(() => expect(screen.queryByTestId('live-activity-stale')).toBeNull(), { timeout: 40_000 });
  expect(liveRequests(trip).length).toBeGreaterThan(offlineChecks);

  // Polling only reads: no ride was chosen, nothing booked
  const saved = (await server.get(`/trips/${trip.id}`, as(user.token))).data.data.trip;
  expect(saved.rideMode ?? null).toBeNull();
  expect(saved.booking ?? null).toBeNull();
  expect(network.requests.filter((r) => r.method !== 'GET' && r.url.startsWith(`/trips/${trip.id}`))).toEqual([]);
}, 90_000);
