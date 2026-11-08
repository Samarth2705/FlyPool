// Phase 10: notifications and push registration, through the real screens
// and a real FlyPool API (GET/PATCH /notifications, device tokens). Runs for
// iOS and Android. Every notification here was created by the server for a
// real event (a compatible trip verified, a booking confirmed) - none is
// mocked. Only the phone's notification permission/token are stand-ins.
import fs from 'node:fs';
import path from 'node:path';
import nodeAxios from 'axios/dist/node/axios.cjs';
import { Alert } from 'react-native';
import { screen, within } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { act, launchApp, newUserDetails, press, signedInUser, waitFor } from './helpers';

const network = globalThis.network;
const device = globalThis.device;
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

const newAccount = async () => (await server.post('/auth/mobile/register', newUserDetails())).data.data;
const notificationsOf = async (token) => (await server.get('/notifications', as(token))).data.data;

afterEach(() => jest.restoreAllMocks());

test('a real event reaches the intended account only; the bell counts it; open, mark read, mark all read', async () => {
  const slot = uniqueSlot();
  const user = await signedInUser(); // account A, on this phone
  const myTrip = await verifiedTrip(user.token, slot);
  const unrelated = await newAccount(); // account C, another day
  await verifiedTrip(unrelated.token, uniqueSlot());

  // Account B verifies a compatible trip -> the server notifies A
  const other = await newAccount();
  await verifiedTrip(other.token, slot, { destination: 'Hiranandani Gardens, Powai' });

  expect((await notificationsOf(user.token)).notifications.map((n) => n.type)).toEqual(['compatible_traveller', 'system']);
  expect((await notificationsOf(unrelated.token)).notifications.map((n) => n.type)).toEqual(['system']);
  expect((await notificationsOf(other.token)).notifications.map((n) => n.type)).toEqual(['system']);

  await launchApp('/');
  await screen.findByText('Where are you headed?');
  expect(await screen.findByTestId('bell-badge')).toHaveTextContent('2');
  expect(screen.getByTestId('header-bell').props.accessibilityLabel).toBe('Notifications, 2 unread');

  await press(screen.getByTestId('header-bell'));
  expect(await screen.findByText('New compatible traveller')).toBeTruthy();
  expect(screen).toHavePathname('/notifications');
  const rows = screen.getAllByTestId('notification');
  expect(rows[0]).toHaveTextContent(/New compatible traveller.*heading to Powai/); // newest first
  expect(rows[1]).toHaveTextContent(/Welcome to FlyPool/);
  expect(within(rows[0]).getByTestId('unread-dot')).toBeTruthy();
  expect(screen.getByTestId('unread-count')).toHaveTextContent('2 unread');
  expect(screen.queryByText(/Asha Verma|@example\.com/)).toBeNull(); // no names or emails

  // Open it: marked read on the server, and on to that trip's travellers
  await press(rows[0]);
  expect(await screen.findByText('Find Travellers')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${myTrip.id}/matches`);
  await waitFor(() => expect(screen.getByTestId('bell-badge')).toHaveTextContent('1')); // the bell caught up
  expect((await notificationsOf(user.token)).unreadCount).toBe(1);
  const patch = network.requests.find((r) => r.method === 'PATCH' && /\/notifications\/.+\/read$/.test(r.url));
  expect(patch.authorization).toBe(`Bearer ${user.token}`);

  await press(screen.getByLabelText('Back'));
  await waitFor(() => expect(screen.getByTestId('unread-count')).toHaveTextContent('1 unread'));
  await press(screen.getByTestId('mark-all-read'));
  await waitFor(() => expect(screen.getByTestId('unread-count')).toHaveTextContent('All caught up'));
  expect(screen.queryByTestId('unread-dot')).toBeNull();
  await waitFor(() => expect(screen.queryByTestId('bell-badge')).toBeNull());
  expect((await notificationsOf(user.token)).unreadCount).toBe(0);
});

test('confirming a booking notifies the passenger; the notification opens its Ride Management', async () => {
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, uniqueSlot(), { destination: 'Juhu' });
  await server.put(`/trips/${trip.id}/ride`, { mode: 'solo', vehicleType: 'sedan' }, as(user.token));
  const { booking } = (await server.post(`/trips/${trip.id}/booking`, {}, as(user.token))).data.data;

  await launchApp('/notifications');
  const row = await screen.findByText('Booking confirmed');
  expect(screen.getAllByTestId('notification')[0]).toHaveTextContent(new RegExp(`Booking ${booking.reference}: Solo ride in a Sedan to Juhu`));
  await press(row);
  expect(await screen.findByTestId('manage-reference')).toHaveTextContent(booking.reference);
  expect(screen).toHavePathname(`/trip/${trip.id}/manage`);
});

test('notifications that can’t be loaded offer Try again', async () => {
  await signedInUser();
  let fail = true;
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.url === '/notifications' && fail) {
      throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', config, isAxiosError: true });
    }
    return adapter(config);
  });
  await launchApp('/notifications');
  expect(await screen.findByText('We couldn’t load your notifications')).toBeTruthy();
  fail = false;
  await press(screen.getByTestId('notifications-retry'));
  expect(await screen.findByText('Welcome to FlyPool')).toBeTruthy();
  expect(screen.queryByText('We couldn’t load your notifications')).toBeNull();
});

// ---- push registration -------------------------------------------------------------

test('Settings: turning on push asks once, registers this phone’s token; logout removes it first', async () => {
  const user = await signedInUser();
  await launchApp('/settings');
  expect(await screen.findByTestId('push-status')).toHaveTextContent('Get booking and shared-ride updates even when FlyPool is closed.');
  expect(device.push.requests).toBe(0); // never asked by itself

  await press(screen.getByTestId('push-enable'));
  await waitFor(() => expect(screen.getByTestId('push-status')).toHaveTextContent(/On for this phone/));
  expect(device.push.requests).toBe(1);
  expect(device.push.tokenCalls[0]).toEqual({ projectId: 'test-eas-project-id' });
  const registered = network.requests.find((r) => r.method === 'POST' && r.url === '/notifications/device-token');
  expect(JSON.parse(registered.data)).toEqual({ token: device.push.token, platform: require('react-native').Platform.OS });
  expect(registered.authorization).toBe(`Bearer ${user.token}`);

  // Log out: the token is removed (while still logged in), then the session ends
  jest.spyOn(Alert, 'alert').mockImplementation((t, m, buttons) => buttons.find((b) => b.style === 'destructive').onPress());
  await press(screen.getByTestId('settings-logout'));
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  const order = network.requests.filter((r) => /device-token|auth\/logout/.test(r.url)).map((r) => `${r.method} ${r.url}`);
  expect(order).toEqual(['POST /notifications/device-token', 'DELETE /notifications/device-token', 'POST /auth/logout']);
  const removal = network.requests.find((r) => r.method === 'DELETE');
  expect(JSON.parse(removal.data)).toEqual({ token: device.push.token });
  expect(removal.authorization).toBe(`Bearer ${user.token}`);
});

test('push already allowed: registered silently after login; a tapped push opens its trip', async () => {
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, uniqueSlot());
  device.push.permission = 'granted';
  await launchApp('/');
  await screen.findByText('Where are you headed?');
  await waitFor(() => expect(network.requests.some((r) => r.url === '/notifications/device-token')).toBe(true));
  expect(device.push.requests).toBe(0); // not asked again

  // The passenger taps a push notification about that trip
  await act(async () => {
    for (const listener of device.pushListeners.response) {
      listener({ notification: { request: { content: { data: { type: 'compatible_traveller', tripId: trip.id } } } } });
    }
  });
  expect(await screen.findByText('Find Travellers')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/matches`);
});

test('push not possible: refused in phone settings, or not set up for this build - said plainly', async () => {
  await signedInUser();
  device.push.permission = 'denied';
  device.push.canAskAgain = false;
  await launchApp('/settings');
  expect(await screen.findByTestId('push-status')).toHaveTextContent('Turned off for FlyPool in your phone’s settings.');
  expect(screen.getByText('Open phone settings')).toBeTruthy();
});

test('push not set up for this build (no EAS project id): no prompt, a clear reason', async () => {
  await signedInUser();
  delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  await launchApp('/settings');
  expect(await screen.findByTestId('push-status')).toHaveTextContent('Push notifications aren’t set up for this build of FlyPool yet.');
  expect(screen.queryByTestId('push-enable')).toBeNull();
  expect(device.push.requests).toBe(0);
});
