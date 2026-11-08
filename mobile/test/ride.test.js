// Phase 8: Ride Selection, through the real screens and a real FlyPool API
// (GET /trips/:id/matches, PUT /trips/:id/ride, GET /trips/:id/ride).
// Runs for iOS and Android.
//
// Every passenger is a real account with a server-verified trip, and every
// shared ride is created by the server (PUT /trips/:id/ride). Fares shown
// are compared with the server's own numbers - nothing here is mocked.
// Each test uses its own random date and time, so trips from other tests
// can't become compatible with it.
import fs from 'node:fs';
import path from 'node:path';
import nodeAxios from 'axios/dist/node/axios.cjs';
import { screen, within } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { formatRupees } from '../src/shared/format';
import { act, launchApp, newUserDetails, press, signedInUser, waitFor } from './helpers';

const network = globalThis.network;
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
const PDF = fs.readFileSync(path.join(__dirname, 'fixtures', 'e-ticket.pdf'));

// Other passengers talk to the server directly (never with the app's token)
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

// Another passenger with a verified trip; `ride` (optional) is their own
// ride choice, saved through the server
async function otherPassenger(slot, { trip, ride } = {}) {
  const { token } = (await server.post('/auth/mobile/register', newUserDetails())).data.data;
  const saved = await verifiedTrip(token, slot, trip);
  if (!ride) return { token, trip: saved };
  const chosen = (await server.put(`/trips/${saved.id}/ride`, ride, as(token))).data.data;
  return { token, trip: chosen.trip, ride: chosen.ride };
}

// This phone's passenger: logged in, with a verified trip
async function me(slot, details) {
  const user = await signedInUser();
  return { user, trip: await verifiedTrip(user.token, slot, details) };
}

const matchesFor = async (user, trip) => (await server.get(`/trips/${trip.id}/matches`, as(user.token))).data.data;
const rideOf = async (user, trip) => (await server.get(`/trips/${trip.id}/ride`, as(user.token))).data.data;
const ridePuts = (trip) => network.requests.filter((r) => r.method === 'PUT' && r.url === `/trips/${trip.id}/ride`);
const continueButton = () => screen.getByTestId('ride-continue');
const isDisabled = (el) => Boolean(el.props.accessibilityState?.disabled);

// After Continue: saved, and the Booking Summary (Phase 9) opens with that ride
async function expectSummary(mode, vehicle) {
  expect(await screen.findByTestId('summary-ride')).toHaveTextContent(new RegExp(`Ride type${mode}.*Vehicle${vehicle}`));
}

async function openRide(trip) {
  await launchApp(`/trip/${trip.id}/ride`);
  await screen.findByTestId('ride-trip');
}

afterEach(() => jest.restoreAllMocks());

// ---- TEST 1 / 2: pool with compatible travellers ---------------------------------

