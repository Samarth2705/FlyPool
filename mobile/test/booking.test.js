// Phase 9: Booking Summary and confirmation, through the real screens and a
// real FlyPool API (GET /trips/:id/matches, POST /trips/:id/booking,
// GET /trips/:id, GET /trips). Runs for iOS and Android.
//
// Every passenger is a real account with a server-verified trip, every ride
// and booking is saved by the server, and the booking reference shown is
// compared with the one in the database - nothing here is mocked.
import fs from 'node:fs';
import path from 'node:path';
import nodeAxios from 'axios/dist/node/axios.cjs';
import { StyleSheet } from 'react-native';
import { screen, within } from 'expo-router/testing-library';
import api from '../src/api/client';
import { darkColors } from '../src/theme';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { formatRupees } from '../src/shared/format';
import { act, launchApp, newUserDetails, press, signedInUser, waitFor } from './helpers';

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

async function newTrip(token, slot, details = {}, { verify = true } = {}) {
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
  if (!verify) return trip;
  const verification = {
    airline: 'IndiGo',
    flightNumber: '6E 2134',
    scheduledArrivalTime: slot.time,
    document: { mimeType: 'application/pdf', dataBase64: PDF.toString('base64') },
  };
  return (await server.post(`/trips/${trip.id}/verification`, verification, as(token))).data.data.trip;
}

async function otherPassenger(slot, { trip, ride } = {}) {
  const { token } = (await server.post('/auth/mobile/register', newUserDetails())).data.data;
  const saved = await newTrip(token, slot, trip);
  if (!ride) return { token, trip: saved };
  const chosen = (await server.put(`/trips/${saved.id}/ride`, ride, as(token))).data.data;
  return { token, trip: chosen.trip, ride: chosen.ride };
}

// This phone's passenger with a verified trip, and optionally a saved ride
async function me(slot, { trip, ride } = {}) {
  const user = await signedInUser();
  let saved = await newTrip(user.token, slot, trip);
  let savedRide = null;
  if (ride) {
    const chosen = (await server.put(`/trips/${saved.id}/ride`, ride, as(user.token))).data.data;
    saved = chosen.trip;
    savedRide = chosen.ride;
  }
  return { user, trip: saved, ride: savedRide };
}

const serverTrip = async (user, trip) => (await server.get(`/trips/${trip.id}`, as(user.token))).data.data.trip;
const bookingPosts = (trip) => network.requests.filter((r) => r.method === 'POST' && r.url === `/trips/${trip.id}/booking`);
const confirmButton = () => screen.getByTestId('confirm-booking');

async function openSummary(trip) {
  await launchApp(`/trip/${trip.id}/summary`);
  await screen.findByTestId('summary-ride');
}

// Choose a ride on the Ride Selection screen; Continue opens the summary
async function chooseInApp(trip, { mode, vehicleType, poolId }) {
  await launchApp(`/trip/${trip.id}/ride`);
  await screen.findByTestId('ride-trip');
  await press(screen.getByTestId(`mode-${mode}`));
  await press(screen.getByTestId(`vehicle-${vehicleType}`));
  if (mode === 'shared') await press(await screen.findByTestId(poolId ? `pool-${poolId}` : 'pool-new'));
  await press(screen.getByTestId('ride-continue'));
  await screen.findByTestId('summary-ride');
}

afterEach(() => jest.restoreAllMocks());

// ---- TEST 1 / 2: pool -> summary -> confirm --------------------------------------

