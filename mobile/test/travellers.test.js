// Phase 6: Find Travellers, through the real screens and a real FlyPool API
// (GET /trips/:id/matches). Runs for iOS and Android.
//
// Every traveller here is a real account with a real trip whose flight the
// server verified (its demo checks) - nothing about matching is mocked. The
// server alone decides who is compatible.
//
// Each test uses its own random travel date and landing time, so trips from
// other tests (and the other platform's run) can't show up as matches.
import nodeAxios from 'axios/dist/node/axios.cjs';
import { screen, within } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, formatTime, todayInMumbai } from '../src/shared/dates';
import { act, launchApp, newUserDetails, press, signedInUser, typeInto, waitFor } from './helpers';
import { ticketFor, ticketLines, ticketPdf } from './tickets';

const network = globalThis.network;
const device = globalThis.device;
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
const EMPTY =
  'No compatible travellers found yet. We’ll show you when someone with a similar route joins FlyPool.';

// Setting up OTHER passengers goes straight to the server, outside the app,
// so the app's own session (its token) is never involved.
const randomIp = () => `10.${200 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const server = nodeAxios.create({
  baseURL: api.defaults.baseURL,
  headers: { 'X-Forwarded-For': randomIp() },
  httpAgent: new (require('node:http').Agent)({ keepAlive: false }),
});
const as = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// "18:30" + 10 -> "18:40"
function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// A date and landing time no other test uses (06:00-19:55)
function uniqueSlot() {
  const minutes = 6 * 60 + 5 * Math.floor(Math.random() * 168);
  return {
    travelDate: addDays(todayInMumbai(), 20 + Math.floor(Math.random() * 340)),
    time: `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`,
  };
}

async function createTrip(token, slot, details = {}) {
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
  return (await server.post('/trips', body, as(token))).data.data.trip;
}

async function verifyTrip(token, trip, { flightNumber = '6E 2134', airline = 'IndiGo' } = {}) {
  const body = {
    airline,
    flightNumber,
    scheduledArrivalTime: trip.expectedArrivalTime,
    document: await ticketFor(token, trip, { airline, flightNumber }),
  };
  return (await server.post(`/trips/${trip.id}/verification`, body, as(token))).data.data.trip;
}

// Another FlyPool passenger: their own account and trip (verified unless
// verified: false)
async function otherPassenger(slot, { trip = {}, flight, verified = true } = {}) {
  const { token } = (await server.post('/auth/mobile/register', newUserDetails())).data.data;
  const created = await createTrip(token, slot, trip);
  return verified ? verifyTrip(token, created, flight) : created;
}

// This phone's passenger, logged in, with a verified trip
async function me(slot, { trip, flight } = {}) {
  const user = await signedInUser();
  const created = await verifyTrip(user.token, await createTrip(user.token, slot, trip), flight);
  return { user, trip: created };
}

const cards = () => screen.queryAllByTestId('traveller-card');
const matchRequests = (trip) => network.requests.filter((r) => r.url === `/trips/${trip.id}/matches`);

// Holds the app's matches request until release(); fail() makes the next
// one fail like a dropped connection instead
function controlMatches() {
  let release;
  let gate = new Promise((resolve) => (release = resolve));
  let failNext = false;
  const control = { sent: 0 };
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.url.endsWith('/matches')) {
      control.sent += 1;
      await gate;
      if (failNext) {
        failNext = false;
        throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', config, isAxiosError: true });
      }
    }
    return adapter(config);
  });
  return Object.assign(control, {
    hold() {
      gate = new Promise((resolve) => (release = resolve));
    },
    release: () => act(async () => release()),
    fail() {
      failNext = true;
    },
  });
}

afterEach(() => jest.restoreAllMocks());

test('after verifying in the app, Find Travellers lists the server’s compatible travellers, best first', async () => {
  const slot = uniqueSlot();
  const later = { ...slot, time: addMinutes(slot.time, 10) };

  // Compatible with "me" (Terminal 2, 6E 2134, Powai, landing at slot.time):
  await otherPassenger(later, { trip: { destination: 'Hiranandani Gardens, Powai', passengerCount: 2 }, flight: { flightNumber: 'AI 101', airline: 'Air India' } });
  await otherPassenger(slot); // same flight, same time, Powai
  // Not compatible, by the server's rules:
  await otherPassenger(slot, { trip: { pickupTerminal: 'T1' } }); // other terminal
  await otherPassenger({ ...slot, time: addMinutes(slot.time, 90) }); // lands 90 min later
  await otherPassenger(slot, { trip: { destination: 'Colaba' } }); // not on the way
  await otherPassenger(slot, { trip: { openToPooling: false } }); // doesn't want to share
  await otherPassenger(slot, { verified: false }); // flight not verified

  // This passenger verifies in the app
  const user = await signedInUser();
  const trip = await createTrip(user.token, slot);
  const matches = controlMatches();
  await launchApp(`/trip/${trip.id}/verify`);
  await screen.findByTestId('trip-route');
  // The passenger's own e-ticket: their name, this flight, the trip's date
  const PDF = ticketPdf(ticketLines({ date: trip.travelDate }));
  const uri = device.files.inCache('e-ticket.pdf', PDF);
  device.documentPicker.answer = { uri, name: 'e-ticket.pdf', mimeType: 'application/pdf', size: PDF.length };
  await press(screen.getByTestId('ticket-upload'));
  await typeInto(screen.getByTestId('flight-number'), '6E 2134');
  network.requests.length = 0;
  await press(screen.getByTestId('verify'));

  // Straight to Find Travellers for this trip, loading
  expect(await screen.findByText('Find Travellers')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/matches`);
  expect(await screen.findByTestId('matches-loading')).toBeTruthy();
  await matches.release();

  await waitFor(() => expect(cards()).toHaveLength(2));
  expect(screen.getByText('Flight verified successfully.')).toBeTruthy();
  expect(matchRequests(trip)).toHaveLength(1);
  expect(matchRequests(trip)[0].authorization).toBe(`Bearer ${user.token}`);
  expect(screen.getByTestId('traveller-count')).toHaveTextContent('2');
  expect(screen.getByTestId('your-flight')).toHaveTextContent(new RegExp(`6E 2134.*Lands ${formatTime(slot.time)}`));

  // Best first (the server's order): same flight, then closest landing time
  const [first, second] = cards();
  // Shown by short name (change 3), e.g. "Asha V.", never the full name
  expect(first).toHaveTextContent(/^[A-Z][a-z]+ [A-Z]\..*ID not checked.*Same flight.*6E 2134/);
  expect(first).toHaveTextContent(new RegExp(`Lands${formatTime(slot.time)}.*Same time as you`));
  expect(first).toHaveTextContent(/Going toPowai.*Group1 person/);
  expect(within(first).getByText('Same flight as you')).toBeTruthy();
  expect(within(first).getByText('Same pickup: Terminal 2')).toBeTruthy();

  expect(second).toHaveTextContent(/^[A-Z][a-z]+ [A-Z]\..*AI 101/); // by short name (change 3)
  expect(within(second).queryByText('Same flight')).toBeNull();
  expect(second).toHaveTextContent(new RegExp(`Lands${formatTime(later.time)}.*10 min after you`));
  expect(second).toHaveTextContent(/Going toPowai.*Group2 people/);
  expect(within(second).getByText('Lands within 60 min of you (10 min after you)')).toBeTruthy();
  expect(within(second).getByText(/Drop-off in Powai fits your route/)).toBeTruthy();

  // No names or contact details anywhere
  expect(screen.queryByText(/Asha Verma|@example\.com|\+91/)).toBeNull();
});