test.each([
  ['sedan', 'Sedan'],
  ['suv', 'SUV'],
])('Pool -> join compatible travellers -> %s -> Continue: saved in their shared ride', async (vehicleType, label) => {
  const slot = uniqueSlot();
  // A compatible traveller already started a shared ride in this vehicle
  const host = await otherPassenger(slot, { trip: { destination: 'Hiranandani Gardens, Powai' }, ride: { mode: 'shared', vehicleType } });
  const poolId = host.ride.pool.id;
  const { user, trip } = await me(slot);
  await openRide(trip);

  // The trip strip: destination, flight, compatible travellers, no choice yet
  expect(screen.getByTestId('ride-trip')).toHaveTextContent(/Going toPowai.*6E 2134.*Compatible travellers1.*Your choiceNot chosen yet/);
  expect(isDisabled(continueButton())).toBe(true);
  expect(screen.getByTestId('ride-missing')).toHaveTextContent('Choose how you want to travel.');

  await press(screen.getByTestId('mode-shared'));
  expect(screen.getByTestId('ride-missing')).toHaveTextContent('Choose a vehicle.');
  // Capacity comes from the server's configuration
  const options = await matchesFor(user, trip);
  const vehicle = options.vehicles.find((v) => v.type === vehicleType);
  expect(screen.getByTestId(`vehicle-${vehicleType}-capacity`)).toHaveTextContent(`Up to ${vehicle.seats} people · ${vehicle.bags} bags`);

  await press(screen.getByTestId(`vehicle-${vehicleType}`));
  // The compatible travellers' shared ride (area, group, flight - no names)
  const pool = await screen.findByTestId(`pool-${poolId}`);
  expect(pool).toHaveTextContent(/Join this shared ride · 1 other booking.*Powai · 1 person · 6E 2134 \(your flight\)/);
  expect(pool).not.toHaveTextContent(/Asha Verma|@example/);
  await press(pool);

  // The server's estimate for joining, as is
  const offered = vehicle.pools.find((p) => p.id === poolId);
  expect(screen.getByTestId('fare-total')).toHaveTextContent(formatRupees(offered.fare.total));
  expect(screen.getByTestId('fare-people')).toHaveTextContent('2 people'); // the host and me - me once
  expect(screen.getByTestId('fare-your-share')).toHaveTextContent(formatRupees(offered.fare.yourShare));
  expect(screen.getByTestId('fare-savings')).toHaveTextContent(`${formatRupees(offered.fare.savingsPerPerson)} per person`);
  expect(screen.getByTestId('ride-action')).toHaveTextContent(`Join a shared ride · ${label}`);

  await press(continueButton());
  await expectSummary('Pool with others', label);
  expect(JSON.parse(ridePuts(trip)[0].data)).toEqual({ mode: 'shared', vehicleType, poolId });
  expect(ridePuts(trip)[0].authorization).toBe(`Bearer ${user.token}`);

  // In the database: the same shared ride, two bookings, nothing duplicated
  const saved = await rideOf(user, trip);
  expect(saved.trip).toMatchObject({ status: 'ride_selected', rideMode: 'shared', vehicleType, poolId });
  expect(saved.ride.pool.bookings).toBe(2);
  expect((await rideOf({ token: host.token }, host.trip)).ride.pool.bookings).toBe(2); // the host sees it too
});

// ---- TEST 3 / 4: travel alone -------------------------------------------------

test.each([
  ['sedan', 'Sedan'],
  ['suv', 'SUV'],
])('Solo -> %s -> Continue: a solo ride, nobody else added', async (vehicleType, label) => {
  const slot = uniqueSlot();
  await otherPassenger(slot, { ride: { mode: 'shared', vehicleType } }); // a compatible shared ride exists
  const { user, trip } = await me(slot);
  await openRide(trip);

  await press(screen.getByTestId('mode-solo'));
  await press(screen.getByTestId(`vehicle-${vehicleType}`));
  expect(screen.queryByTestId('pool-new')).toBeNull(); // no shared rides offered when alone
  const solo = (await matchesFor(user, trip)).vehicles.find((v) => v.type === vehicleType).soloFare;
  expect(screen.getByTestId(`vehicle-${vehicleType}-fare`)).toHaveTextContent(`${formatRupees(solo.total)} estimated for the whole cab`);
  expect(screen.getByTestId('fare-total')).toHaveTextContent(formatRupees(solo.total));
  expect(screen.getByTestId('fare-your-share')).toHaveTextContent(formatRupees(solo.total));

  await press(continueButton());
  await expectSummary('Travel alone', label);
  expect(JSON.parse(ridePuts(trip)[0].data)).toEqual({ mode: 'solo', vehicleType });

  const saved = await rideOf(user, trip);
  expect(saved.trip).toMatchObject({ status: 'ride_selected', rideMode: 'solo', vehicleType });
  expect(saved.trip.poolId ?? null).toBeNull(); // not in anyone's shared ride
  expect(saved.ride.soloFare.total).toBe(solo.total);
});

// ---- TEST 5: capacity ----------------------------------------------------------

