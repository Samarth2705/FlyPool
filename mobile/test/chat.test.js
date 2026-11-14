// Phase 10: group chat, through the real screens and a real FlyPool API
// (GET/POST /pools/:poolId/messages). Runs for iOS and Android.
// Two (or three) real accounts: this phone's passenger, and others who use
// the server directly - like a second phone. Every message is saved and
// returned by the server; updates arrive by the app's own polling.
import nodeAxios from 'axios/dist/node/axios.cjs';
import { screen, within } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { launchApp, newUserDetails, press, signedInUser, typeInto, waitFor } from './helpers';
import { ticketFor } from './tickets';

const network = globalThis.network;
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';

const randomIp = () => `10.${200 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const server = nodeAxios.create({
  baseURL: api.defaults.baseURL,
  headers: { 'X-Forwarded-For': randomIp() },
  httpAgent: new (require('node:http').Agent)({ keepAlive: false }),
});
const as = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const uuid = () => require('node:crypto').randomUUID();

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
    document: await ticketFor(token, trip),
  };
  return (await server.post(`/trips/${trip.id}/verification`, verification, as(token))).data.data.trip;
}

const book = (token, trip) => server.post(`/trips/${trip.id}/booking`, {}, as(token));
const messagesFor = async (token, poolId) => (await server.get(`/pools/${poolId}/messages`, as(token))).data.data;
const say = (token, poolId, text) => server.post(`/pools/${poolId}/messages`, { text, clientMessageId: uuid() }, as(token));

// A confirmed shared ride: another passenger ("Ravi Kumar") and this phone's
// passenger ("Asha Verma") both booked in it
async function confirmedPool() {
  const slot = uniqueSlot();
  const ravi = (await server.post('/auth/mobile/register', { ...newUserDetails(), name: 'Ravi Kumar' })).data.data;
  const raviTrip = await verifiedTrip(ravi.token, slot, { destination: 'Hiranandani Gardens, Powai' });
  const poolId = (await server.put(`/trips/${raviTrip.id}/ride`, { mode: 'shared', vehicleType: 'suv' }, as(ravi.token))).data.data.trip.poolId;

  const user = await signedInUser();
  const myTrip = await verifiedTrip(user.token, slot);
  await server.put(`/trips/${myTrip.id}/ride`, { mode: 'shared', vehicleType: 'suv', poolId }, as(user.token));
  await book(user.token, myTrip);
  await book(ravi.token, raviTrip);
  return { user, ravi, poolId, myTrip, slot };
}

const messageTexts = () => screen.queryAllByTestId('message-text').map((el) => el.props.children);

// The chat updates itself every few seconds (polling) - also while a test is
// waiting for the server. Those updates are expected, so React's act()
// checking is switched off outside RNTL's own act calls (as RNTL's waitFor
// does while it waits).
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});
afterEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

async function openChat(poolId) {
  await launchApp(`/chat/${poolId}`);
  await screen.findByTestId('chat-members');
}

test('two accounts in a confirmed shared ride: messages go both ways, in order, without duplicates', async () => {
  const { user, ravi, poolId } = await confirmedPool();
  await launchApp('/trips');
  await press(await screen.findByTestId('trip-chat')); // the entry point in My Trips
  expect(await screen.findByTestId('chat-members')).toHaveTextContent(/You, Ravi K\.|Ravi K\., You/);
  expect(screen.getByTestId('chat-members')).toHaveTextContent(/Shared SUV · 2 booked travellers/);
  expect(screen.getByTestId('chat-empty')).toBeTruthy();
  expect(screen).toHavePathname(`/chat/${poolId}`);

  // A writes
  await typeInto(screen.getByTestId('chat-input'), '  Landing at T2 - meet at exit 3?  ');
  await press(screen.getByTestId('chat-send'));
  await waitFor(() => expect(messageTexts()).toEqual(['Landing at T2 - meet at exit 3?']));
  await waitFor(() => expect(screen.queryByTestId('message-status')).toBeNull()); // no longer "Sending…"
  expect(screen.getByTestId('message-mine')).toBeTruthy();
  const post = network.requests.find((r) => r.method === 'POST' && r.url === `/pools/${poolId}/messages`);
  expect(post.authorization).toBe(`Bearer ${user.token}`);

  // B (another phone) received it, from "Asha V." - not "you"
  const seenByRavi = await messagesFor(ravi.token, poolId);
  expect(seenByRavi.messages.map((m) => [m.text, m.sender.name, m.sender.isYou])).toEqual([['Landing at T2 - meet at exit 3?', 'Asha V.', false]]);

  // B replies: it appears here by itself (polling), from "Ravi K."
  await say(ravi.token, poolId, 'Yes - see you at exit 3');
  await waitFor(() => expect(messageTexts()).toEqual(['Landing at T2 - meet at exit 3?', 'Yes - see you at exit 3']), { timeout: 12000 });
  const theirs = screen.getByTestId('message-theirs');
  expect(theirs).toHaveTextContent(/Ravi K\..*Yes - see you at exit 3/);

  // Later checks return overlapping messages: still shown once each
  await new Promise((r) => setTimeout(r, 9000));
  expect(messageTexts()).toEqual(['Landing at T2 - meet at exit 3?', 'Yes - see you at exit 3']);
  expect(screen.queryByText(/@example\.com|\+91/)).toBeNull(); // no contact details
}, 60000);

test('messages are still there when the chat is opened again later (from the server)', async () => {
  const { user, ravi, poolId } = await confirmedPool();
  await say(ravi.token, poolId, 'First');
  await say(user.token, poolId, 'Second');
  await say(ravi.token, poolId, 'Third');
  await openChat(poolId);
  await waitFor(() => expect(messageTexts()).toEqual(['First', 'Second', 'Third']));
  expect(screen.getAllByTestId('message-mine')).toHaveLength(1);
  expect(screen.getAllByTestId('message-theirs')).toHaveLength(2);
});

test('offline: shown, a message waits as "Not sent"; back online, retrying sends it once', async () => {
  const { ravi, poolId } = await confirmedPool();
  await openChat(poolId);

  network.mode = 'offline';
  await waitFor(() => expect(screen.getByTestId('connection-status')).toHaveTextContent(/Offline - trying to reconnect/), { timeout: 12000 });
  await typeInto(screen.getByTestId('chat-input'), 'Are you there?');
  await press(screen.getByTestId('chat-send'));
  await waitFor(() => expect(screen.getByTestId('message-status')).toHaveTextContent('Not sent - tap to try again'));
  expect((await messagesFor(ravi.token, poolId)).messages).toHaveLength(0);

  network.mode = 'online';
  await press(screen.getByLabelText('Not sent: Are you there?. Tap to try again'));
  await waitFor(() => expect(screen.queryByTestId('message-status')).toBeNull());
  await waitFor(() => expect(screen.queryByTestId('connection-status')).toBeNull(), { timeout: 12000 });
  expect((await messagesFor(ravi.token, poolId)).messages.map((m) => m.text)).toEqual(['Are you there?']);
  expect(messageTexts()).toEqual(['Are you there?']);
}, 60000);

test('a lost answer while sending: retrying returns the saved message, never a second copy', async () => {
  const { ravi, poolId } = await confirmedPool();
  await openChat(poolId);
  await typeInto(screen.getByTestId('chat-input'), 'Only once please');
  network.mode = 'lose-response'; // the server saves it, the answer is lost
  await press(screen.getByTestId('chat-send'));
  await waitFor(() => expect(screen.getByTestId('message-status')).toHaveTextContent('Not sent - tap to try again'));
  network.mode = 'online';
  await press(screen.getByLabelText('Not sent: Only once please. Tap to try again'));
  await waitFor(() => expect(messageTexts()).toEqual(['Only once please']));
  expect((await messagesFor(ravi.token, poolId)).messages).toHaveLength(1);
});

test('Send: empty messages can’t be sent; tapping Send again doesn’t duplicate', async () => {
  const { ravi, poolId } = await confirmedPool();
  await openChat(poolId);
  expect(screen.getByTestId('chat-send').props.accessibilityState.disabled).toBe(true);
  await typeInto(screen.getByTestId('chat-input'), '    ');
  expect(screen.getByTestId('chat-send').props.accessibilityState.disabled).toBe(true);

  await typeInto(screen.getByTestId('chat-input'), 'Hello');
  await press(screen.getByTestId('chat-send'));
  await press(screen.getByTestId('chat-send'));
  await press(screen.getByTestId('chat-send'));
  await waitFor(() => expect(messageTexts()).toEqual(['Hello']));
  // The app shows the message as soon as it's sent; the server's copy follows
  await waitFor(async () => expect((await messagesFor(ravi.token, poolId)).messages).toHaveLength(1));
  expect((await messagesFor(ravi.token, poolId)).messages).toHaveLength(1); // still one: no duplicate
});

test('someone outside the shared ride can’t open its chat, even with the right id', async () => {
  const { poolId, slot } = await confirmedPool();
  const outsider = await signedInUser(); // now this phone's passenger
  await verifiedTrip(outsider.token, slot); // compatible, but not in the ride
  await launchApp(`/chat/${poolId}`);
  expect(await screen.findByText('This chat isn’t available')).toBeTruthy();
  expect(screen.queryByTestId('chat-input')).toBeNull();
  const denied = await server.post(`/pools/${poolId}/messages`, { text: 'let me in', clientMessageId: uuid() }, as(outsider.token)).catch((e) => e.response);
  expect([denied.status, denied.data.error.code]).toEqual([404, 'CHAT_NOT_FOUND']);
});

test('solo bookings get no group chat in My Trips or Ride Management', async () => {
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, uniqueSlot(), { destination: 'Juhu' });
  await server.put(`/trips/${trip.id}/ride`, { mode: 'solo', vehicleType: 'sedan' }, as(user.token));
  await book(user.token, trip);
  await launchApp('/trips');
  const card = await screen.findByLabelText(/^Trip to Juhu/);
  expect(within(card).queryByTestId('trip-chat')).toBeNull();
  await press(card); // Ride Management: no chat for a solo ride
  await screen.findByTestId('manage-reference');
  expect(screen.queryByTestId('manage-chat')).toBeNull();
  expect(screen.queryByTestId('leave-pool')).toBeNull();
});

test('solo bookings get no group chat on the booking confirmation either', async () => {
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, uniqueSlot(), { destination: 'Juhu' });
  await server.put(`/trips/${trip.id}/ride`, { mode: 'solo', vehicleType: 'sedan' }, as(user.token));
  await book(user.token, trip);
  await launchApp(`/trip/${trip.id}/booking`);
  await screen.findByTestId('booking-reference');
  expect(screen.queryByTestId('open-chat')).toBeNull();
});

test('the confirmed shared booking offers its group chat', async () => {
  const { myTrip, poolId } = await confirmedPool();
  await launchApp(`/trip/${myTrip.id}/booking`);
  await press(await screen.findByTestId('open-chat'));
  expect(await screen.findByTestId('chat-members')).toBeTruthy();
  expect(screen).toHavePathname(`/chat/${poolId}`);
});