test('nobody compatible: the empty message; Check again finds a traveller who verified since', async () => {
  const slot = uniqueSlot();
  const { trip } = await me(slot, { trip: { destination: 'Andheri East' } });
  await launchApp(`/trip/${trip.id}/matches`);

  expect(await screen.findByText(EMPTY)).toBeTruthy();
  expect(cards()).toHaveLength(0);
  expect(screen.getByTestId('traveller-count')).toHaveTextContent('0');

  // Someone on another flight, landing 25 min earlier, going to the same area
  await otherPassenger(
    { ...slot, time: addMinutes(slot.time, -25) },
    { trip: { destination: 'Andheri East' }, flight: { flightNumber: 'AI 202', airline: 'Air India' } },
  );
  await press(screen.getByTestId('matches-refresh'));
  await waitFor(() => expect(cards()).toHaveLength(1));
  expect(screen.queryByText(EMPTY)).toBeNull();
  expect(cards()[0]).toHaveTextContent(/AI 202.*25 min before you.*Going toAndheri East/);
  expect(matchRequests(trip)).toHaveLength(2);
});

test('trip details can be opened from the screen; Plan another trip goes home', async () => {
  const { trip } = await me(uniqueSlot(), { trip: { destination: 'Juhu' } });
  await launchApp(`/trip/${trip.id}/matches`);
  await screen.findByText(EMPTY);
  expect(screen.getByTestId('your-flight')).toHaveTextContent(/Mumbai Airport \(BOM\) · T2 → Juhu/);

  expect(screen.queryByTestId('verified-flight')).toBeNull();
  await press(screen.getByText('Show trip details'));
  expect(screen.getByTestId('verified-flight')).toHaveTextContent(/Drop areaJuhu/);
  await press(screen.getByText('Hide trip details'));
  expect(screen.queryByTestId('verified-flight')).toBeNull();

  await press(screen.getByText('Plan another trip'));
  expect(await screen.findByText('Where are you headed?')).toBeTruthy();
  expect(screen).toHavePathname('/');
});