test('a group too big for a Sedan can’t choose it; full shared rides aren’t offered; the server refuses too', async () => {
  const slot = uniqueSlot();
  // A shared Sedan (4 seats) with 3 people in it: no room for a group of 2
  const fullish = await otherPassenger(slot, { trip: { passengerCount: 3 }, ride: { mode: 'shared', vehicleType: 'sedan' } });
  // A shared SUV (6 seats) with 2 people: no room for a group of 5
  const roomy = await otherPassenger(slot, { trip: { passengerCount: 2 }, ride: { mode: 'shared', vehicleType: 'suv' } });
  const { user, trip } = await me(slot, { passengerCount: 5, luggageCount: 2 });
  await openRide(trip);

  await press(screen.getByTestId('mode-shared'));
  expect(screen.getByTestId('vehicle-sedan').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId('vehicle-sedan-too-small')).toHaveTextContent('Too small for your group (5 people, 2 bags).');
  await press(screen.getByTestId('vehicle-sedan')); // nothing happens
  expect(screen.getByTestId('ride-missing')).toHaveTextContent('Choose a vehicle.');

  await press(screen.getByTestId('vehicle-suv'));
  // Neither shared ride has room for 5 -> not offered; starting one is
  expect(screen.queryByTestId(`pool-${roomy.ride.pool.id}`)).toBeNull();
  expect(screen.queryByTestId(`pool-${fullish.ride.pool.id}`)).toBeNull();
  expect(screen.getByTestId('pool-new')).toBeTruthy();

  // Even if a request were sent anyway, the server enforces the limits
  const tooSmall = await server.put(`/trips/${trip.id}/ride`, { mode: 'solo', vehicleType: 'sedan' }, as(user.token)).catch((e) => e.response);
  expect([tooSmall.status, tooSmall.data.error.code]).toEqual([409, 'VEHICLE_TOO_SMALL']);
  const overfull = await server
    .put(`/trips/${trip.id}/ride`, { mode: 'shared', vehicleType: 'suv', poolId: roomy.ride.pool.id }, as(user.token))
    .catch((e) => e.response);
  expect([overfull.status, overfull.data.error.code]).toEqual([409, 'POOL_FULL']);
  expect((await rideOf(user, trip)).trip.poolId ?? null).toBeNull();
});

test('a seat taken by someone else just before Continue: clear message, refreshed options, nothing saved', async () => {
  const slot = uniqueSlot();
  const host = await otherPassenger(slot, { trip: { passengerCount: 2 }, ride: { mode: 'shared', vehicleType: 'sedan' } });
  const { user, trip } = await me(slot, { passengerCount: 2 });
  await openRide(trip);
  await press(screen.getByTestId('mode-shared'));
  await press(screen.getByTestId('vehicle-sedan'));
  await press(await screen.findByTestId(`pool-${host.ride.pool.id}`));

  // Meanwhile another passenger (2 people) takes the last two seats
  const rival = await otherPassenger(slot, { trip: { passengerCount: 2 } });
  await server.put(`/trips/${rival.trip.id}/ride`, { mode: 'shared', vehicleType: 'sedan', poolId: host.ride.pool.id }, as(rival.token));

  await press(continueButton());
  expect(await screen.findByText('We couldn’t save your ride')).toBeTruthy();
  expect(screen.getByText(/That shared ride is full now/)).toBeTruthy();
  // The options are reloaded straight away (the message follows the reload)
  expect(await screen.findByText('We’ve refreshed the ride options with the latest seats and fares.')).toBeTruthy();
  await waitFor(() => expect(screen.queryByTestId(`pool-${host.ride.pool.id}`)).toBeNull());
  expect(screen.getByTestId('ride-missing')).toHaveTextContent('Choose a shared ride to join, or start a new one.');
  expect((await rideOf(user, trip)).trip.status).toBe('flight_verified'); // nothing saved
});

// ---- TEST 6: rapid taps --------------------------------------------------------