test.each([
  ['sedan', 'Sedan'],
  ['suv', 'SUV'],
])('Pool + %s -> Booking Summary -> Confirm Booking: booked by the server, shown from its record', async (vehicleType, label) => {
  const slot = uniqueSlot();
  const host = await otherPassenger(slot, { trip: { destination: 'Hiranandani Gardens, Powai' }, ride: { mode: 'shared', vehicleType } });
  const { user, trip } = await me(slot);
  await chooseInApp(trip, { mode: 'shared', vehicleType, poolId: host.ride.pool.id });
  expect(screen).toHavePathname(`/trip/${trip.id}/summary`);

  // A. Trip
  const tripCard = screen.getByTestId('summary-trip');
  expect(tripCard).toHaveTextContent(new RegExp(`Passenger${user.name}.*Mumbai Airport \\(BOM\\) · T2.*DestinationPowai.*6E 2134`));
  // B. Flight - nothing made up
  expect(screen.getByTestId('summary-flight')).toHaveTextContent(/AirlineIndiGo.*Departure airportNot recorded.*Arrival airportMumbai \(BOM\) · Terminal 2/);
  expect(screen.getByTestId('summary-verification')).toHaveTextContent('Verified (demo check)');
  // C. Travellers: me once, plus the one other booking in the shared ride
  const travellers = screen.getByTestId('summary-travellers');
  expect(travellers).toHaveTextContent(new RegExp(`You${user.name} · 1 person · Powai`));
  expect(within(travellers).getAllByTestId('summary-other')).toHaveLength(1);
  expect(within(travellers).getByTestId('summary-other')).toHaveTextContent(/Powai.*1 person · 6E 2134 \(your flight\)/);
  expect(screen.getByTestId('summary-total-passengers')).toHaveTextContent('2 people');
  // D + E. Ride and fare, exactly as the server has them
  const { ride } = (await server.get(`/trips/${trip.id}/ride`, as(user.token))).data.data;
  const fare = ride.pool.fare;
  expect(screen.getByTestId('summary-ride')).toHaveTextContent(new RegExp(`Ride typePool with others.*Vehicle${label}.*${ride.vehicle.seats} people · ${ride.vehicle.bags} bags`));
  expect(screen.getByTestId('fare-base')).toHaveTextContent(formatRupees(fare.breakdown.baseFare));
  expect(screen.getByTestId('fare-distance')).toHaveTextContent(formatRupees(fare.breakdown.distanceCharge));
  expect(screen.getByTestId('fare-total')).toHaveTextContent(formatRupees(fare.total));
  expect(screen.getByTestId('fare-your-share')).toHaveTextContent(formatRupees(fare.yourShare));

  await press(confirmButton());
  expect(await screen.findByText('Booking confirmed')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/booking`);
  expect(JSON.parse(bookingPosts(trip)[0].data)).toEqual({ mode: 'shared', vehicleType, poolId: host.ride.pool.id, yourShare: fare.yourShare });
  expect(bookingPosts(trip)[0].authorization).toBe(`Bearer ${user.token}`);

  // The confirmation shows the server's own record
  const record = (await serverTrip(user, trip)).booking;
  expect(record).toMatchObject({ status: 'confirmed', mode: 'shared', vehicleType, poolId: host.ride.pool.id });
  expect(screen.getByTestId('booking-reference')).toHaveTextContent(record.reference);
  expect(screen.getByTestId('booking-status')).toHaveTextContent('Confirmed');
  expect(screen.getByTestId('booking-passenger')).toHaveTextContent(user.name);
  expect(screen.getByTestId('booking-mode')).toHaveTextContent('Pool with others');
  expect(screen.getByTestId('booking-vehicle')).toHaveTextContent(`${label} · up to ${record.vehicle.seats} people`);
  expect(screen.getAllByTestId('booking-other')).toHaveLength(1);
  expect(screen.getByTestId('booking-fare')).toHaveTextContent(new RegExp(`Estimated total for the cab${formatRupees(record.fare.total)}`));

  // View My Trips: the booking is there
  await press(screen.getByTestId('view-my-trips'));
  const card = await screen.findByLabelText(/^Trip to Powai/);
  expect(card).toHaveTextContent(/Booked/);
  expect(within(card).getByTestId('trip-booking')).toHaveTextContent(`Booking ${record.reference} · Confirmed`);
  expect(within(card).getByTestId('trip-ride')).toHaveTextContent(`Ride: Shared Ride · ${label}`);
});

// ---- TEST 3 / 4: solo -> summary -> confirm ---------------------------------------

test.each([
  ['sedan', 'Sedan'],
  ['suv', 'SUV'],
])('Solo + %s -> Booking Summary -> Confirm Booking: "Travelling Alone", nobody else', async (vehicleType, label) => {
  const slot = uniqueSlot();
  await otherPassenger(slot, { ride: { mode: 'shared', vehicleType } }); // compatible, but not chosen
  const { user, trip } = await me(slot);
  await chooseInApp(trip, { mode: 'solo', vehicleType });

  expect(screen.getByTestId('summary-alone')).toHaveTextContent('Travelling Alone');
  expect(screen.queryByTestId('summary-other')).toBeNull();
  const { ride } = (await server.get(`/trips/${trip.id}/ride`, as(user.token))).data.data;
  expect(screen.getByTestId('summary-ride')).toHaveTextContent(new RegExp(`Ride typeTravel alone.*Vehicle${label}.*Passengers1 person.*Estimated total fare${formatRupees(ride.soloFare.total)}`));
  expect(screen.getByTestId('fare-your-share')).toHaveTextContent(formatRupees(ride.soloFare.total));
  expect(screen.queryByTestId('fare-per-person')).toBeNull(); // not split

  await press(confirmButton());
  expect(await screen.findByText('Booking confirmed')).toBeTruthy();
  const record = (await serverTrip(user, trip)).booking;
  expect(record).toMatchObject({ status: 'confirmed', mode: 'solo', vehicleType, poolId: null, travellers: [] });
  expect(screen.getByTestId('booking-reference')).toHaveTextContent(record.reference);
  expect(screen.getByTestId('booking-travellers')).toHaveTextContent(/Travelling Alone/);
  expect(screen.queryByTestId('booking-other')).toBeNull();

  await press(screen.getByTestId('back-home'));
  expect(await screen.findByText('Where are you headed?')).toBeTruthy();
  expect(screen).toHavePathname('/');
});

// ---- TEST 5: edits -----------------------------------------------------------------

test('editing from the summary: ride changed and the summary refreshes; trip details are locked and say so', async () => {
  const { user, trip } = await me(uniqueSlot(), { ride: { mode: 'solo', vehicleType: 'sedan' } });
  await launchApp(`/trip/${trip.id}/ride`); // the saved ride
  await press(await screen.findByTestId('to-summary'));
  await screen.findByTestId('summary-ride');
  expect(screen.getByTestId('summary-vehicle')).toHaveTextContent('Sedan');

  // Edit the ride: back to Ride Selection, change Sedan -> SUV, Continue
  await press(screen.getByTestId('summary-ride-edit'));
  await press(await screen.findByTestId('ride-change'));
  await press(screen.getByTestId('vehicle-suv'));
  await press(screen.getByTestId('ride-continue'));
  await waitFor(() => expect(screen.getByTestId('summary-vehicle')).toHaveTextContent('SUV'));
  expect((await serverTrip(user, trip)).vehicleType).toBe('suv');

  // Edit trip details: the server locks them after verification - the app says so
  await press(screen.getByTestId('summary-trip-edit'));
  expect(await screen.findByText('These details are locked')).toBeTruthy();
  await press(screen.getByText('Review and book'));
  await screen.findByTestId('summary-ride');
  expect(screen.getByTestId('summary-vehicle')).toHaveTextContent('SUV');

  const trips = (await server.get('/trips', as(user.token))).data.data.trips;
  expect(trips).toHaveLength(1); // still one trip, same id
  expect(trips[0].id).toBe(trip.id);
});

test('the ride changed elsewhere after it was reviewed: not booked, the summary refreshes and asks for a review', async () => {
  const { user, trip } = await me(uniqueSlot(), { ride: { mode: 'solo', vehicleType: 'sedan' } });
  await openSummary(trip);
  expect(screen.getByTestId('summary-vehicle')).toHaveTextContent('Sedan');

  // Changed on another device in the meantime
  await server.put(`/trips/${trip.id}/ride`, { mode: 'solo', vehicleType: 'suv' }, as(user.token));

  await press(confirmButton());
  expect(await screen.findByText('We couldn’t confirm your booking')).toBeTruthy();
  expect(screen.getByText(/Your ride or its fare changed since you reviewed it/)).toBeTruthy();
  expect(await screen.findByTestId('summary-changed')).toBeTruthy();
  await waitFor(() => expect(screen.getByTestId('summary-vehicle')).toHaveTextContent('SUV'));
  expect((await serverTrip(user, trip)).booking).toBeNull(); // nothing booked

  await press(confirmButton()); // after reviewing the new summary
  expect(await screen.findByText('Booking confirmed')).toBeTruthy();
  expect((await serverTrip(user, trip)).booking.vehicleType).toBe('suv');
});

// ---- TEST 6: duplicates -------------------------------------------------------------

test('Confirm Booking pressed repeatedly: one request, one booking; repeating it later returns the same booking', async () => {
  const { user, trip } = await me(uniqueSlot(), { ride: { mode: 'solo', vehicleType: 'suv' } });
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.method === 'post') await gate;
    return adapter(config);
  });
  await openSummary(trip);

  await press(confirmButton());
  await press(confirmButton());
  await press(confirmButton());
  expect(confirmButton().props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  expect(confirmButton()).toHaveTextContent('Confirming your booking…');
  await act(async () => release());

  expect(await screen.findByText('Booking confirmed')).toBeTruthy();
  expect(bookingPosts(trip)).toHaveLength(1);
  const record = (await serverTrip(user, trip)).booking;

  // The same request again (e.g. a retry): 200 with the SAME booking
  const again = await server.post(`/trips/${trip.id}/booking`, {}, as(user.token));
  expect(again.status).toBe(200);
  expect(again.data.data).toMatchObject({ created: false, booking: { reference: record.reference } });
  // And the ride can no longer change
  const change = await server.put(`/trips/${trip.id}/ride`, { mode: 'solo', vehicleType: 'sedan' }, as(user.token)).catch((e) => e.response);
  expect([change.status, change.data.error.code]).toEqual([409, 'BOOKING_CONFIRMED']);
});

// ---- TEST 7: nothing valid to book -------------------------------------------------

test('no ride chosen: the summary blocks Confirm and sends to Ride Selection; the server refuses too', async () => {
  const { user, trip } = await me(uniqueSlot());
  await openSummary(trip);
  expect(screen.getByText('Choose your ride first')).toBeTruthy();
  expect(confirmButton().props.accessibilityState.disabled).toBe(true);
  await press(confirmButton());
  expect(bookingPosts(trip)).toHaveLength(0);

  const direct = await server.post(`/trips/${trip.id}/booking`, {}, as(user.token)).catch((e) => e.response);
  expect([direct.status, direct.data.error.code]).toEqual([409, 'RIDE_NOT_SELECTED']);

  await press(screen.getByText('Choose your ride'));
  expect(await screen.findByTestId('ride-trip')).toBeTruthy();
});

test('a shared ride nobody has joined can’t be booked yet: explained, with a way to change the ride', async () => {
  const { user, trip } = await me(uniqueSlot(), { ride: { mode: 'shared', vehicleType: 'sedan' } });
  await openSummary(trip);
  expect(screen.getByText('Nobody has joined your shared ride yet')).toBeTruthy();
  expect(confirmButton().props.accessibilityState.disabled).toBe(true);
  expect(screen.getByTestId('summary-total-passengers')).toHaveTextContent('1 person');

  const direct = await server.post(`/trips/${trip.id}/booking`, {}, as(user.token)).catch((e) => e.response);
  expect([direct.status, direct.data.error.code]).toEqual([409, 'POOL_NO_TRAVELLERS']);
  expect((await serverTrip(user, trip)).booking).toBeNull();
});

test('a flight that isn’t verified: no summary to confirm; someone else’s trip: not found', async () => {
  const user = await signedInUser();
  const unverified = await newTrip(user.token, uniqueSlot(), {}, { verify: false });
  await launchApp(`/trip/${unverified.id}/summary`);
  expect(await screen.findByText('We couldn’t load the booking summary')).toBeTruthy();
  expect(screen.getByText('Verify your flight')).toBeTruthy();
  expect(screen.queryByTestId('confirm-booking')).toBeNull();
});

test('someone else’s trip id: not found, nothing to book', async () => {
  const theirs = await otherPassenger(uniqueSlot(), { ride: { mode: 'solo', vehicleType: 'sedan' } });
  await signedInUser();
  await launchApp(`/trip/${theirs.trip.id}/summary`);
  expect(await screen.findByText('Trip not found.')).toBeTruthy();
  expect(screen.queryByTestId('confirm-booking')).toBeNull();
});

// ---- errors ----------------------------------------------------------------------

test('a lost connection on Confirm: not shown as booked; Confirm again is safe and books once', async () => {
  const { user, trip } = await me(uniqueSlot(), { ride: { mode: 'solo', vehicleType: 'sedan' } });
  await openSummary(trip);
  network.mode = 'lose-response'; // the server books it, but the answer never arrives
  await press(confirmButton());
  expect(await screen.findByText('Your booking wasn’t confirmed')).toBeTruthy();
  expect(screen.getByText(/Tapping Confirm Booking again is safe - you won’t be booked twice\./)).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/summary`); // no confirmation screen without an answer
  await waitFor(() => expect(confirmButton().props.accessibilityState.busy).toBeFalsy()); // settled

  const record = (await serverTrip(user, trip)).booking; // the server did book it
  expect(record.status).toBe('confirmed');

  network.mode = 'online';
  await press(confirmButton()); // "try again": the server answers with the same booking
  expect(await screen.findByText('Booking confirmed')).toBeTruthy();
  expect(screen.getByTestId('booking-reference')).toHaveTextContent(record.reference);
  expect((await serverTrip(user, trip)).booking.reference).toBe(record.reference); // booked once
});