test('a failed request shows Try again and is never retried on its own', async () => {
  const slot = uniqueSlot();
  const { trip } = await me(slot);
  await otherPassenger(slot);
  const matches = controlMatches();
  matches.fail();
  await launchApp(`/trip/${trip.id}/matches`);
  await matches.release();

  expect(await screen.findByText('We couldn’t load travellers')).toBeTruthy();
  expect(screen.getByText('Can’t reach FlyPool. Check your internet connection and try again.')).toBeTruthy();
  await new Promise((r) => setTimeout(r, 500));
  expect(matches.sent).toBe(1); // no automatic retry

  await press(screen.getByTestId('matches-retry'));
  await waitFor(() => expect(cards()).toHaveLength(1));
  expect(screen.queryByText('We couldn’t load travellers')).toBeNull();
  expect(matches.sent).toBe(2);
});

test('a session that ended (token revoked) goes to the login screen', async () => {
  const { user, trip } = await me(uniqueSlot());
  const matches = controlMatches();
  await launchApp(`/trip/${trip.id}/matches`);
  await screen.findByTestId('matches-loading');

  // Logged out elsewhere while the request is on its way
  expect((await server.post('/auth/logout', null, as(user.token))).status).toBe(200);
  await matches.release();

  expect(await screen.findByText('Your session has ended')).toBeTruthy();
  expect(screen).toHavePathname('/login');
  expect(screen.queryByText('We couldn’t load travellers')).toBeNull();
});

test('a pickup away from the airport: explains why no travellers are shown', async () => {
  const { trip } = await me(uniqueSlot(), { trip: { pickupLocation: 'Hotel Sahara Star', pickupTerminal: null } });
  await launchApp(`/trip/${trip.id}/matches`);
  expect(await screen.findByText('No travellers to show for this trip')).toBeTruthy();
  expect(screen.getByText(/works for pickups at Mumbai Airport or Navi Mumbai Airport only/)).toBeTruthy();
  expect(screen.queryByText(EMPTY)).toBeNull();
});

test('someone else’s trip id is refused by the server', async () => {
  const slot = uniqueSlot();
  const theirs = await otherPassenger(slot);
  await me(slot);
  await launchApp(`/trip/${theirs.id}/matches`);
  expect(await screen.findByText('Trip not found')).toBeTruthy();
  expect(screen.queryByTestId('traveller-card')).toBeNull();
  expect(screen.queryByTestId('matches-retry')).toBeNull();
});