test('pressing Continue repeatedly sends one request and creates one shared ride', async () => {
  const { user, trip } = await me(uniqueSlot());
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.method === 'put') await gate;
    return adapter(config);
  });
  await openRide(trip);
  await press(screen.getByTestId('mode-shared'));
  await press(screen.getByTestId('vehicle-sedan'));
  await press(screen.getByTestId('pool-new'));

  await press(continueButton());
  await press(continueButton());
  await press(continueButton());
  expect(continueButton().props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  expect(continueButton()).toHaveTextContent('Saving your ride…');
  await act(async () => release());

  await expectSummary('Pool with others', 'Sedan');
  expect(ridePuts(trip)).toHaveLength(1);
  const saved = await rideOf(user, trip);
  expect(saved.ride.pool.bookings).toBe(1); // one shared ride, just me
  // Sending the same choice again (e.g. a retry) keeps that same ride
  const again = (await server.put(`/trips/${trip.id}/ride`, { mode: 'shared', vehicleType: 'sedan' }, as(user.token))).data.data;
  expect(again.trip.poolId).toBe(saved.trip.poolId);
});

// ---- TEST 7: going back and changing ------------------------------------------

test('choices survive going back to Travellers; a saved ride can be changed (solo -> shared)', async () => {
  const slot = uniqueSlot();
  const host = await otherPassenger(slot, { ride: { mode: 'shared', vehicleType: 'suv' } });
  const { user, trip } = await me(slot);
  await openRide(trip);
  await press(screen.getByTestId('mode-solo'));
  await press(screen.getByTestId('vehicle-suv'));

  // Back to Compatible Travellers (step 3), then on again
  await press(screen.getByTestId('step-3'));
  expect(await screen.findByText('Find Travellers')).toBeTruthy();
  await press(await screen.findByTestId('choose-ride'));
  await screen.findByTestId('ride-trip');
  await waitFor(() => expect(screen.getByTestId('mode-solo').props.accessibilityState.checked).toBe(true));
  expect(screen.getByTestId('vehicle-suv').props.accessibilityState.checked).toBe(true);
  expect(ridePuts(trip)).toHaveLength(0); // nothing saved by navigating

  await press(continueButton());
  await expectSummary('Travel alone', 'SUV');
  await press(screen.getByLabelText('Back')); // the ride screen shows the saved ride
  expect(await screen.findByTestId('saved-ride-title')).toHaveTextContent('Travel alone · SUV');

  // Change it: join the compatible traveller's shared SUV instead
  await press(screen.getByTestId('ride-change'));
  await press(screen.getByTestId('mode-shared'));
  await press(screen.getByTestId('vehicle-suv'));
  await press(await screen.findByTestId(`pool-${host.ride.pool.id}`));
  await press(continueButton());
  await expectSummary('Pool with others', 'SUV');

  const saved = await rideOf(user, trip);
  expect(saved.trip).toMatchObject({ rideMode: 'shared', vehicleType: 'suv', poolId: host.ride.pool.id });
  expect(saved.ride.pool.bookings).toBe(2);
  expect(ridePuts(trip).map((r) => JSON.parse(r.data))).toEqual([
    { mode: 'solo', vehicleType: 'suv' },
    { mode: 'shared', vehicleType: 'suv', poolId: host.ride.pool.id },
  ]);
});

// ---- TEST 8: saved ride after reopening ---------------------------------------

test('a saved ride is shown again when the app is opened later (from the server), and in My Trips', async () => {
  const slot = uniqueSlot();
  const { user, trip } = await me(slot, { destination: 'Juhu' });
  // Chosen in an earlier session of the app
  await server.put(`/trips/${trip.id}/ride`, { mode: 'solo', vehicleType: 'sedan' }, as(user.token));

  await openRide(trip);
  expect(await screen.findByText('Your ride selection has been saved')).toBeTruthy();
  expect(screen.getByTestId('saved-ride-title')).toHaveTextContent('Travel alone · Sedan');
  expect(screen.getByTestId('ride-selection')).toHaveTextContent(/Your choices*Travel alone · Sedan/);
  expect(ridePuts(trip)).toHaveLength(0);

  await press(screen.getByText('Go to My Trips'));
  const card = await screen.findByLabelText(/^Trip to Juhu/);
  expect(within(card).getByTestId('trip-ride')).toHaveTextContent('Ride: Travel Alone · Sedan');
  expect(card).toHaveTextContent(/Ride chosen/);
});

