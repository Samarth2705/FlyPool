// Traveller profiles, identity verification and what other passengers see -
// through the real screens and a real FlyPool API (scripts/test-api.mjs).
// Identity: the manual (demo) check, the server's default - the passenger
// uploads an ID, a FlyPool team member reviews it (server/src/scripts/
// reviewIdentity.js; the review itself is tested in server/test/integration).
// Synthetic files only.
import nodeAxios from 'axios/dist/node/axios.cjs';
import { fireEvent, screen } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { act, launchApp, newUserDetails, press, signedInUser, typeInto, waitFor } from './helpers';
import { ticketFor } from './tickets';

const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
const randomIp = () => `10.${200 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const server = nodeAxios.create({
  baseURL: api.defaults.baseURL,
  headers: { 'X-Forwarded-For': randomIp() },
  httpAgent: new (require('node:http').Agent)({ keepAlive: false }),
  validateStatus: () => true,
});
const as = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// A synthetic "ID" file: a valid PDF signature is all the server checks (nothing is read off it)
const SYNTHETIC_ID = Buffer.from('%PDF-1.4\n% SYNTHETIC TEST IDENTITY DOCUMENT - not a real ID\n%%EOF\n');

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

// Another passenger, with whatever profile they choose
async function otherPassenger({ name = 'Ravi Kumar', profile = null } = {}) {
  const { token } = (await server.post('/auth/mobile/register', { ...newUserDetails(), name })).data.data;
  if (profile) await server.patch('/profile', profile, as(token));
  return token;
}

// A native switch's state on either platform (iOS: value/disabled, Android: on/enabled)
function switchState(testID) {
  const { props } = screen.getByTestId(testID);
  return { value: props.value ?? props.on, disabled: props.disabled ?? props.enabled === false };
}

// The identity status the screen shows comes from GET /identity: for a
// reviewed check, answer as the server does after the review
function identityFromServer(identity) {
  const real = api.get.bind(api);
  jest.spyOn(api, 'get').mockImplementation(async (url, ...rest) => {
    if (url === '/identity') return { data: { success: true, data: { identity } } };
    const res = await real(url, ...rest);
    if (url === '/profile') res.data.data.profile.identity = identity; // the profile screen reads it from here
    return res;
  });
}
const reviewed = (status, extra = {}) => ({
  status,
  available: true,
  manual: true,
  methods: ['passport', 'aadhaar', 'driving_licence', 'voter_id'],
  consentVersion: '2026-11-identity-v1',
  method: 'passport',
  startedAt: '2026-11-10T10:00:00.000Z',
  verifiedAt: status === 'verified' ? '2026-11-11T10:00:00.000Z' : null,
  rejectedReason: status === 'rejected' ? 'document_unreadable' : null,
  attempts: 1,
  canStart: status === 'rejected',
  ...extra,
});

const yearsAgo = (years) => `${Number(todayInMumbai().slice(0, 4)) - years}${todayInMumbai().slice(4)}`;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});
afterEach(() => jest.restoreAllMocks());

// ---- profile ---------------------------------------------------------------------

test('profile: name, date of birth (age only shown), optional gender and whether to show it are saved on the server', async () => {
  const user = await signedInUser();
  await launchApp('/profile');
  expect(await screen.findByText('Traveller profile')).toBeTruthy();
  expect(screen.getByTestId('profile-visibility')).toHaveTextContent(/first name, last initial and age/);
  expect(switchState('show-gender').disabled).toBe(true); // no gender chosen yet
  expect(screen.getByTestId('identity-status')).toHaveTextContent('Not verified');

  await typeInto(screen.getByTestId('profile-name-input'), 'Asha Rao');
  await press(screen.getByTestId('gender-female'));
  expect(switchState('show-gender').disabled).toBe(false);
  await act(async () => fireEvent(screen.getByTestId('show-gender'), 'valueChange', true));
  await press(screen.getByTestId('profile-save'));
  expect(await screen.findByTestId('profile-saved')).toHaveTextContent(/Compatible travellers see your name, age and gender\./);

  const saved = (await server.get('/profile', as(user.token))).data.data.profile;
  expect(saved).toMatchObject({ name: 'Asha Rao', gender: 'female', profileSharing: { showGender: true } });

  // The server's own validation messages are shown on the field
  await typeInto(screen.getByTestId('profile-name-input'), 'A');
  await press(screen.getByTestId('profile-save'));
  expect(await screen.findByText('Name must be at least 2 characters.')).toBeTruthy();
  expect((await server.get('/profile', as(user.token))).data.data.profile.name).toBe('Asha Rao'); // unchanged

  // "Prefer not to say": nothing to show, so the switch turns off
  await press(screen.getByTestId('gender-none'));
  expect(switchState('show-gender').value).toBe(false);
});

test('profile: a date of birth makes an age; under-18 dates are refused by the server', async () => {
  const user = await signedInUser();
  expect((await server.patch('/profile', { dateOfBirth: yearsAgo(16) }, as(user.token))).status).toBe(400);
  await server.patch('/profile', { dateOfBirth: yearsAgo(34) }, as(user.token));
  await launchApp('/profile');
  expect(await screen.findByText(/Only your age \(34\) can be shown to others - never this date/)).toBeTruthy();
});

// ---- identity verification (manual demo check) ------------------------------------------

test('identity: document type, the ID file and consent are required; submitting makes it Pending review (server)', async () => {
  const user = await signedInUser();
  await launchApp('/identity');
  expect(await screen.findByText('Verify your identity')).toBeTruthy();
  expect(screen.getByText(/manual check \(demo\) by the FlyPool team - not an official verification/)).toBeTruthy();
  const submit = () => screen.getByTestId('identity-start');
  expect(submit()).toHaveTextContent('Submit for review');

  await press(screen.getByTestId('identity-method-passport'));
  await press(screen.getByTestId('identity-consent'));
  expect(submit().props.accessibilityState.disabled).toBe(true); // no file yet

  const uri = device.files.inCache('my-id.pdf', SYNTHETIC_ID);
  device.documentPicker.answer = { uri, name: 'my-id.pdf', mimeType: 'application/pdf', size: SYNTHETIC_ID.length };
  await press(screen.getByTestId('ticket-upload'));
  expect(await screen.findByTestId('ticket-selected')).toBeTruthy();
  await waitFor(() => expect(submit().props.accessibilityState.disabled).toBe(false));
  await press(submit());

  expect(await screen.findByTestId('identity-pending')).toHaveTextContent(/Pending review/);
  const identity = (await server.get('/identity', as(user.token))).data.data.identity;
  expect([identity.status, identity.manual, identity.method]).toEqual(['pending', true, 'passport']);
  expect(JSON.stringify(identity)).not.toMatch(/dataBase64|JVBERi0/); // the file is never sent back
  expect(device.files.cacheFiles()).not.toContain('my-id.pdf'); // the temporary copy is deleted
  // Waiting for review: no second upload
  expect(screen.queryByTestId('identity-start')).toBeNull();
  expect((await server.post('/identity/submit', { method: 'passport', consent: true, document: { mimeType: 'application/pdf', dataBase64: SYNTHETIC_ID.toString('base64') } }, as(user.token))).data.error.code).toBe('ALREADY_SUBMITTED');
});

test('identity: after review - Verified is shown, labelled as a demo check', async () => {
  await signedInUser();
  identityFromServer(reviewed('verified'));
  await launchApp('/identity');
  expect(await screen.findByTestId('identity-verified')).toHaveTextContent(/manual demo check, not an official verification/);
  expect(screen.queryByTestId('identity-start')).toBeNull();
});

test('identity: after review - Rejected shows the reason and the passenger can upload again', async () => {
  await signedInUser();
  identityFromServer(reviewed('rejected'));
  await launchApp('/identity');
  expect(await screen.findByTestId('identity-rejected')).toHaveTextContent(/couldn’t be read/);
  expect(screen.getByText('Try again')).toBeTruthy();
  expect(screen.getByTestId('identity-start')).toHaveTextContent('Submit for review');
});

test('profile card shows the identity status from the server', async () => {
  await signedInUser();
  identityFromServer(reviewed('pending', { canStart: false }));
  await launchApp('/profile');
  expect(await screen.findByTestId('identity-status')).toHaveTextContent('Pending review');
});

// ---- what other passengers see --------------------------------------------------------

test('traveller cards: name and age for everyone, gender only if chosen, ID status; nothing private', async () => {
  const slot = uniqueSlot();
  const withGender = await otherPassenger({ name: 'Ravi Kumar', profile: { dateOfBirth: yearsAgo(41), gender: 'male', profileSharing: { showGender: true } } });
  await verifiedTrip(withGender, slot);
  const noGender = await otherPassenger({ name: 'Meera Shah', profile: { dateOfBirth: yearsAgo(29), gender: 'female' } });
  await verifiedTrip(noGender, slot);
  const noBirthday = await otherPassenger({ name: 'Kabir Das' });
  await verifiedTrip(noBirthday, slot);

  const user = await signedInUser();
  const mine = await verifiedTrip(user.token, slot);
  await launchApp(`/trip/${mine.id}/matches`);
  await waitFor(() => expect(screen.getAllByTestId('traveller-card')).toHaveLength(3));
  const names = screen.getAllByTestId('traveller-name').map((n) => n.props.children);
  expect(names).toEqual(expect.arrayContaining(['Ravi K. · 41 · Male', 'Meera S. · 29', 'Kabir D.']));
  expect(screen.getAllByTestId('traveller-identity')).toHaveLength(3);
  expect(screen.getAllByText('ID not checked')).toHaveLength(3);
  // Never on screen: full names, dates of birth, a gender the passenger didn't choose to show
  for (const hidden of ['Ravi Kumar', 'Meera Shah', 'Kabir Das', yearsAgo(41), 'Female']) expect(screen.queryByText(new RegExp(hidden))).toBeNull();
});

test('shared ride: profiles before confirming (summary) and after (booking)', async () => {
  const slot = uniqueSlot();
  const ravi = await otherPassenger({ name: 'Ravi Kumar', profile: { dateOfBirth: yearsAgo(41) } });
  const raviTrip = await verifiedTrip(ravi, slot);
  const poolId = (await server.put(`/trips/${raviTrip.id}/ride`, { mode: 'shared', vehicleType: 'suv' }, as(ravi))).data.data.trip.poolId;

  const user = await signedInUser();
  const mine = await verifiedTrip(user.token, slot);
  await server.put(`/trips/${mine.id}/ride`, { mode: 'shared', vehicleType: 'suv', poolId }, as(user.token));

  await launchApp(`/trip/${mine.id}/summary`);
  expect(await screen.findByTestId('summary-other-profile-name')).toHaveTextContent('Ravi K. · 41');
  expect(screen.getByTestId('summary-other-profile-identity')).toHaveTextContent('ID not checked');

  // Both book; the booking shows who you're riding with
  await server.post(`/trips/${raviTrip.id}/booking`, {}, as(ravi));
  await server.post(`/trips/${mine.id}/booking`, {}, as(user.token));
  await launchApp(`/trip/${mine.id}/booking`);
  expect(await screen.findByTestId('booking-riding-with')).toBeTruthy();
  expect(screen.getByTestId('booking-other-profile-name')).toHaveTextContent('Ravi K. · 41');

  // An unrelated passenger can't read that booking
  const stranger = await otherPassenger({ name: 'Zoya Ali' });
  expect((await server.get(`/trips/${mine.id}/booking`, as(stranger))).status).toBe(404);
});

test('the verified flight shows five separate answers - never "confirmed with the airline" in demo mode', async () => {
  const user = await signedInUser();
  const trip = await verifiedTrip(user.token, uniqueSlot());
  await launchApp(`/trip/${trip.id}/verify`);
  expect(await screen.findByTestId('verification-levels')).toBeTruthy();
  expect(screen.getAllByTestId('level-yes')).toHaveLength(4);
  expect(screen.getAllByTestId('level-no')).toHaveLength(1);
  expect(screen.getByLabelText('Booking confirmed with the airline: no')).toBeTruthy();
  expect(screen.getByText(/not available: no airline connection/)).toBeTruthy();
  expect(await screen.findByTestId('extracted-details')).toHaveTextContent(/AirlineIndiGo.*FromDEL.*ToBOM/);
});