test('an ended session on Confirm goes to the login screen, without booking', async () => {
  const { user, trip } = await me(uniqueSlot(), { ride: { mode: 'solo', vehicleType: 'suv' } });
  await openSummary(trip);
  await server.post('/auth/logout', null, as(user.token));
  await press(confirmButton());
  expect(await screen.findByText('Your session has ended')).toBeTruthy();
  expect(screen).toHavePathname('/login');
});

// ---- TEST 8 / 9: after reopening, from the server's records -------------------------

test('a booking made earlier shows in My Trips after opening the app, and its confirmation loads from the server', async () => {
  const { user, trip } = await me(uniqueSlot(), { trip: { destination: 'Juhu' }, ride: { mode: 'solo', vehicleType: 'sedan' } });
  const booked = (await server.post(`/trips/${trip.id}/booking`, {}, as(user.token))).data.data.booking;

  await launchApp('/trips');
  const card = await screen.findByLabelText(/^Trip to Juhu/);
  expect(card).toHaveTextContent(/Booked/);
  expect(within(card).getByTestId('trip-booking')).toHaveTextContent(`Booking ${booked.reference} · Confirmed`);
  expect(within(card).getByTestId('trip-ride')).toHaveTextContent('Ride: Travel Alone · Sedan');

  await press(card); // a booked trip opens Ride Management (Phase 11)
  expect(await screen.findByTestId('manage-reference')).toHaveTextContent(booked.reference);
  expect(screen.getByTestId('manage-destination')).toHaveTextContent('Juhu');
  expect(bookingPosts(trip)).toHaveLength(0); // only read - the booking came from the server
});

test('the confirmation screen never shows a booking the server doesn’t have', async () => {
  const { trip } = await me(uniqueSlot(), { ride: { mode: 'solo', vehicleType: 'sedan' } });
  await launchApp(`/trip/${trip.id}/booking`);
  expect(await screen.findByText('This trip isn’t booked yet')).toBeTruthy();
  expect(screen.queryByText('Booking confirmed')).toBeNull();
  expect(screen.queryByTestId('booking-reference')).toBeNull();
});

test('Booking Summary and confirmation follow dark mode', async () => {
  const { trip } = await me(uniqueSlot(), { ride: { mode: 'solo', vehicleType: 'sedan' } });
  require('expo-secure-store').__store.set('flypool.theme', 'dark');
  await openSummary(trip);
  const bg = () => StyleSheet.flatten(screen.getByTestId('screen').props.style).backgroundColor;
  expect(bg()).toBe(darkColors.background);
  await press(confirmButton());
  await screen.findByText('Booking confirmed');
  expect(bg()).toBe(darkColors.background);
});