// ---- errors, session, access -----------------------------------------------------

test('a lost connection on Continue: safe to try again, and trying again saves it', async () => {
  const { user, trip } = await me(uniqueSlot());
  await openRide(trip);
  await press(screen.getByTestId('mode-solo'));
  await press(screen.getByTestId('vehicle-sedan'));

  network.mode = 'offline';
  await press(continueButton());
  expect(await screen.findByText('Your ride selection wasn’t confirmed')).toBeTruthy();
  expect(screen.getByText(/Tapping Continue again is safe - it won’t create a second ride\./)).toBeTruthy();
  expect(screen.getByTestId('mode-solo').props.accessibilityState.checked).toBe(true); // choices kept

  network.mode = 'online';
  await press(continueButton());
  await expectSummary('Travel alone', 'Sedan');
  expect((await rideOf(user, trip)).trip.rideMode).toBe('solo');
});

test('an ended session on Continue goes to the login screen', async () => {
  const { user, trip } = await me(uniqueSlot());
  await openRide(trip);
  await press(screen.getByTestId('mode-solo'));
  await press(screen.getByTestId('vehicle-suv'));
  await server.post('/auth/logout', null, as(user.token)); // logged out elsewhere

  await press(continueButton());
  expect(await screen.findByText('Your session has ended')).toBeTruthy();
  expect(screen).toHavePathname('/login');
});

test('Ride Selection is a locked step until the flight is verified', async () => {
  const user = await signedInUser();
  const body = {
    pickupLocation: AIRPORT,
    pickupTerminal: 'T2',
    destination: 'Powai',
    travelDate: addDays(todayInMumbai(), 3),
    expectedArrivalTime: '18:30',
    passengerCount: 1,
    luggageCount: 1,
    openToPooling: true,
  };
  const trip = (await server.post('/trips', body, as(user.token))).data.data.trip;
  await launchApp(`/trip/${trip.id}/verify`);
  await screen.findByTestId('trip-route');
  expect(screen.getByTestId('step-4').props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId('step-4').props.accessibilityLabel).toBe('Step 4 of 5: Ride Selection, locked');
});

test('opening Ride Selection for an unverified trip (e.g. a link): the server refuses, the app explains', async () => {
  const user = await signedInUser();
  const body = {
    pickupLocation: AIRPORT,
    pickupTerminal: 'T2',
    destination: 'Powai',
    travelDate: addDays(todayInMumbai(), 3),
    expectedArrivalTime: '18:30',
    passengerCount: 1,
    luggageCount: 1,
    openToPooling: true,
  };
  const trip = (await server.post('/trips', body, as(user.token))).data.data.trip;
  await launchApp(`/trip/${trip.id}/ride`);
  expect(await screen.findByText('Verify your flight first')).toBeTruthy();
  expect(screen.queryByTestId('ride-continue')).toBeNull();
  await press(screen.getByText('Verify your flight'));
  expect(await screen.findByTestId('trip-route')).toBeTruthy();
});

test('Ride Selection works in dark mode too', async () => {
  const { trip } = await me(uniqueSlot());
  require('expo-secure-store').__store.set('flypool.theme', 'dark');
  await openRide(trip);
  const { StyleSheet } = require('react-native');
  const { darkColors } = require('../src/theme');
  expect(StyleSheet.flatten(screen.getByTestId('screen').props.style).backgroundColor).toBe(darkColors.background);
  await press(screen.getByTestId('mode-solo'));
  expect(StyleSheet.flatten(screen.getByTestId('mode-solo').props.style).borderColor).toBe(darkColors.primary);
});
