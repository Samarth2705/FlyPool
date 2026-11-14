// Integration tests: the real Express app + an isolated, throwaway MongoDB
// replica set (mongodb-memory-server), so transactions behave like Atlas and
// no real data is touched. Run with: npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

// ---- environment for the app under test (set before importing it) -----------
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
Object.assign(process.env, {
  NODE_ENV: 'test',
  MONGODB_URI: replSet.getUri('flypool_test'),
  JWT_SECRET: 'integration-test-secret-that-is-long-enough-123',
  CLIENT_ORIGIN: 'http://localhost:5173',
  FLIGHT_VERIFICATION_MODE: 'demo',
  VERIFICATION_TIMEOUT_MS: '300',
  TRUST_PROXY: '1', // each test user gets its own X-Forwarded-For "IP"
  LOG_REQUESTS: 'false',
  PAYMENT_MODE: 'demo',
  PAYMENT_WEBHOOK_SECRET: 'integration-webhook-secret',
});

const { default: mongoose } = await import('mongoose');
const { default: app } = await import('../../src/app.js');
const { env } = await import('../../src/config/env.js');
const { MATCHING } = await import('../../src/config/pricing.js');
const { registerFlightVerifier } = await import('../../src/services/flightVerification.service.js');
const { Trip } = await import('../../src/models/Trip.js');
const { Pool } = await import('../../src/models/Pool.js');
const { User } = await import('../../src/models/User.js');
const { RevokedToken } = await import('../../src/models/RevokedToken.js');
const { Notification } = await import('../../src/models/Notification.js');
const { DeviceToken } = await import('../../src/models/DeviceToken.js');
const { ChatMessage } = await import('../../src/models/ChatMessage.js');
const { setPushTransport } = await import('../../src/services/push.service.js');
const { Payment } = await import('../../src/models/Payment.js');
const { PaymentEvent } = await import('../../src/models/PaymentEvent.js');
const { IdentityVerification } = await import('../../src/models/IdentityVerification.js');
const { RideIntent } = await import('../../src/models/RideIntent.js');
const { PoolLock } = await import('../../src/models/PoolLock.js');
const { stopTicketReader } = await import('../../src/services/ticketReader.service.js');
const T = await import('../helpers/tickets.js');

let server;
let base;

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([User.init(), Trip.init(), Pool.init(), RevokedToken.init(), Notification.init(), DeviceToken.init(), ChatMessage.init(), Payment.init(), PaymentEvent.init(), IdentityVerification.init(), RideIntent.init(), PoolLock.init()]); // build unique indexes first
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await stopTicketReader();
  server?.close();
  await mongoose.disconnect();
  await replSet.stop();
});

// ---- helpers --------------------------------------------------------------------
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
// A ticket PDF showing this passenger's name, flight and date (test/helpers/tickets.js)
const ticketFor = (u, { airline = 'Air India', flightNumber = 'AI123', date = FUTURE_DATE, ...rest } = {}) =>
  T.asDocument(T.ticketPdf(T.ticketLines({ name: u.name, airline, flightNumber, date, ...rest })), 'application/pdf');
const FUTURE_DATE = '2026-12-20';
let userCounter = 0;

function client(ip) {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const json = await res.json();
    return { status: res.status, headers: res.headers, ...json };
  };
  call.cookie = () => cookie; // the current "token=..." cookie, to replay it in tests
  return call;
}

// One request with a given cookie, e.g. a copy of a token taken before logout
async function withCookie(cookie, method, path) {
  const res = await fetch(base + path, { method, headers: { cookie } });
  return { status: res.status, setCookie: res.headers.get('set-cookie'), ...(await res.json()) };
}

async function newUser() {
  userCounter += 1;
  const n = userCounter;
  const api = client(`10.0.${Math.floor(n / 250)}.${n % 250}`);
  const res = await api('POST', '/auth/register', {
    name: `Test User ${n}`,
    email: `user${n}@test.flypool.invalid`,
    phone: `9${String(100000000 + n)}`,
    password: 'secret123',
  });
  assert.equal(res.status, 201, JSON.stringify(res.error));
  return { api, name: `Test User ${n}`, email: `user${n}@test.flypool.invalid`, userId: res.data.user.id };
}

const tripBody = (overrides = {}) => ({
  pickupLocation: AIRPORT,
  pickupTerminal: 'T2',
  destination: 'Andheri West',
  travelDate: FUTURE_DATE,
  expectedArrivalTime: '10:00',
  passengerCount: 1,
  luggageCount: 1,
  ...overrides,
});

// A user with one trip, verified unless verify=false
async function passenger({ verify = true, airline = 'Air India', flightNumber = 'AI123', user, ...trip } = {}) {
  const u = user ?? (await newUser());
  const created = await u.api('POST', '/trips', tripBody(trip));
  assert.equal(created.status, 201, JSON.stringify(created.error));
  const id = created.data.trip.id;
  if (verify) {
    const v = await u.api('POST', `/trips/${id}/verification`, {
      airline,
      flightNumber,
      scheduledArrivalTime: created.data.trip.expectedArrivalTime,
      // the ticket names the trip's airport (Mumbai BOM by default, or Navi Mumbai NMI)
      document: ticketFor(u, { airline, flightNumber, date: created.data.trip.travelDate, ...(created.data.trip.airport === 'NMI' ? { to: 'NMI Navi Mumbai T1' } : {}) }),
    });
    assert.equal(v.status, 200, JSON.stringify(v.error));
  }
  return { ...u, id };
}

const options = async (p) => (await p.api('GET', `/trips/${p.id}/matches`)).data;
const choose = (p, body) => p.api('PUT', `/trips/${p.id}/ride`, body);
const poolsFor = (opts, type) => opts.vehicles.find((v) => v.type === type).pools;

// ---- 1. authentication -----------------------------------------------------------
test('signup, login, logout, duplicate accounts and wrong passwords', async () => {
  const { api, email } = await newUser();
  const current = await api('GET', '/trips/current');
  assert.deepEqual(current.data, { trip: null, nextStep: null }); // new user -> Trip Details

  const dupEmail = await client('10.9.0.1')('POST', '/auth/register', { name: 'X Y', email, phone: '9876500001', password: 'secret123' });
  assert.equal(dupEmail.error.code, 'EMAIL_TAKEN');

  const wrong = await client('10.9.0.2')('POST', '/auth/login', { email, password: 'wrongpass' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.error.message, 'Email or password is incorrect.');

  assert.equal((await api('POST', '/auth/logout')).status, 200);
  assert.equal((await api('GET', '/auth/me')).status, 401);
  assert.equal((await api('GET', '/trips')).status, 401);
  const relog = await api('POST', '/auth/login', { email, password: 'secret123' });
  assert.equal(relog.status, 200);
});

test('logout ends the session on the server, not just in the browser', async () => {
  const { api } = await newUser();
  const stolenCopy = api.cookie();
  assert.equal((await withCookie(stolenCopy, 'GET', '/trips')).status, 200);

  const out = await api('POST', '/auth/logout');
  assert.equal(out.status, 200);
  assert.match(out.headers.get('set-cookie'), /token=;/); // cookie cleared

  // The copied token no longer works anywhere, and its cookie is cleared again
  const replay = await withCookie(stolenCopy, 'GET', '/trips');
  assert.equal(replay.status, 401);
  assert.equal(replay.error.code, 'INVALID_TOKEN');
  assert.match(replay.setCookie, /token=;/);
  assert.equal((await withCookie(stolenCopy, 'GET', '/auth/me')).status, 401);
  assert.equal((await withCookie(stolenCopy, 'POST', `/trips/${'a'.repeat(24)}/verification`)).status, 401);

  // Only a hash is stored, never the token, and it expires with the token
  const entry = await RevokedToken.findOne().lean();
  assert.ok(!JSON.stringify(entry).includes(stolenCopy.split('=')[1]));
  assert.ok(entry.expiresAt > new Date());

  // Logging out twice, or with no cookie at all, is harmless
  assert.equal((await withCookie(stolenCopy, 'POST', '/auth/logout')).status, 200);
  assert.equal((await withCookie('', 'POST', '/auth/logout')).status, 200);
});

test('expired, tampered and wrongly signed tokens are rejected and cleared', async () => {
  const { default: jwt } = await import('jsonwebtoken');
  const { userId } = await newUser();
  const expired = jwt.sign({ sub: userId, exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET);
  const otherKey = jwt.sign({ sub: userId }, 'some-other-secret-that-is-long-enough-000');
  const unsigned = jwt.sign({ sub: userId }, null, { algorithm: 'none' });
  for (const token of [expired, otherKey, unsigned, 'garbage']) {
    const res = await withCookie(`token=${token}`, 'GET', '/trips');
    assert.equal(res.status, 401);
    assert.equal(res.error.code, 'INVALID_TOKEN');
    assert.match(res.setCookie, /token=;/);
  }
  assert.equal((await withCookie('', 'GET', '/trips')).error.code, 'AUTH_REQUIRED');
});

test('API responses are never cached', async () => {
  const { api } = await newUser();
  assert.equal((await api('GET', '/auth/me')).headers.get('cache-control'), 'no-store');
});

// ---- 1b. mobile app sessions (bearer tokens) -------------------------------------
let mobileCounter = 0;

// A client that behaves like the app: bearer token, never cookies
function mobileClient(ip, token = null) {
  const call = async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ip,
        ...(call.token ? { Authorization: `Bearer ${call.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, ...(await res.json()) };
  };
  call.token = token;
  return call;
}

async function newMobileUser() {
  mobileCounter += 1;
  const n = mobileCounter;
  const api = mobileClient(`10.20.${Math.floor(n / 250)}.${n % 250}`);
  const details = { name: `Mobile User ${n}`, email: `mobile${n}@test.flypool.invalid`, phone: `8${String(100000000 + n)}`, password: 'secret123' };
  const res = await api('POST', '/auth/mobile/register', details);
  assert.equal(res.status, 201, JSON.stringify(res.error));
  api.token = res.data.token;
  return { api, ...details, userId: res.data.user.id, registered: res };
}

test('mobile register/login return { user, token, expiresAt } and set no cookie', async () => {
  const { default: jwt } = await import('jsonwebtoken');
  const { api, email, registered } = await newMobileUser();

  assert.deepEqual(Object.keys(registered.data).sort(), ['expiresAt', 'token', 'user']);
  assert.equal(registered.headers.get('set-cookie'), null);
  assert.equal(registered.data.user.password, undefined);
  const payload = jwt.decode(registered.data.token);
  assert.equal(payload.typ, 'mobile');
  assert.equal(payload.sub, registered.data.user.id);
  // 30 days by default, and expiresAt is the token's real expiry
  const days = (new Date(registered.data.expiresAt) - Date.now()) / 86_400_000;
  assert.ok(days > 29.9 && days <= 30, `expires in ${days} days`);
  assert.equal(new Date(registered.data.expiresAt).getTime(), payload.exp * 1000);

  // The token works on protected routes
  const me = await api('GET', '/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.email, email);
  assert.equal((await api('GET', '/trips')).status, 200);

  // Login: same checks and messages as the website
  const anon = mobileClient('10.21.0.1');
  const login = await anon('POST', '/auth/mobile/login', { email, password: 'secret123' });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get('set-cookie'), null);
  assert.equal(jwt.decode(login.data.token).typ, 'mobile');
  const wrong = await anon('POST', '/auth/mobile/login', { email, password: 'wrongpass' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.error.message, 'Email or password is incorrect.');
  const invalid = await mobileClient('10.21.0.2')('POST', '/auth/mobile/register', { name: 'A B', email: 'x@y.co', phone: '123', password: 'secret123' });
  assert.equal(invalid.error.code, 'VALIDATION_ERROR');
  assert.equal(invalid.error.details[0].message, 'Enter a valid 10-digit mobile number.');
  const dupe = await mobileClient('10.21.0.3')('POST', '/auth/mobile/register', { name: 'A B', email, phone: '9876511111', password: 'secret123' });
  assert.equal(dupe.error.code, 'EMAIL_TAKEN');
});

test('mobile and website tokens only work on their own channel', async () => {
  const { api: mobile } = await newMobileUser();
  const { api: web } = await newUser();
  const webToken = web.cookie().split('=')[1];

  // App token sent as the website cookie: refused (and the cookie cleared)
  const asCookie = await withCookie(`token=${mobile.token}`, 'GET', '/trips');
  assert.equal(asCookie.status, 401);
  assert.equal(asCookie.error.code, 'INVALID_TOKEN');
  // Website token sent as a bearer token: refused
  assert.equal((await mobileClient('10.22.0.1', webToken)('GET', '/trips')).error.code, 'INVALID_TOKEN');
  // Malformed Authorization headers: refused, never ignored
  for (const header of ['Bearer', 'Basic abc', `Bearer ${mobile.token} extra`, 'bearer']) {
    const res = await fetch(`${base}/trips`, { headers: { Authorization: header, 'X-Forwarded-For': '10.22.0.2' } });
    assert.equal(res.status, 401, header);
  }
  // The website's own cookie login still works exactly as before
  assert.equal((await web('GET', '/auth/me')).status, 200);
});

test('mobile logout revokes only that device token', async () => {
  const { api: phone, email } = await newMobileUser();
  const tablet = mobileClient('10.23.0.1');
  tablet.token = (await tablet('POST', '/auth/mobile/login', { email, password: 'secret123' })).data.token;
  const stolenCopy = phone.token;

  assert.equal((await phone('POST', '/auth/logout')).status, 200);
  const replay = await mobileClient('10.23.0.2', stolenCopy)('GET', '/auth/me');
  assert.equal(replay.status, 401);
  assert.equal(replay.error.code, 'INVALID_TOKEN');
  assert.equal((await tablet('GET', '/auth/me')).status, 200); // other device still logged in
});

test('trips created with a bearer token persist and are idempotent per clientRequestId', async () => {
  const { api, userId } = await newMobileUser();
  const clientRequestId = crypto.randomUUID();
  const first = await api('POST', '/trips', { ...tripBody(), clientRequestId });
  const again = await api('POST', '/trips', { ...tripBody(), clientRequestId });
  assert.equal(first.status, 201);
  assert.equal(again.status, 200);
  assert.equal(again.data.trip.id, first.data.trip.id);
  const saved = await Trip.find({ userId });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].destination, 'Andheri West');
});

test('deleting an account removes the user, cancels upcoming trips, keeps past ones', async () => {
  const user = await newMobileUser();
  const web = client('10.24.0.1');
  assert.equal((await web('POST', '/auth/login', { email: user.email, password: 'secret123' })).status, 200);

  // An upcoming trip in a shared ride (own date, so other tests never match it), and a past trip
  const upcoming = await passenger({ user: { api: user.api, name: user.name }, travelDate: '2026-12-27' });
  assert.equal((await choose(upcoming, { mode: 'shared', vehicleType: 'sedan' })).status, 200);
  const poolId = (await Trip.findById(upcoming.id)).poolId;
  const past = await Trip.create({
    userId: user.userId,
    pickupLocation: AIRPORT,
    pickupTerminal: 'T1',
    destination: 'Powai',
    travelDate: '2025-01-10',
    expectedArrivalTime: '09:00',
    arrivalAt: new Date('2025-01-10T03:30:00Z'),
    passengerCount: 1,
    luggageCount: 1,
    status: 'ride_selected',
  });

  const wrong = await user.api('DELETE', '/auth/me', { password: 'not-it' });
  assert.equal(wrong.status, 403);
  assert.equal(wrong.error.code, 'INVALID_PASSWORD');
  assert.ok(await User.exists({ _id: user.userId }));

  const missing = await user.api('DELETE', '/auth/me', {});
  assert.equal(missing.error.code, 'VALIDATION_ERROR');

  assert.equal((await user.api('DELETE', '/auth/me', { password: 'secret123' })).status, 200);

  assert.equal(await User.exists({ _id: user.userId }), null); // name, email, phone, password gone
  const cancelled = await Trip.findById(upcoming.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.poolId, null);
  const pool = await Pool.findById(poolId);
  assert.ok(!pool.members.some((m) => String(m.tripId) === upcoming.id)); // seat freed
  const kept = await Trip.findById(past.id);
  assert.equal(kept.status, 'ride_selected'); // past trip kept as it was

  // Every session of the account stops working: this app token and the website cookie
  assert.equal((await user.api('GET', '/auth/me')).status, 401);
  assert.equal((await web('GET', '/trips')).status, 401);
  // The email and phone can be used again
  const again = await mobileClient('10.24.0.2')('POST', '/auth/mobile/register', {
    name: user.name,
    email: user.email,
    phone: user.phone,
    password: 'secret123',
  });
  assert.equal(again.status, 201);

  // Leave the database as other tests expect it (they count shared rides)
  await Pool.deleteOne({ _id: poolId });
});

test('login attempts are rate limited per IP', async () => {
  const api = client('10.9.9.9');
  let last;
  for (let i = 0; i < 21; i++) last = await api('POST', '/auth/login', { email: 'nobody@test.flypool.invalid', password: 'x' });
  assert.equal(last.status, 429);
});

// ---- 2. trips ----------------------------------------------------------------------
test('trip creation persists, retries do not duplicate, current trip follows status', async () => {
  const u = await newUser();
  const requestId = crypto.randomUUID();
  const [a, b] = await Promise.all([
    u.api('POST', '/trips', { ...tripBody(), clientRequestId: requestId }),
    u.api('POST', '/trips', { ...tripBody(), clientRequestId: requestId }),
  ]);
  assert.equal(a.data.trip.id, b.data.trip.id);
  assert.equal((await u.api('GET', '/trips')).data.trips.length, 1);

  const id = a.data.trip.id;
  assert.equal((await u.api('GET', `/trips/${id}`)).data.trip.destination, 'Andheri West');
  assert.deepEqual((await u.api('GET', '/trips/current')).data.nextStep, 'verify');

  const edited = await u.api('PATCH', `/trips/${id}`, { destination: 'Juhu' });
  assert.equal(edited.data.trip.id, id);
  assert.equal(edited.data.trip.userId, u.userId);
  assert.equal((await u.api('PATCH', `/trips/${id}`, { userId: '000000000000000000000000' })).status, 400);
  assert.equal((await u.api('PATCH', `/trips/${id}`, { status: 'ride_selected' })).status, 400);
});

// ---- 14 + 15. flight verification ---------------------------------------------------
test('verification failure keeps the trip unchanged and the passenger can retry', async () => {
  const p = await passenger({ verify: false, expectedArrivalTime: '09:00' });
  const wrongAirline = await p.api('POST', `/trips/${p.id}/verification`, {
    airline: 'Indigo Airlines', flightNumber: 'AI 123', scheduledArrivalTime: '11:30', document: ticketFor(p, { flightNumber: 'AI 123' }),
  });
  assert.equal(wrongAirline.status, 422);
  assert.match(wrongAirline.error.message, /operated by Air India/);

  let trip = (await p.api('GET', `/trips/${p.id}`)).data.trip;
  assert.equal(trip.expectedArrivalTime, '09:00'); // not overwritten by the failed attempt
  assert.equal(trip.flight, undefined);
  assert.equal(trip.status, 'awaiting_verification');
  assert.equal(trip.verification.status, 'failed');

  for (const [airline, flightNumber] of [['Some Airline', 'ZZ 999'], ['Vistara', 'UK 945']]) {
    const unknown = await p.api('POST', `/trips/${p.id}/verification`, { airline, flightNumber, scheduledArrivalTime: '11:30', document: ticketFor(p, { airline, flightNumber }) });
    assert.equal(unknown.status, 422, `${airline} ${flightNumber} must not verify`);
  }
  const malformed = await p.api('POST', `/trips/${p.id}/verification`, { airline: 'IndiGo', flightNumber: 'hello', scheduledArrivalTime: '11:30', document: ticketFor(p) });
  assert.equal(malformed.status, 400);
  const fakeFile = await p.api('POST', `/trips/${p.id}/verification`, {
    airline: 'Air India', flightNumber: 'AI 123', scheduledArrivalTime: '11:30',
    document: { mimeType: 'image/png', dataBase64: Buffer.from('not an image').toString('base64') },
  });
  assert.equal(fakeFile.error.code, 'INVALID_DOCUMENT');

  const retry = await p.api('POST', `/trips/${p.id}/verification`, { airline: 'Air India', flightNumber: 'aic 0123', scheduledArrivalTime: '11:30', document: ticketFor(p, { flightNumber: 'AI 123' }) });
  assert.equal(retry.status, 200);
  trip = retry.data.trip;
  assert.equal(trip.status, 'flight_verified');
  assert.equal(trip.flight.flightNumber, 'AI123'); // ICAO + leading zero normalised
  assert.equal(trip.expectedArrivalTime, '11:30');
  assert.equal(trip.verification.method, 'demo');
});

test('verification unavailable or failing service never reports success', async () => {
  const p = await passenger({ verify: false });
  const call = () => p.api('POST', `/trips/${p.id}/verification`, { airline: 'Air India', flightNumber: 'AI123', scheduledArrivalTime: '10:00', document: ticketFor(p) });
  const original = env.flightVerificationMode;
  try {
    env.flightVerificationMode = 'off'; // e.g. production without a provider configured
    assert.equal((await call()).error.code, 'VERIFICATION_UNAVAILABLE');

    registerFlightVerifier('broken', () => { throw new Error('provider HTTP 500'); });
    env.flightVerificationMode = 'broken';
    assert.equal((await call()).error.code, 'VERIFICATION_SERVICE_ERROR');

    registerFlightVerifier('slow', () => new Promise((resolve) => setTimeout(() => resolve({ passed: true, checks: [] }), 2000)));
    env.flightVerificationMode = 'slow';
    assert.equal((await call()).error.code, 'VERIFICATION_SERVICE_ERROR'); // timed out

    registerFlightVerifier('garbage', () => ({ ok: 'yes' }));
    env.flightVerificationMode = 'garbage';
    assert.equal((await call()).error.code, 'VERIFICATION_SERVICE_ERROR');
  } finally {
    env.flightVerificationMode = original;
  }
  const trip = (await p.api('GET', `/trips/${p.id}`)).data.trip;
  assert.equal(trip.status, 'awaiting_verification');
  assert.equal(trip.verification.status, 'not_started'); // nothing recorded
});

test('Phase 15: the document is read - blank, unrelated and mismatched tickets are refused through the API', async () => {
  const p = await passenger({ verify: false, travelDate: '2027-01-15', expectedArrivalTime: '08:00' });
  const send = (document, flightNumber = 'AI 123') =>
    p.api('POST', `/trips/${p.id}/verification`, { airline: 'Air India', flightNumber, scheduledArrivalTime: '08:00', document });
  const date = '2027-01-15';

  // Black image, unrelated photo, other flight, other date: each refused with its reason
  const attempts = [
    [T.asDocument(await T.blankImage('#000000'), 'image/jpeg'), 'document_readable', /looks blank/],
    [T.asDocument(await T.photoImage(), 'image/jpeg'), 'ticket_document', /doesn’t look like a boarding pass/],
    [ticketFor(p, { flightNumber: 'AI 456', date }), 'document_flight_number', /shows flight AI 456, not AI 123/],
    [ticketFor(p, { flightNumber: 'AI 123', date: '2027-01-22' }), 'document_date', /but your trip is on 15 Jan 2027/],
  ];
  for (const [document, check, message] of attempts) {
    const res = await send(document);
    assert.equal(res.status, 422, check);
    assert.equal(res.error.code, 'VERIFICATION_FAILED');
    assert.match(res.error.message, message);
    assert.deepEqual(res.error.details.map((d) => d.name), [check]);
  }
  let trip = (await p.api('GET', `/trips/${p.id}`)).data.trip;
  assert.equal(trip.status, 'awaiting_verification'); // nothing approved
  assert.equal(trip.verification.status, 'failed');
  assert.equal(trip.flight, undefined);

  // A damaged file is refused as a file (400), not "checked"
  const broken = await send({ mimeType: 'application/pdf', dataBase64: Buffer.from('%PDF-1.4\nbroken').toString('base64') });
  assert.equal(broken.error.code, 'INVALID_DOCUMENT');

  // The right ticket verifies - labelled as a demo check, with what was read stored as facts only
  const ok = await send(ticketFor(p, { flightNumber: 'AI 123', date }));
  assert.equal(ok.status, 200, JSON.stringify(ok.error));
  trip = ok.data.trip;
  assert.equal(trip.status, 'flight_verified');
  assert.equal(trip.verification.method, 'demo');
  assert.equal(trip.verification.extraction.status, 'read');
  assert.equal(trip.verification.extraction.source, 'pdf_text');
  // Five separate answers - and demo mode never claims the booking is authentic
  assert.deepEqual(trip.verification.levels, { fileAccepted: true, documentReadable: true, detailsExtracted: true, detailsMatched: true, authenticityConfirmed: false });
  assert.equal(trip.verification.authenticity.confirmed, false);
  assert.deepEqual(
    { ...trip.verification.extraction.details },
    { airline: 'Air India', flightNumber: 'AI123', departureAirport: 'DEL', arrivalAirport: 'BOM', date, departureTime: null },
  );
  assert.deepEqual(trip.verification.extraction.flightNumbers, ['AI123']);
  assert.ok(trip.verification.extraction.dates.includes(date));
  const stored = JSON.stringify((await Trip.findById(p.id)).toObject());
  for (const text of [p.name, 'X7K2QZ', 'E-TICKET']) assert.equal(stored.includes(text), false, `stored ${text}`);
});

test('the 8 MB upload route rejects anonymous requests before reading the body', async () => {
  const res = await fetch(`${base}/trips/000000000000000000000000/verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.8.0.1' },
    body: JSON.stringify({ blob: 'x'.repeat(2 * 1024 * 1024) }),
  });
  assert.equal(res.status, 401);
});

// ---- 3-11. matching, shared pools, vehicles, solo ----------------------------------
test('two compatible passengers find each other and share ONE pool', async () => {
  const A = await passenger({ expectedArrivalTime: '10:00' });
  const B = await passenger({ expectedArrivalTime: '10:10' });

  const seenByB = await options(B);
  assert.equal(seenByB.travellers.length, 1);
  assert.equal(seenByB.travellers[0].sameFlight, true);
  assert.equal(seenByB.travellers[0].minutesApart, -10);
  assert.ok(!JSON.stringify(seenByB).includes(A.email), 'no private data of others');
  assert.equal((await options(A)).travellers.length, 1); // A sees B, never itself
  assert.equal(await Pool.countDocuments(), 0, 'reading Page 4 creates nothing');

  const [s1, s2] = await Promise.all([choose(A, { mode: 'shared', vehicleType: 'sedan' }), choose(A, { mode: 'shared', vehicleType: 'sedan' })]);
  assert.equal(s1.data.trip.poolId, s2.data.trip.poolId, 'double click -> one pool');
  const poolId = s1.data.trip.poolId;

  const offered = poolsFor(await options(B), 'sedan');
  assert.equal(offered.length, 1);
  assert.equal(offered[0].id, poolId);
  assert.equal(poolsFor(await options(B), 'suv').length, 0, 'a sedan pool is not offered as an SUV');

  const joined = await choose(B, { mode: 'shared', vehicleType: 'sedan', poolId });
  assert.equal(joined.data.trip.poolId, poolId);
  await choose(B, { mode: 'shared', vehicleType: 'sedan', poolId }); // repeated request
  const pool = await Pool.findById(poolId);
  assert.equal(pool.members.length, 2);
  assert.equal(pool.seatsTaken, 2);

  // Both see the same cab and consistent fares
  const rideA = (await A.api('GET', `/trips/${A.id}/ride`)).data.ride;
  const rideB = (await B.api('GET', `/trips/${B.id}/ride`)).data.ride;
  assert.equal(rideA.pool.id, rideB.pool.id);
  assert.equal(rideA.pool.fare.total, rideB.pool.fare.total);
  assert.equal(rideA.pool.fare.yourShare + rideB.pool.fare.yourShare, rideA.pool.fare.total);
  assert.equal(rideA.pool.status, 'open');
  assert.ok(!/driver/i.test(JSON.stringify(rideA)));

  // A second trip of the same user can't join their own pool
  const A2 = await passenger({ user: A, expectedArrivalTime: '10:05' });
  assert.equal((await choose(A2, { mode: 'shared', vehicleType: 'sedan', poolId })).error.code, 'POOL_UNAVAILABLE');
  assert.equal((await choose(B, { mode: 'shared', vehicleType: 'suv', poolId })).error.code, 'VEHICLE_MISMATCH');
});

test('incompatible flights, dates, terminals and destinations are not matched', async () => {
  const me = await passenger({ travelDate: '2026-12-21', expectedArrivalTime: '15:00' });
  await passenger({ travelDate: '2026-12-21', expectedArrivalTime: '15:00', destination: 'Colaba' });
  await passenger({ travelDate: '2026-12-22', expectedArrivalTime: '15:00' });
  await passenger({ travelDate: '2026-12-21', expectedArrivalTime: '15:00', pickupTerminal: 'T1' });
  await passenger({ travelDate: '2026-12-21', expectedArrivalTime: '16:30' });
  const sameAreaOtherFlight = await passenger({ travelDate: '2026-12-21', expectedArrivalTime: '15:20', airline: 'IndiGo', flightNumber: '6E 501' });

  let found = (await options(me)).travellers;
  assert.equal(found.length, 1, 'only the compatible traveller (different flight, same area, 20 min)');
  assert.equal(found[0].sameFlight, false);

  MATCHING.requireSameFlight = true; // configured rule: same flight only
  try {
    found = (await options(me)).travellers;
    assert.equal(found.length, 0);
  } finally {
    MATCHING.requireSameFlight = false;
  }
  assert.ok(sameAreaOtherFlight.id);
});

test('vehicle capacity is enforced, including two users racing for the last seat', async () => {
  const date = '2026-12-23';
  const G = await passenger({ travelDate: date, destination: 'Juhu', passengerCount: 3, luggageCount: 0 });
  const poolId = (await choose(G, { mode: 'shared', vehicleType: 'sedan' })).data.trip.poolId;
  const H = await passenger({ travelDate: date, destination: 'Juhu', luggageCount: 0, expectedArrivalTime: '10:02' });
  const I = await passenger({ travelDate: date, destination: 'Juhu', luggageCount: 0, expectedArrivalTime: '10:03' });

  const race = await Promise.all([
    choose(H, { mode: 'shared', vehicleType: 'sedan', poolId }),
    choose(I, { mode: 'shared', vehicleType: 'sedan', poolId }),
  ]);
  assert.equal(race.filter((r) => r.status === 200).length, 1, 'exactly one gets the last seat');
  assert.equal(race.filter((r) => r.error?.code === 'POOL_FULL').length, 1);
  const pool = await Pool.findById(poolId);
  assert.equal(pool.seatsTaken, 4);
  assert.equal(pool.members.length, 2);

  const J = await passenger({ travelDate: date, destination: 'Juhu', luggageCount: 0, expectedArrivalTime: '10:04' });
  assert.ok(!poolsFor(await options(J), 'sedan').some((p) => p.id === poolId), 'a full pool is not offered');
  assert.equal((await choose(J, { mode: 'shared', vehicleType: 'sedan', poolId })).error.code, 'POOL_FULL');

  const big = await passenger({ travelDate: date, passengerCount: 5, luggageCount: 2 });
  assert.equal((await choose(big, { mode: 'solo', vehicleType: 'sedan' })).error.code, 'VEHICLE_TOO_SMALL');
  const suv = await choose(big, { mode: 'solo', vehicleType: 'suv' });
  assert.equal(suv.data.ride.soloFare.people, 5);
});

test('solo rides stay separate; switching modes and vehicles persists consistently', async () => {
  const date = '2026-12-24';
  const S = await passenger({ travelDate: date });
  const watcher = await passenger({ travelDate: date, expectedArrivalTime: '10:05' });

  const solo = await choose(S, { mode: 'solo', vehicleType: 'sedan' });
  assert.equal(solo.data.trip.rideMode, 'solo');
  assert.equal(solo.data.trip.poolId ?? null, null);
  assert.equal(await Pool.countDocuments({ 'members.tripId': S.id }), 0);
  assert.equal(solo.data.ride.soloFare.people, 1, 'solo fare is not split');
  assert.equal((await options(watcher)).travellers.length, 0, 'solo travellers are hidden from others');

  const toSuvShared = await choose(S, { mode: 'shared', vehicleType: 'suv' });
  assert.equal(toSuvShared.data.ride.vehicleType, 'suv');
  assert.equal((await options(watcher)).travellers.length, 1);
  assert.equal(poolsFor(await options(watcher), 'suv').length, 1);

  const backToSolo = await choose(S, { mode: 'solo', vehicleType: 'suv' });
  assert.equal(backToSolo.data.trip.poolId ?? null, null);
  assert.equal((await Pool.findById(toSuvShared.data.trip.poolId)).status, 'cancelled', 'empty pool closed');

  const after = (await S.api('GET', `/trips/${S.id}/ride`)).data.ride; // "refresh"
  assert.deepEqual([after.mode, after.vehicleType], ['solo', 'suv']);
  const listed = (await S.api('GET', '/trips')).data.trips.find((t) => t.id === S.id);
  assert.equal(listed.ride.mode, 'solo');
});

// ---- 12. cancellation and status rules --------------------------------------------
test('cancelling leaves the pool; confirmed pools and past trips cannot be changed', async () => {
  const date = '2026-12-26';
  const P = await passenger({ travelDate: date, destination: 'Bandra West' });
  const Q = await passenger({ travelDate: date, destination: 'Bandra West', expectedArrivalTime: '10:05' });
  const poolId = (await choose(P, { mode: 'shared', vehicleType: 'sedan' })).data.trip.poolId;
  await choose(Q, { mode: 'shared', vehicleType: 'sedan', poolId });

  const cancelled = await Q.api('PATCH', `/trips/${Q.id}`, { status: 'cancelled' });
  assert.equal(cancelled.data.trip.status, 'cancelled');
  let pool = await Pool.findById(poolId);
  assert.equal(pool.members.length, 1);
  assert.equal((await Q.api('PATCH', `/trips/${Q.id}`, { status: 'cancelled' })).error.code, 'TRIP_CANCELLED');
  assert.equal((await choose(Q, { mode: 'solo', vehicleType: 'sedan' })).error.code, 'TRIP_CANCELLED');

  // A confirmed shared ride (simulating a future booking feature) is never changed silently
  const R = await passenger({ travelDate: date, destination: 'Bandra West', expectedArrivalTime: '10:07' });
  await choose(R, { mode: 'shared', vehicleType: 'sedan', poolId });
  await Pool.updateOne({ _id: poolId }, { $set: { status: 'confirmed' } });
  assert.equal((await choose(R, { mode: 'solo', vehicleType: 'sedan' })).error.code, 'POOL_CONFIRMED');
  assert.equal((await R.api('PATCH', `/trips/${R.id}`, { status: 'cancelled' })).error.code, 'POOL_CONFIRMED');
  pool = await Pool.findById(poolId);
  assert.equal(pool.members.length, 2);

  // A trip that has already happened can't be cancelled
  const past = await passenger({ travelDate: date, verify: false });
  await Trip.updateOne({ _id: past.id }, { $set: { arrivalAt: new Date(Date.now() - 3600 * 1000) } });
  assert.equal((await past.api('PATCH', `/trips/${past.id}`, { status: 'cancelled' })).error.code, 'TRIP_IN_PAST');
});

// ---- 12b. booking confirmation ----------------------------------------------------
test('booking: validated, saved with a server reference, safe to repeat, locks the ride, cancelled with the trip', async () => {
  const date = '2026-12-28';
  const book = (p, body = {}) => p.api('POST', `/trips/${p.id}/booking`, body);

  // Not verified / no ride chosen yet
  const unverified = await passenger({ travelDate: date, destination: 'Powai', verify: false });
  assert.equal((await book(unverified)).error.code, 'FLIGHT_NOT_VERIFIED');
  const S = await passenger({ travelDate: date, destination: 'Powai', expectedArrivalTime: '11:00' });
  assert.equal((await book(S)).error.code, 'RIDE_NOT_SELECTED');

  // Solo SUV
  const chosen = (await choose(S, { mode: 'solo', vehicleType: 'suv' })).data;
  const share = chosen.ride.soloFare.total;
  assert.ok(chosen.ride.soloFare.breakdown.baseFare > 0); // the estimate explains itself
  // What the passenger reviewed no longer matches -> review again, nothing saved
  assert.equal((await book(S, { mode: 'solo', vehicleType: 'sedan' })).error.code, 'BOOKING_REVIEW_CHANGED');
  assert.equal((await book(S, { mode: 'solo', vehicleType: 'suv', poolId: null, yourShare: share + 10 })).error.code, 'BOOKING_REVIEW_CHANGED');
  assert.equal((await Trip.findById(S.id)).booking, null);
  // Unknown fields are refused
  assert.equal((await book(S, { status: 'confirmed' })).error.code, 'VALIDATION_ERROR');

  // Two confirmations at the same moment -> ONE booking
  const reviewed = { mode: 'solo', vehicleType: 'suv', poolId: null, yourShare: share };
  const [a, b] = await Promise.all([book(S, reviewed), book(S, reviewed)]);
  assert.deepEqual([a.status, b.status].sort(), [200, 201]);
  assert.equal(a.data.booking.reference, b.data.booking.reference);
  assert.match(a.data.booking.reference, /^FP-[A-HJ-NP-Z2-9]{8}$/);
  const saved = await Trip.findById(S.id);
  assert.equal(saved.booking.reference, a.data.booking.reference);
  assert.equal(saved.booking.status, 'confirmed');
  assert.equal(saved.booking.mode, 'solo');
  assert.equal(saved.booking.fare.total, share);
  assert.deepEqual(saved.booking.travellers, []);
  // Later repeats return the same booking; the ride can no longer change
  const again = await book(S);
  assert.equal(again.status, 200);
  assert.equal(again.data.booking.reference, saved.booking.reference);
  assert.equal((await choose(S, { mode: 'solo', vehicleType: 'sedan' })).error.code, 'BOOKING_CONFIRMED');
  // My Trips sees it; nobody else can book this trip
  const listed = (await S.api('GET', '/trips')).data.trips.find((t) => t.id === S.id);
  assert.equal(listed.booking.reference, saved.booking.reference);
  const stranger = await newUser();
  assert.equal((await stranger.api('POST', `/trips/${S.id}/booking`, {})).error.code, 'TRIP_NOT_FOUND');

  // Shared: nobody joined yet -> can't book; once someone joins -> booked with them
  const P = await passenger({ travelDate: date, destination: 'Bandra West', expectedArrivalTime: '12:00' });
  const Q = await passenger({ travelDate: date, destination: 'Bandra West', expectedArrivalTime: '12:05' });
  const poolId = (await choose(P, { mode: 'shared', vehicleType: 'sedan' })).data.trip.poolId;
  assert.equal((await book(P)).error.code, 'POOL_NO_TRAVELLERS');
  await choose(Q, { mode: 'shared', vehicleType: 'sedan', poolId });
  const shared = await book(P, { mode: 'shared', vehicleType: 'sedan', poolId });
  assert.equal(shared.status, 201);
  assert.equal(shared.data.booking.poolId, poolId);
  assert.equal(shared.data.booking.travellers.length, 1);
  assert.equal(shared.data.booking.travellers[0].area, 'Bandra West');
  assert.equal(shared.data.booking.fare.people, 2);
  assert.equal((await Pool.findById(poolId)).status, 'open'); // others can still join or leave

  // Cancelling the trip cancels its booking (and leaves the shared ride)
  const cancelled = await P.api('PATCH', `/trips/${P.id}`, { status: 'cancelled' });
  assert.equal(cancelled.data.trip.booking.status, 'cancelled');
  assert.equal((await Pool.findById(poolId)).members.length, 1);
  assert.equal((await book(P)).error.code, 'TRIP_CANCELLED');
});

// ---- 12c. notifications ---------------------------------------------------------------
test('notifications: real events reach only the users concerned; read, read all; push only to their phones', async () => {
  const date = '2026-12-29';
  const pushed = [];
  setPushTransport(async (messages) => {
    pushed.push(...messages);
    // Expo says one of the phones no longer has the app
    return messages.map((m) => (m.to === 'ExponentPushToken[gone-phone-token]' ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }));
  });
  try {
    const list = async (p) => (await p.api('GET', '/notifications')).data;
    const types = async (p) => (await list(p)).notifications.map((n) => n.type);

    const A = await passenger({ travelDate: date, destination: 'Powai', expectedArrivalTime: '13:00' });
    // A's phone, and B's two phones (one of them later reported gone)
    assert.equal((await A.api('POST', '/notifications/device-token', { token: 'ExponentPushToken[aaaa-phone-1]', platform: 'android' })).status, 200);
    const outsider = await passenger({ travelDate: '2026-12-30', destination: 'Powai', expectedArrivalTime: '13:00' });
    assert.deepEqual(await types(outsider), ['system']); // only the welcome

    // B verifies a compatible trip -> A hears about it, B and the outsider don't
    const B = await newUser();
    await B.api('POST', '/notifications/device-token', { token: 'ExponentPushToken[bbbb-phone-1]', platform: 'ios' });
    await B.api('POST', '/notifications/device-token', { token: 'ExponentPushToken[gone-phone-token]', platform: 'ios' });
    const b = await passenger({ user: B, travelDate: date, destination: 'Hiranandani Gardens, Powai', expectedArrivalTime: '13:10' });
    const aFirst = await list(A);
    assert.equal(aFirst.notifications[0].type, 'compatible_traveller');
    assert.equal(aFirst.notifications[0].tripId, A.id); // opens A's own trip
    assert.match(aFirst.notifications[0].message, /heading to Powai/);
    assert.doesNotMatch(aFirst.notifications[0].message, /Test User|@test/); // no names or emails
    assert.deepEqual(await types(b), ['system']);
    assert.deepEqual(await types(outsider), ['system']);

    // A starts a shared ride, B joins -> A is told; B books -> only B is told
    const poolId = (await choose(A, { mode: 'shared', vehicleType: 'sedan' })).data.trip.poolId;
    await choose(b, { mode: 'shared', vehicleType: 'sedan', poolId });
    assert.equal((await list(A)).notifications[0].type, 'pool_joined');
    assert.equal((await list(A)).notifications[0].poolId, poolId);
    const booked = (await b.api('POST', `/trips/${b.id}/booking`, {})).data.booking;
    const bList = await list(b);
    assert.equal(bList.notifications[0].type, 'booking_confirmed');
    assert.equal(bList.notifications[0].bookingReference, booked.reference);
    assert.ok(!(await types(A)).includes('booking_confirmed'));

    // A leaves the shared ride -> B (still in it) is told
    await choose(A, { mode: 'solo', vehicleType: 'sedan' });
    assert.equal((await list(b)).notifications[0].type, 'pool_left');
    // The same event never notifies twice
    assert.equal((await Notification.countDocuments({ userId: B.userId, type: 'booking_confirmed' })), 1);

    // Newest first, unread counted; read one, then all
    const before = await list(b);
    const times = before.notifications.map((n) => Date.parse(n.createdAt));
    assert.deepEqual(times, [...times].sort((x, y) => y - x));
    assert.equal(before.unreadCount, before.notifications.length);
    const first = before.notifications[0];
    const read = await b.api('PATCH', `/notifications/${first.id}/read`);
    assert.equal(read.data.notification.read, true);
    assert.equal((await list(b)).unreadCount, before.unreadCount - 1);
    // Someone else's notification, or a made-up id: not found
    assert.equal((await A.api('PATCH', `/notifications/${first.id}/read`)).error.code, 'NOTIFICATION_NOT_FOUND');
    assert.equal((await A.api('PATCH', '/notifications/not-an-id/read')).error.code, 'NOTIFICATION_NOT_FOUND');
    assert.equal((await b.api('PATCH', '/notifications/read-all')).data.updated, before.unreadCount - 1);
    assert.equal((await list(b)).unreadCount, 0);
    assert.equal((await client('10.99.0.1')('GET', '/notifications')).status, 401);

    // Push: each notification only to its own user's phones; the dead token is removed
    const tokensOf = (who) => new Set(pushed.filter((m) => m.title && who.includes(m.to)).map((m) => m.to));
    const aTokens = ['ExponentPushToken[aaaa-phone-1]'];
    const bTokens = ['ExponentPushToken[bbbb-phone-1]', 'ExponentPushToken[gone-phone-token]'];
    for (const m of pushed) {
      const forA = m.title === 'New compatible traveller' || m.title === 'A traveller joined your shared ride';
      const forB = m.title === 'Booking confirmed' || m.title === 'A traveller left your shared ride';
      if (forA) assert.ok(aTokens.includes(m.to), 'A’s notification went to someone else');
      if (forB) assert.ok(bTokens.includes(m.to), 'B’s notification went to someone else');
      assert.equal(JSON.stringify(m).includes('eyJ'), false); // no login token in a push
    }
    assert.ok(tokensOf(aTokens).size === 1 && tokensOf(bTokens).size >= 1);
    assert.equal(await DeviceToken.countDocuments({ token: 'ExponentPushToken[gone-phone-token]' }), 0);

    // Device tokens: no duplicates; a phone that changes hands moves to the new user; logout removes it
    await A.api('POST', '/notifications/device-token', { token: 'ExponentPushToken[aaaa-phone-1]', platform: 'android' });
    assert.equal(await DeviceToken.countDocuments({ token: 'ExponentPushToken[aaaa-phone-1]' }), 1);
    await B.api('POST', '/notifications/device-token', { token: 'ExponentPushToken[aaaa-phone-1]', platform: 'android' });
    assert.equal(String((await DeviceToken.findOne({ token: 'ExponentPushToken[aaaa-phone-1]' })).userId), B.userId);
    assert.equal((await A.api('DELETE', '/notifications/device-token', { token: 'ExponentPushToken[aaaa-phone-1]' })).data.removed, 0); // not A's any more
    assert.equal((await B.api('DELETE', '/notifications/device-token', { token: 'ExponentPushToken[aaaa-phone-1]' })).data.removed, 1);
    assert.equal((await B.api('POST', '/notifications/device-token', { token: 'my-jwt', platform: 'ios' })).error.code, 'VALIDATION_ERROR');
  } finally {
    setPushTransport(null);
  }
});

// ---- 12d. group chat -------------------------------------------------------------------
test('group chat: only passengers with a confirmed booking in that shared ride; no duplicates; polling', async () => {
  const date = '2026-12-31';
  const P = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '14:00' });
  const Q = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '14:05' });
  const outsider = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '14:10' });
  const poolId = (await choose(P, { mode: 'shared', vehicleType: 'suv' })).data.trip.poolId;
  await choose(Q, { mode: 'shared', vehicleType: 'suv', poolId });
  const messages = (p, query = '') => p.api('GET', `/pools/${poolId}/messages${query}`);
  const send = (p, text, clientMessageId = crypto.randomUUID()) => p.api('POST', `/pools/${poolId}/messages`, { text, clientMessageId });

  // In the shared ride but not booked yet: no chat
  assert.equal((await messages(P)).error.code, 'CHAT_NOT_FOUND');
  await P.api('POST', `/trips/${P.id}/booking`, {});
  await Q.api('POST', `/trips/${Q.id}/booking`, {});

  // Members: first name + initial only
  const opened = (await messages(P)).data;
  assert.equal(opened.messages.length, 0);
  assert.equal(opened.conversation.members.length, 2);
  for (const m of opened.conversation.members) {
    assert.match(m.name, /^Test \d+\.$|^Test [A-Z]\.$/);
    assert.equal(JSON.stringify(m).includes('@'), false);
  }
  assert.equal(opened.conversation.members.filter((m) => m.isYou).length, 1);

  // P sends; sending the same message again doesn't duplicate it
  const id = crypto.randomUUID();
  const first = await send(P, '  Landing at 2 - <b>meet at exit 3?</b>  ', id);
  assert.equal(first.status, 201);
  assert.equal(first.data.message.text, 'Landing at 2 - <b>meet at exit 3?</b>'); // trimmed, kept as plain text
  const again = await send(P, 'Landing at 2 - <b>meet at exit 3?</b>', id);
  assert.equal(again.status, 200);
  assert.equal(again.data.message.id, first.data.message.id);
  assert.equal(await ChatMessage.countDocuments({ poolId }), 1);

  // Q sees it - from P, not "you"
  const qView = (await messages(Q)).data.messages;
  assert.equal(qView.length, 1);
  assert.equal(qView[0].sender.isYou, false);
  assert.equal(qView[0].clientMessageId, undefined); // only the sender gets their own id back
  assert.equal((await messages(P)).data.messages[0].sender.isYou, true);

  // Polling: messages since a moment (with a small overlap the app de-duplicates)
  const since = (await messages(Q)).data.serverTime;
  await send(Q, 'See you there');
  const polled = (await messages(P, `?since=${encodeURIComponent(since)}`)).data.messages;
  assert.ok(polled.some((m) => m.text === 'See you there'));
  assert.ok(polled.every((m, i, all) => i === 0 || Date.parse(all[i - 1].createdAt) <= Date.parse(m.createdAt)));

  // Validation
  assert.equal((await send(P, '   ')).error.code, 'VALIDATION_ERROR');
  assert.equal((await send(P, 'x'.repeat(1001))).error.code, 'VALIDATION_ERROR');
  assert.equal((await P.api('POST', `/pools/${poolId}/messages`, { text: 'hi' })).error.code, 'VALIDATION_ERROR');

  // Outsiders: someone not in the ride, a solo booking, a made-up id - all "not found"
  assert.equal((await messages(outsider)).error.code, 'CHAT_NOT_FOUND');
  assert.equal((await send(outsider, 'let me in')).error.code, 'CHAT_NOT_FOUND');
  await choose(outsider, { mode: 'solo', vehicleType: 'sedan' });
  await outsider.api('POST', `/trips/${outsider.id}/booking`, {});
  assert.equal((await messages(outsider)).error.code, 'CHAT_NOT_FOUND');
  assert.equal((await P.api('GET', '/pools/000000000000000000000000/messages')).error.code, 'CHAT_NOT_FOUND');
  assert.equal((await P.api('GET', '/pools/not-an-id/messages')).error.code, 'CHAT_NOT_FOUND');
  assert.equal((await client('10.99.0.2')('GET', `/pools/${poolId}/messages`)).status, 401);

  // Cancelling the trip ends access; the other member keeps the conversation
  await Q.api('PATCH', `/trips/${Q.id}`, { status: 'cancelled' });
  assert.equal((await messages(Q)).error.code, 'CHAT_NOT_FOUND');
  assert.equal((await messages(P)).data.messages.length, 2);
});

// ---- 12e. ride management: cancel booking, leave a shared ride -------------------------
test('ride management: cancel (once, with reason, kept), refused when landed/completed/not theirs', async () => {
  const date = '2027-01-02';
  const manage = (p) => p.api('GET', `/trips/${p.id}/booking`);
  const cancel = (p, body = {}) => p.api('POST', `/trips/${p.id}/booking/cancel`, body);

  // A confirmed solo booking: what Ride Management sees
  const S = await passenger({ travelDate: date, destination: 'Powai', expectedArrivalTime: '15:00' });
  await choose(S, { mode: 'solo', vehicleType: 'sedan' });
  assert.equal((await cancel(S)).error.code, 'NO_ACTIVE_BOOKING'); // nothing booked yet
  const reference = (await S.api('POST', `/trips/${S.id}/booking`, {})).data.booking.reference;
  const view = (await manage(S)).data;
  assert.deepEqual(view.status, { code: 'confirmed', label: 'Booking confirmed' });
  assert.deepEqual(view.timeline.map((e) => e.key), ['planned', 'verified', 'ride', 'booked']);
  assert.equal(view.actions.cancel.allowed, true);
  assert.deepEqual(view.actions.leavePool, { allowed: false, reason: 'Solo rides have no shared ride to leave.' });
  assert.equal((await S.api('POST', `/trips/${S.id}/booking/leave-pool`, {})).error.code, 'NOT_IN_POOL');

  // Someone else can't cancel it (or see it)
  const stranger = await newUser();
  assert.equal((await stranger.api('POST', `/trips/${S.id}/booking/cancel`, {})).error.code, 'TRIP_NOT_FOUND');
  assert.equal((await stranger.api('GET', `/trips/${S.id}/booking`)).error.code, 'TRIP_NOT_FOUND');

  // Two cancellations at the same moment: one succeeds, the other is told it's already cancelled
  const [a, b] = await Promise.all([cancel(S, { reason: 'Plans changed' }), cancel(S, { reason: 'Plans changed' })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal((a.status === 409 ? a : b).error.code, 'BOOKING_ALREADY_CANCELLED');
  // Kept, not deleted - with its reason and history
  const saved = await Trip.findById(S.id);
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.booking.status, 'cancelled');
  assert.equal(saved.booking.reference, reference);
  assert.equal(saved.booking.cancelReason, 'Plans changed');
  const after = (await manage(S)).data;
  assert.equal(after.status.code, 'cancelled');
  assert.equal(after.timeline.at(-1).key, 'cancelled');
  assert.equal(after.actions.cancel.allowed, false);
  assert.equal((await cancel(S)).error.code, 'BOOKING_ALREADY_CANCELLED');
  assert.ok((await S.api('GET', '/trips')).data.trips.some((t) => t.id === S.id && t.status === 'cancelled'));
  assert.equal((await Notification.countDocuments({ userId: S.userId, type: 'booking_cancelled' })), 1);

  // Landed: can't be cancelled any more
  const L = await passenger({ travelDate: date, destination: 'Powai', expectedArrivalTime: '15:20' });
  await choose(L, { mode: 'solo', vehicleType: 'sedan' });
  await L.api('POST', `/trips/${L.id}/booking`, {});
  await Trip.updateOne({ _id: L.id }, { $set: { arrivalAt: new Date(Date.now() - 30 * 60 * 1000) } });
  assert.equal((await manage(L)).data.status.code, 'arrived');
  assert.equal((await manage(L)).data.actions.cancel.allowed, false);
  assert.equal((await cancel(L)).error.code, 'TRIP_IN_PAST');

  // A completed ride (status reserved for a future dispatch feature) can't be cancelled or left
  const P = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '16:00' });
  const Q = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '16:05' });
  const poolId = (await choose(P, { mode: 'shared', vehicleType: 'sedan' })).data.trip.poolId;
  await choose(Q, { mode: 'shared', vehicleType: 'sedan', poolId });
  await P.api('POST', `/trips/${P.id}/booking`, {});
  await Pool.updateOne({ _id: poolId }, { $set: { status: 'completed' } });
  assert.equal((await manage(P)).data.actions.cancel.reason, 'This ride has already been completed.');
  assert.equal((await cancel(P)).error.code, 'RIDE_COMPLETED');
  assert.equal((await P.api('POST', `/trips/${P.id}/booking/leave-pool`, {})).error.code, 'RIDE_COMPLETED');
  assert.equal((await Trip.findById(P.id)).booking.status, 'confirmed'); // untouched
  await Pool.updateOne({ _id: poolId }, { $set: { status: 'open' } }); // tidy up for later checks
});

test('leave pool: the trip goes on, the shared ride and its chat update, history is kept, others are told', async () => {
  const date = '2027-01-03';
  const P = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '09:00' });
  const Q = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '09:05' });
  const R = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '09:10' });
  const poolId = (await choose(P, { mode: 'shared', vehicleType: 'suv' })).data.trip.poolId;
  await choose(Q, { mode: 'shared', vehicleType: 'suv', poolId });
  await choose(R, { mode: 'shared', vehicleType: 'suv', poolId });
  const reference = (await P.api('POST', `/trips/${P.id}/booking`, {})).data.booking.reference;
  await Q.api('POST', `/trips/${Q.id}/booking`, {});
  await P.api('POST', `/pools/${poolId}/messages`, { text: 'Hi both', clientMessageId: crypto.randomUUID() });
  const fareBefore = (await Q.api('GET', `/trips/${Q.id}/booking`)).data.ride.pool.fare.total;
  assert.equal((await Q.api('GET', `/trips/${Q.id}/booking`)).data.ride.pool.others.length, 2);

  // Someone outside can't make P leave
  const stranger = await newUser();
  assert.equal((await stranger.api('POST', `/trips/${P.id}/booking/leave-pool`, {})).error.code, 'TRIP_NOT_FOUND');

  const left = await P.api('POST', `/trips/${P.id}/booking/leave-pool`, {});
  assert.equal(left.status, 200);
  // P's trip continues: back to choosing a ride; the ended booking is kept
  assert.equal(left.data.trip.status, 'flight_verified');
  assert.equal(left.data.booking, null);
  assert.equal(left.data.pastBookings.length, 1);
  assert.equal(left.data.pastBookings[0].reference, reference);
  assert.equal(left.data.pastBookings[0].status, 'left_pool');
  assert.ok(left.data.timeline.some((e) => e.key === 'left_pool'));
  assert.equal(left.data.status.code, 'not_booked');
  // The shared ride: P removed, seats and fare estimate updated for those left
  const pool = await Pool.findById(poolId);
  assert.deepEqual(pool.members.map((m) => String(m.tripId)).sort(), [Q.id, R.id].sort());
  const qView = (await Q.api('GET', `/trips/${Q.id}/booking`)).data;
  assert.equal(qView.ride.pool.others.length, 1);
  assert.equal(qView.ride.pool.fare.people, 2); // re-estimated for Q and R only (was 3)
  assert.ok(Number.isFinite(fareBefore));
  // Q and R are told; P gets their own update; nobody else
  for (const other of [Q, R]) {
    const latest = (await other.api('GET', '/notifications')).data.notifications[0];
    assert.equal(latest.type, 'pool_left');
  }
  assert.equal((await P.api('GET', '/notifications')).data.notifications[0].type, 'booking_updated');
  assert.equal(await Notification.countDocuments({ userId: stranger.userId, type: { $ne: 'system' } }), 0);
  // Chat: P can no longer read or write; Q keeps the history, including P's message
  assert.equal((await P.api('GET', `/pools/${poolId}/messages`)).error.code, 'CHAT_NOT_FOUND');
  assert.equal((await P.api('POST', `/pools/${poolId}/messages`, { text: 'still here?', clientMessageId: crypto.randomUUID() })).error.code, 'CHAT_NOT_FOUND');
  assert.deepEqual((await Q.api('GET', `/pools/${poolId}/messages`)).data.messages.map((m) => m.text), ['Hi both']);
  // Leaving again: nothing to leave
  assert.equal((await P.api('POST', `/trips/${P.id}/booking/leave-pool`, {})).error.code, 'NO_ACTIVE_BOOKING');

  // P can book again for the same trip - a new reference, the old one kept
  await choose(P, { mode: 'solo', vehicleType: 'sedan' });
  const rebooked = (await P.api('POST', `/trips/${P.id}/booking`, {})).data.booking;
  assert.notEqual(rebooked.reference, reference);
  const pTrip = await Trip.findById(P.id);
  assert.equal(pTrip.pastBookings[0].reference, reference);
  assert.equal(pTrip.booking.reference, rebooked.reference);
});

// ---- 12f. payments (demo mode) --------------------------------------------------------
const payView = (p) => p.api('GET', `/trips/${p.id}/payment`);
const startPay = (p, body = {}) => p.api('POST', `/trips/${p.id}/payment`, body);
const demoResult = (p, paymentId, outcome) => p.api('POST', `/payments/${paymentId}/demo-result`, { outcome });
async function bookedSolo(date, time, destination = 'Powai') {
  const p = await passenger({ travelDate: date, destination, expectedArrivalTime: time });
  await choose(p, { mode: 'solo', vehicleType: 'sedan' });
  await p.api('POST', `/trips/${p.id}/booking`, {});
  return p;
}
// A signed provider webhook (Razorpay format), as the provider would send it
async function webhook(body, { eventId = crypto.randomUUID(), secret = 'integration-webhook-secret', signature } = {}) {
  const raw = JSON.stringify(body);
  const sig = signature ?? crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const res = await fetch(`${base}/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': sig, 'X-Razorpay-Event-Id': eventId },
    body: raw,
  });
  return { status: res.status, ...(await res.json()) };
}
const paymentEvent = (event, orderId, amountPaise, extra = {}) => ({
  entity: 'event',
  event,
  payload: { payment: { entity: { id: `pay_${crypto.randomBytes(6).toString('hex')}`, order_id: orderId, amount: amountPaise, currency: 'INR', ...extra } } },
});

test('payments: solo amount from the server, idempotent start, demo success/failure/cancel, no double payment, owner only', async () => {
  const date = '2027-01-04';
  const S = await bookedSolo(date, '10:00');
  const view = (await payView(S)).data;
  const ride = (await S.api('GET', `/trips/${S.id}/ride`)).data.ride;
  assert.equal(view.demo, true);
  assert.equal(view.amount, ride.soloFare.total); // the whole cab for a solo ride
  assert.equal(view.fare.share, view.fare.total);
  assert.equal(view.canPay, true);
  assert.equal(view.payment, null);
  // The app can't send an amount
  assert.equal((await startPay(S, { amount: 1 })).error.code, 'VALIDATION_ERROR');

  const first = await startPay(S);
  assert.equal(first.status, 201);
  assert.equal(first.data.payment.status, 'pending');
  assert.equal(first.data.payment.amount, view.amount);
  assert.equal(first.data.payment.mode, 'demo');
  const again = await startPay(S);
  assert.equal(again.status, 200);
  assert.equal(again.data.payment.id, first.data.payment.id); // the same open payment

  // Someone else: can't see, can't complete
  const stranger = await newUser();
  assert.equal((await stranger.api('GET', `/trips/${S.id}/payment`)).error.code, 'TRIP_NOT_FOUND');
  assert.equal((await demoResult(stranger, first.data.payment.id, 'success')).error.code, 'PAYMENT_NOT_FOUND');
  assert.deepEqual((await stranger.api('GET', '/payments')).data.payments, []);

  const paid = await demoResult(S, first.data.payment.id, 'success');
  assert.equal(paid.data.payment.status, 'paid');
  assert.ok(paid.data.payment.providerPaymentId.startsWith('demo_pay_'));
  // A late "failure" for the same payment changes nothing; it can't be paid twice
  const late = await demoResult(S, first.data.payment.id, 'failure');
  assert.equal(late.data.changed, false);
  assert.equal(late.data.payment.status, 'paid');
  assert.equal((await startPay(S)).error.code, 'ALREADY_PAID');
  assert.equal(await Payment.countDocuments({ tripId: S.id, status: 'paid' }), 1);
  const after = (await payView(S)).data;
  assert.equal(after.canPay, false);
  assert.equal(after.payment.status, 'paid');
  const history = (await S.api('GET', '/payments')).data.payments;
  assert.equal(history.length, 1);
  assert.equal(history[0].trip.destination, 'Powai');

  // Two "start" requests at the same moment -> one payment
  const T = await bookedSolo(date, '10:05');
  const [x, y] = await Promise.all([startPay(T), startPay(T)]);
  assert.equal(x.data.payment.id, y.data.payment.id);
  assert.equal(await Payment.countDocuments({ tripId: T.id }), 1);

  // Failure, then a new attempt; cancelling an attempt; then success
  const failed = await demoResult(T, x.data.payment.id, 'failure');
  assert.equal(failed.data.payment.status, 'failed');
  const second = await startPay(T);
  assert.equal(second.status, 201);
  assert.notEqual(second.data.payment.id, x.data.payment.id);
  assert.equal((await demoResult(T, second.data.payment.id, 'cancelled')).data.payment.status, 'cancelled');
  const third = (await startPay(T)).data.payment;
  assert.equal((await demoResult(T, third.id, 'success')).data.payment.status, 'paid');
  assert.deepEqual(
    (await Payment.find({ tripId: T.id }).sort({ createdAt: 1 })).map((p) => p.status),
    ['failed', 'cancelled', 'paid'],
  );

  // Cancel the booking after starting a payment: the payment is cancelled, can't be completed
  const C = await bookedSolo(date, '10:10');
  const open = (await startPay(C)).data.payment;
  await C.api('POST', `/trips/${C.id}/booking/cancel`, {});
  const closed = await Payment.findById(open.id);
  assert.equal(closed.status, 'cancelled');
  assert.equal(closed.failureReason, 'booking_cancelled');
  const tooLate = await demoResult(C, open.id, 'success');
  assert.equal(tooLate.data.payment.status, 'cancelled');
  assert.equal(tooLate.data.changed, false);
  assert.equal((await startPay(C)).error.code, 'NO_ACTIVE_BOOKING');
  // A paid booking that is then cancelled keeps its payment (no refund is processed)
  await S.api('POST', `/trips/${S.id}/booking/cancel`, {});
  const kept = await Payment.findById(first.data.payment.id);
  assert.equal(kept.status, 'paid');
  assert.equal(kept.needsRefund, false);
  assert.equal((await S.api('GET', '/payments')).data.payments[0].status, 'paid');
});

test('payment webhooks: signature checked, each event applied once, amount must match, never backwards', async () => {
  const W = await bookedSolo('2027-01-05', '11:00');
  const payment = (await startPay(W)).data.payment;
  const order = payment.providerOrderId;
  const paise = payment.amount * 100;
  const status = async () => (await Payment.findById(payment.id)).status;

  // Bad or missing signatures are refused; nothing changes
  const forged = await webhook(paymentEvent('payment.captured', order, paise), { secret: 'not-the-secret' });
  assert.deepEqual([forged.status, forged.error.code], [400, 'INVALID_SIGNATURE']);
  assert.equal((await webhook(paymentEvent('payment.captured', order, paise), { signature: 'abc' })).error.code, 'INVALID_SIGNATURE');
  assert.equal(await status(), 'pending');

  // Authorised -> processing; a capture for the wrong amount is ignored
  assert.equal((await webhook(paymentEvent('payment.authorized', order, paise))).data.result, 'applied');
  assert.equal(await status(), 'processing');
  assert.equal((await webhook(paymentEvent('payment.captured', order, paise - 100))).data.result, 'ignored:amount_mismatch');
  assert.equal(await status(), 'processing');

  // Captured -> paid; the same event again is a duplicate; a later failure can't undo it
  const eventId = crypto.randomUUID();
  assert.equal((await webhook(paymentEvent('payment.captured', order, paise), { eventId })).data.result, 'applied');
  assert.equal(await status(), 'paid');
  assert.equal((await webhook(paymentEvent('payment.captured', order, paise), { eventId })).data.result, 'duplicate');
  assert.equal((await webhook(paymentEvent('payment.failed', order, paise))).data.result, 'ignored:already_final');
  assert.equal(await status(), 'paid');
  assert.equal(await PaymentEvent.countDocuments({ eventId }), 1);

  // Money captured for a booking that was cancelled meanwhile: recorded, flagged for a refund
  const X = await bookedSolo('2027-01-05', '11:05');
  const xPay = (await startPay(X)).data.payment;
  await X.api('POST', `/trips/${X.id}/booking/cancel`, {});
  assert.equal((await webhook(paymentEvent('payment.captured', xPay.providerOrderId, xPay.amount * 100))).data.result, 'applied');
  const captured = await Payment.findById(xPay.id);
  assert.equal(captured.status, 'paid');
  assert.equal(captured.needsRefund, true);
  // Unknown orders are ignored
  assert.equal((await webhook(paymentEvent('payment.captured', 'order_unknown', 100))).data.result, 'ignored:unknown_order');
});

test('fare splitting: opens when everyone has booked, each pays their own share, collected/outstanding reconcile', async () => {
  const date = '2027-01-06';
  const P = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '12:00', passengerCount: 2 });
  const Q = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '12:05' });
  const R = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '12:10' });
  const poolId = (await choose(P, { mode: 'shared', vehicleType: 'suv' })).data.trip.poolId;
  await choose(Q, { mode: 'shared', vehicleType: 'suv', poolId });
  await choose(R, { mode: 'shared', vehicleType: 'suv', poolId });
  await P.api('POST', `/trips/${P.id}/booking`, {});
  await Q.api('POST', `/trips/${Q.id}/booking`, {});

  // R hasn't booked yet: payment isn't open
  const waiting = (await payView(P)).data;
  assert.equal(waiting.blocker.code, 'WAITING_FOR_BOOKINGS');
  assert.equal(waiting.canPay, false);
  assert.equal((await startPay(P)).error.code, 'WAITING_FOR_BOOKINGS');
  await R.api('POST', `/trips/${R.id}/booking`, {});

  const pv = (await payView(P)).data;
  const total = pv.pool.total;
  assert.equal(pv.fare.total, total);
  assert.equal(pv.fare.people, 4); // P's group of 2 + Q + R
  assert.equal(pv.pool.members.reduce((sum, m) => sum + m.share, 0), total); // shares add up to the fare
  assert.equal(pv.amount, pv.pool.members.find((m) => m.isYou).share);
  assert.deepEqual(pv.pool.members.map((m) => m.label), ['You', 'Traveller 1', 'Traveller 2']);
  assert.equal(JSON.stringify(pv.pool).includes('Test User'), false); // no names

  // P pays; Q and R see P as paid (only paid / not paid - no payment details)
  const pPay = (await startPay(P)).data.payment;
  assert.equal((await demoResult(Q, pPay.id, 'success')).error.code, 'PAYMENT_NOT_FOUND'); // not Q's to complete
  await demoResult(P, pPay.id, 'success');
  const qv = (await payView(Q)).data;
  assert.equal(qv.pool.collected, pv.amount);
  assert.equal(qv.pool.outstanding, total - pv.amount);
  assert.equal(qv.pool.members.filter((m) => m.paid).length, 1);
  assert.equal(qv.pool.allPaid, false);
  assert.equal(JSON.stringify(qv.pool).includes(pPay.id), false);
  assert.equal(qv.payment, null); // Q's own payment: none yet

  // Everyone pays -> collected equals the fare
  await demoResult(Q, (await startPay(Q)).data.payment.id, 'success');
  await demoResult(R, (await startPay(R)).data.payment.id, 'success');
  const done = (await payView(R)).data.pool;
  assert.equal(done.allPaid, true);
  assert.equal(done.collected, total);
  assert.equal(done.outstanding, 0);
  // Each payment belongs to its own passenger and trip
  for (const p of [P, Q, R]) {
    const mine = await Payment.find({ tripId: p.id });
    assert.equal(mine.length, 1);
    assert.equal(String(mine[0].userId), p.userId);
  }

  // R leaves afterwards: the fare is re-estimated for P and Q; R's payment is kept (no refund processed)
  await R.api('POST', `/trips/${R.id}/booking/leave-pool`, {});
  const later = (await payView(P)).data.pool;
  assert.equal(later.members.length, 2);
  assert.equal(later.collected, pv.amount + qv.pool.members.find((m) => m.isYou).share);
  assert.equal((await R.api('GET', '/payments')).data.payments[0].status, 'paid');
});

// ---- 13. privacy / access control -------------------------------------------------
test("users can't read or change another user's trips, rides or pools", async () => {
  const owner = await passenger({ travelDate: '2026-12-27' });
  const other = await newUser();
  const tries = [
    ['GET', `/trips/${owner.id}`],
    ['PATCH', `/trips/${owner.id}`, { destination: 'Juhu' }],
    ['PATCH', `/trips/${owner.id}`, { status: 'cancelled' }],
    ['GET', `/trips/${owner.id}/matches`],
    ['GET', `/trips/${owner.id}/ride`],
    ['PUT', `/trips/${owner.id}/ride`, { mode: 'solo', vehicleType: 'sedan' }],
  ];
  for (const [method, path, body] of tries) {
    assert.equal((await other.api(method, path, body)).status, 404, `${method} ${path}`);
  }
  assert.equal((await other.api('GET', '/trips')).data.trips.length, 0);
  assert.equal((await other.api('GET', '/trips/not-an-id')).status, 404);
  assert.equal((await other.api('GET', '/trips?when=bogus')).status, 400);
  // NoSQL-injection style bodies are rejected by validation
  assert.equal((await other.api('POST', '/auth/login', { email: { $gt: '' }, password: { $gt: '' } })).status, 400);
  assert.equal((await owner.api('PUT', `/trips/${owner.id}/ride`, { mode: 'shared', vehicleType: 'sedan', poolId: { $ne: null } })).status, 400);
});

// ---- 6b. Phase 13 security audit: the gaps not covered above -------------------------
test('security: bookings, payments, notifications and chat of other users stay private; no secrets in responses', async () => {
  const date = '2027-01-09';
  const owner = await bookedSolo(date, '09:00');
  const stranger = await newUser();

  // Another user's booking: can't read, cancel, leave or pay for it
  for (const [method, path, body] of [
    ['GET', `/trips/${owner.id}/booking`],
    ['POST', `/trips/${owner.id}/booking`, {}],
    ['POST', `/trips/${owner.id}/booking/cancel`, {}],
    ['POST', `/trips/${owner.id}/booking/leave-pool`, {}],
    ['GET', `/trips/${owner.id}/payment`],
    ['POST', `/trips/${owner.id}/payment`, {}],
  ]) {
    assert.equal((await stranger.api(method, path, body)).status, 404, `${method} ${path}`);
  }
  assert.equal((await Trip.findById(owner.id)).booking.status, 'confirmed'); // untouched

  // Another user's notification can't be marked read
  const note = await Notification.findOne({ userId: owner.userId });
  assert.ok(note, 'the owner has a booking notification');
  assert.equal((await stranger.api('PATCH', `/notifications/${note._id}/read`)).status, 404);
  assert.equal((await Notification.findById(note._id)).readAt, null);
  assert.equal((await stranger.api('GET', '/notifications')).data.notifications.some((n) => String(n.id) === String(note._id)), false);

  // Chat of a pool they are not in; query-operator tricks are ignored or refused
  const sharer = await passenger({ travelDate: date, expectedArrivalTime: '09:30' });
  const poolId = String((await choose(sharer, { mode: 'shared', vehicleType: 'sedan' })).data.trip.poolId);
  assert.equal((await stranger.api('GET', `/pools/${poolId}/messages`)).status, 404);
  assert.equal((await stranger.api('GET', `/pools/${poolId}/messages?since[$gt]=`)).status, 404);
  assert.equal((await stranger.api('POST', `/pools/${poolId}/messages`, { text: 'hi', clientMessageId: crypto.randomUUID() })).status, 404);

  // Mass assignment: server-owned fields sent when creating a trip are ignored
  const forged = await stranger.api(
    'POST',
    '/trips',
    tripBody({ travelDate: date, status: 'ride_selected', userId: owner.userId, isDemo: true, booking: { status: 'confirmed' }, poolId })
  );
  assert.equal(forged.status, 201);
  const saved = await Trip.findById(forged.data.trip.id);
  assert.equal(saved.status, 'awaiting_verification');
  assert.equal(String(saved.userId), stranger.userId);
  assert.equal(saved.isDemo, false);
  assert.equal(saved.booking, null);
  assert.equal(saved.poolId ?? null, null);

  // Passwords, hashes and the JWT secret never appear in a response
  const me = await owner.api('GET', '/auth/me');
  const text = JSON.stringify([me, forged, await owner.api('GET', `/trips/${owner.id}/booking`), await owner.api('GET', '/payments')]);
  for (const secret of ['secret123', '$2a$', '$2b$', env.jwtSecret, 'password', 'integration-webhook-secret']) {
    assert.equal(text.includes(secret), false, `response leaks ${secret}`);
  }
  assert.equal((await User.findById(owner.userId).select('+password')).password.startsWith('$2'), true); // bcrypt hash at rest
});

test('security: webhook needs a valid signature; bad bodies, other origins and headers handled safely', async () => {
  // Webhook without / with a wrong signature changes nothing
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: 'x', amount: 1 } } } });
  for (const headers of [{}, { 'X-Razorpay-Signature': 'deadbeef', 'X-Razorpay-Event-Id': 'evt_bad' }]) {
    const res = await fetch(`${base}/payments/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
    assert.ok([400, 401].includes(res.status), `unsigned webhook got ${res.status}`);
  }
  assert.equal(await PaymentEvent.countDocuments({ eventId: 'evt_bad' }), 0);

  const raw = (init) => fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.9.9.9' }, ...init });
  // Malformed JSON -> 400, not a crash or a stack trace
  const bad = await raw({ body: '{"email":' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'INVALID_JSON');
  // Oversized body -> 413 before any work is done
  const big = await raw({ body: JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(20000) }) });
  assert.equal(big.status, 413);

  // CORS: only the configured web app origin is allowed
  const evil = await fetch(`${base}/health`, { headers: { Origin: 'https://evil.example' } });
  assert.notEqual(evil.headers.get('access-control-allow-origin'), 'https://evil.example'); // browser blocks the mismatch
  const ours = await fetch(`${base}/health`, { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(ours.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  // Security headers from helmet; no framework fingerprint
  assert.equal(ours.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(ours.headers.get('x-powered-by'), null);

  // Unknown routes and missing auth answer in the standard JSON shape
  const unknown = await fetch(`${base}/nope`);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).success, false);
  for (const path of ['/trips', '/payments', '/notifications', `/pools/${'a'.repeat(24)}/messages`]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 401, path);
  }
  const garbage = await fetch(`${base}/trips`, { headers: { Authorization: 'Bearer not.a.jwt' } });
  assert.equal(garbage.status, 401);
});

// ---- 6c. Phase 13 end to end: User A + User B share a ride; User C travels alone -------
test('E2E: two users share a ride from signup to payment and cancellation; a third travels alone', async () => {
  const date = '2027-01-12';
  const types = async (u) => (await u.api('GET', '/notifications')).data.notifications.map((n) => n.type);

  // A and B: same flight, nearby destinations
  const A = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '16:00', flightNumber: 'AI555' });
  assert.ok((await types(A)).includes('system')); // welcome
  const B = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '16:10', flightNumber: 'AI555' });
  const aSees = await options(A);
  assert.equal(aSees.travellers.length, 1);
  assert.equal(aSees.travellers[0].sameFlight, true);
  assert.equal(aSees.travellers[0].isDemo, false); // a real traveller, not sample data
  assert.ok((await types(A)).includes('compatible_traveller'));

  // A starts a shared SUV, B joins it
  const poolId = (await choose(A, { mode: 'shared', vehicleType: 'suv' })).data.trip.poolId;
  assert.equal((await choose(B, { mode: 'shared', vehicleType: 'suv', poolId })).data.trip.poolId, poolId);
  assert.ok((await types(A)).includes('pool_joined'));

  // Both review and confirm (exactly what they reviewed)
  for (const u of [A, B]) {
    const ride = (await u.api('GET', `/trips/${u.id}/ride`)).data.ride;
    const booked = await u.api('POST', `/trips/${u.id}/booking`, { mode: 'shared', vehicleType: 'suv', poolId, yourShare: ride.pool.fare.yourShare });
    assert.equal(booked.status, 201, JSON.stringify(booked.error));
    assert.match(booked.data.booking.reference, /^FP-[A-Z0-9]{8}$/);
    assert.ok((await types(u)).includes('booking_confirmed'));
  }

  // Group chat between them
  const send = (u, text) => u.api('POST', `/pools/${poolId}/messages`, { text, clientMessageId: crypto.randomUUID() });
  assert.equal((await send(A, 'Meet at gate 4?')).status, 201);
  assert.equal((await send(B, 'Sure, see you there')).status, 201);
  const chat = (await B.api('GET', `/pools/${poolId}/messages`)).data;
  assert.deepEqual(chat.messages.map((m) => m.text), ['Meet at gate 4?', 'Sure, see you there']);

  // Each pays their own share (demo); the shares add up to the fare
  const aView = (await payView(A)).data;
  assert.equal(aView.canPay, true);
  for (const u of [A, B]) {
    const pay = await startPay(u);
    assert.equal((await demoResult(u, pay.data.payment.id, 'success')).data.payment.status, 'paid');
  }
  const settled = (await payView(B)).data.pool;
  assert.equal(settled.allPaid, true);
  assert.equal(settled.collected, aView.pool.total);

  // A cancels: B is told, A loses chat access, B keeps the ride
  const cancelled = await A.api('POST', `/trips/${A.id}/booking/cancel`, { reason: 'Plans changed' });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.error));
  assert.equal((await A.api('GET', `/pools/${poolId}/messages`)).status, 404);
  assert.ok((await types(B)).some((t) => t === 'pool_left' || t === 'booking_updated'));
  const bManage = (await B.api('GET', `/trips/${B.id}/booking`)).data;
  assert.equal(bManage.booking.status, 'confirmed');
  assert.equal((await A.api('GET', `/trips/${A.id}/booking`)).data.booking.status, 'cancelled');
  assert.equal((await A.api('POST', `/trips/${A.id}/booking/cancel`, {})).status, 409); // only once

  // C travels alone: solo fare, own payment, not visible to anyone as a match
  const C = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '16:05', flightNumber: 'AI555' });
  await choose(C, { mode: 'solo', vehicleType: 'sedan' });
  const cRide = (await C.api('GET', `/trips/${C.id}/ride`)).data.ride;
  assert.equal((await C.api('POST', `/trips/${C.id}/booking`, {})).status, 201);
  const cPay = await startPay(C);
  assert.equal(cPay.data.payment.amount, cRide.soloFare.total);
  await demoResult(C, cPay.data.payment.id, 'success');
  assert.equal((await C.api('GET', '/payments')).data.payments.length, 1);
  assert.equal((await options(B)).travellers.some((t) => t.ride?.mode === 'solo'), false);
  assert.equal((await C.api('GET', `/pools/${poolId}/messages`)).status, 404);

  // Everyone's trip list shows their own trips only
  for (const u of [A, B, C]) {
    const trips = (await u.api('GET', '/trips')).data.trips;
    assert.deepEqual(trips.map((t) => t.id), [u.id]);
  }
});

// ---- airports and destinations ------------------------------------------------------
const NMI_NAME = 'Navi Mumbai International Airport';

test('airports: Navi Mumbai trips store their airport, are verified against it, and only match the same airport', async () => {
  const date = '2027-01-20';
  // Created without a terminal choice: Navi Mumbai Airport has only Terminal 1
  const u = await newUser();
  const created = await u.api('POST', '/trips', tripBody({ pickupLocation: NMI_NAME, pickupTerminal: null, travelDate: date, destination: 'Kharghar' }));
  assert.equal(created.status, 201, JSON.stringify(created.error));
  assert.equal(created.data.trip.airport, 'NMI');
  assert.equal(created.data.trip.pickupTerminal, 'T1');
  assert.equal((await Trip.findById(created.data.trip.id)).airport, 'NMI'); // stored with the trip
  const t2 = await u.api('POST', '/trips', tripBody({ pickupLocation: NMI_NAME, pickupTerminal: 'T2', travelDate: date }));
  assert.equal(t2.error.details[0].message, 'Navi Mumbai Airport (NMI) has only Terminal 1.');
  // Mumbai Airport still needs its terminal, and is stored as BOM
  assert.equal((await u.api('POST', '/trips', tripBody({ pickupTerminal: null, travelDate: date }))).error.details[0].field, 'pickupTerminal');
  assert.equal((await u.api('POST', '/trips', tripBody({ travelDate: date }))).data.trip.airport, 'BOM');

  // Verification: a Mumbai Airport ticket can't verify a Navi Mumbai trip
  const verify = (document) =>
    u.api('POST', `/trips/${created.data.trip.id}/verification`, { airline: 'Air India', flightNumber: 'AI123', scheduledArrivalTime: '10:00', document });
  const wrongAirport = await verify(ticketFor(u, { date, to: 'BOM Mumbai T2' }));
  assert.equal(wrongAirport.status, 422);
  assert.match(wrongAirport.error.message, /Your ticket is for Mumbai Airport \(BOM\), but your trip is from Navi Mumbai Airport \(NMI\)/);
  const ok = await verify(ticketFor(u, { date, to: 'NMI Navi Mumbai T1' }));
  assert.equal(ok.status, 200, JSON.stringify(ok.error));
  assert.equal(ok.data.trip.flight.arrivalAirport, 'NMI');
  assert.equal(ok.data.trip.flight.arrivalTerminal, 'T1');
  const A = { ...u, id: created.data.trip.id };

  // Matching: same flight and time, but only the Navi Mumbai passenger is offered
  const nmiB = await passenger({ pickupLocation: NMI_NAME, pickupTerminal: null, travelDate: date, destination: 'CBD Belapur', expectedArrivalTime: '10:05' });
  const bomC = await passenger({ travelDate: date, destination: 'Kharghar', expectedArrivalTime: '10:00' });
  const seenByA = (await options(A)).travellers;
  assert.equal(seenByA.length, 1);
  assert.equal(seenByA[0].area, 'CBD Belapur');
  assert.equal((await options(bomC)).travellers.length, 0); // Navi Mumbai passengers are never offered at Mumbai Airport

  // A Navi Mumbai shared ride can't be joined from Mumbai Airport
  const poolId = (await choose(A, { mode: 'shared', vehicleType: 'suv' })).data.trip.poolId;
  const nmiPool = await Pool.findById(poolId);
  assert.deepEqual([nmiPool.pickupKey, nmiPool.pickupAirport], ['NMI-T1', 'NMI']);
  assert.equal(poolsFor(await options(bomC), 'suv').some((p) => p.id === poolId), false);
  assert.equal((await choose(bomC, { mode: 'shared', vehicleType: 'suv', poolId })).error.code, 'POOL_INCOMPATIBLE');
  assert.equal((await choose(nmiB, { mode: 'shared', vehicleType: 'suv', poolId })).data.trip.poolId, poolId);
  // The fare is measured from Navi Mumbai Airport (Kharghar + Belapur: a short ride)
  assert.ok((await A.api('GET', `/trips/${A.id}/ride`)).data.ride.pool.fare.roadKm < 20);
});

test('arrival airport: tickets must arrive (not leave); pickups away from the airport record the airport the ticket shows, never an assumed one', async () => {
  const date = '2027-01-22';
  const verify = (p, document) =>
    p.api('POST', `/trips/${p.id}/verification`, { airline: 'Air India', flightNumber: 'AI123', scheduledArrivalTime: '10:00', document });
  const unverified = async (trip) => {
    const u = await newUser();
    const created = await u.api('POST', '/trips', tripBody({ travelDate: date, ...trip }));
    assert.equal(created.status, 201, JSON.stringify(created.error));
    return { ...u, id: created.data.trip.id };
  };

  // Mumbai Airport trip: a PDF e-ticket for the flight LEAVING Mumbai is refused (no barcode needed)
  const A = await unverified({});
  const leaving = await verify(A, ticketFor(A, { date, from: 'BOM Mumbai T2', to: 'DEL Delhi' }));
  assert.equal(leaving.status, 422);
  assert.match(leaving.error.message, /a flight leaving Mumbai/);
  assert.equal((await Trip.findById(A.id)).status, 'awaiting_verification');
  const arriving = await verify(A, ticketFor(A, { date, from: 'DEL Delhi', to: 'BOM Mumbai T2' }));
  assert.equal(arriving.status, 200, JSON.stringify(arriving.error));
  assert.deepEqual([arriving.data.trip.flight.arrivalAirport, arriving.data.trip.flight.arrivalTerminal], ['BOM', 'T2']);

  // Pickup away from the airport: the airport the ticket shows is stored - Navi Mumbai here, not "BOM"
  const B = await unverified({ pickupLocation: 'Dadar Railway Station', pickupTerminal: null, destination: 'Colaba' });
  assert.equal((await B.api('GET', `/trips/${B.id}`)).data.trip.airport, null);
  assert.equal((await verify(B, ticketFor(B, { date, from: 'NMI Navi Mumbai', to: 'DEL Delhi' }))).status, 422); // leaving Navi Mumbai
  assert.equal((await verify(B, ticketFor(B, { date, from: 'DEL Delhi', to: 'GOI Goa' }))).status, 422); // not to Mumbai at all
  const nmi = await verify(B, ticketFor(B, { date, from: 'DEL Delhi', to: 'NMI Navi Mumbai T1' }));
  assert.equal(nmi.status, 200, JSON.stringify(nmi.error));
  assert.equal(nmi.data.trip.airport, null); // the PICKUP is still not an airport
  assert.equal(nmi.data.trip.flight.arrivalAirport, 'NMI');
  assert.equal(nmi.data.trip.flight.arrivalTerminal, undefined); // unknown for a pickup elsewhere
  const stored = await Trip.findById(B.id).lean();
  assert.deepEqual([stored.airport, stored.flight.arrivalAirport, stored.pickupTerminal], [null, 'NMI', null]);
  // ... and still can't share (only airport pickups can), but can travel alone
  assert.equal((await choose(B, { mode: 'shared', vehicleType: 'sedan' })).error.code, 'SHARING_UNAVAILABLE');
  assert.equal((await choose(B, { mode: 'solo', vehicleType: 'sedan' })).status, 200);

  // A ticket that names both airports without a route: verified, airport left unknown (null, not "BOM")
  const C = await unverified({ pickupLocation: 'Dadar Railway Station', pickupTerminal: null, destination: 'Colaba' });
  const bothNamed = T.ticketPdf([...T.ticketLines({ name: C.name, airline: 'Air India', flightNumber: 'AI123', date, from: null, to: null }), 'Mumbai T2 / Navi Mumbai lounge offer']);
  const both = await verify(C, T.asDocument(bothNamed, 'application/pdf'));
  assert.equal(both.status, 200, JSON.stringify(both.error));
  assert.equal(both.data.trip.flight.arrivalAirport, null);

  // Older records stay readable: a trip verified before this change with a pickup away from
  // the airport has "BOM" stored; it is read, listed and cancelled as before
  const D = await newUser();
  const [old] = await Trip.collection.insertMany([
    {
      userId: new mongoose.Types.ObjectId(D.userId), pickupLocation: 'Dadar Railway Station', pickupTerminal: null, destination: 'Colaba',
      travelDate: date, expectedArrivalTime: '10:00', arrivalAt: new Date(`${date}T10:00:00+05:30`), passengerCount: 1, luggageCount: 0,
      openToPooling: true, status: 'flight_verified', verification: { status: 'verified', method: 'demo', checks: [] },
      flight: { airline: 'Air India', flightNumber: 'AI123', flightDate: date, scheduledArrivalTime: '10:00', arrivalAirport: 'BOM' },
      poolId: null, rideMode: null, booking: null, pastBookings: [], createdAt: new Date(), updatedAt: new Date(),
    },
  ]).then((r) => Object.values(r.insertedIds));
  const read = await D.api('GET', `/trips/${old}`);
  assert.equal(read.status, 200);
  assert.deepEqual([read.data.trip.airport, read.data.trip.flight.arrivalAirport], [null, 'BOM']);
  assert.equal((await D.api('GET', '/trips')).data.trips.length, 1);
  assert.equal((await D.api('PATCH', `/trips/${old}`, { status: 'cancelled' })).data.trip.status, 'cancelled');
});

test('shared-ride locks: old date-based lock documents do not block or confuse new ones', async () => {
  // A lock written by the previous version (key by travel date) is simply ignored
  await PoolLock.create({ key: 'BOM-T2|sedan|2027-04-10', writes: 5 });
  const F = await passenger({ travelDate: '2027-04-10', destination: 'Juhu', expectedArrivalTime: '09:00' });
  const G = await passenger({ travelDate: '2027-04-10', destination: 'Juhu', expectedArrivalTime: '09:10' });
  const [f, g] = await Promise.all([choose(F, { mode: 'shared', vehicleType: 'sedan' }), choose(G, { mode: 'shared', vehicleType: 'sedan' })]);
  assert.equal(f.data.trip.poolId, g.data.trip.poolId);
  assert.equal(await Pool.countDocuments({ 'members.tripId': { $in: [F.id, G.id] } }), 1);
  assert.equal((await PoolLock.findOne({ key: 'BOM-T2|sedan|2027-04-10' })).writes, 5); // untouched
  assert.ok((await PoolLock.countDocuments({ key: /^BOM-T2\|sedan\|\d+$/ })) >= 3); // the time-slot keys
});

test('destinations: listed areas, a typed "Others" destination (kept when editing), "Others"/empty refused; old trips still work', async () => {
  const u = await newUser();
  const date = '2027-01-21';
  for (const destination of ['Colaba', 'Cuffe Parade', 'CST / CSMT', 'Vashi', 'Kharghar']) {
    const res = await u.api('POST', '/trips', tripBody({ travelDate: date, destination }));
    assert.equal(res.status, 201, destination);
    assert.equal(res.data.trip.destination, destination);
  }

  // "Others": the typed place is saved (spaces tidied), never the word "Others"
  const typed = await u.api('POST', '/trips', tripBody({ travelDate: date, destination: '  Hiranandani   Estate, Thane West ' }));
  assert.equal(typed.status, 201);
  assert.equal(typed.data.trip.destination, 'Hiranandani Estate, Thane West');
  for (const destination of ['Others', 'others', '   ', '']) {
    const refused = await u.api('POST', '/trips', tripBody({ travelDate: date, destination }));
    assert.equal(refused.status, 400, JSON.stringify(destination));
    assert.deepEqual(refused.error.details.map((d) => [d.field, d.message]), [['destination', 'Enter your destination.']]);
  }
  // Editing other details keeps the typed destination; it can be changed to another typed place
  const id = typed.data.trip.id;
  assert.equal((await u.api('PATCH', `/trips/${id}`, { passengerCount: 2 })).data.trip.destination, 'Hiranandani Estate, Thane West');
  assert.equal((await u.api('PATCH', `/trips/${id}`, { destination: 'Lodha Amara, Thane' })).data.trip.destination, 'Lodha Amara, Thane');
  assert.equal((await u.api('PATCH', `/trips/${id}`, { destination: 'Others' })).status, 400);
  // Switching the airport on an unverified trip: the old terminal doesn't carry over
  const moved = await u.api('PATCH', `/trips/${id}`, { pickupLocation: NMI_NAME });
  assert.equal(moved.status, 200, JSON.stringify(moved.error));
  assert.deepEqual([moved.data.trip.airport, moved.data.trip.pickupTerminal], ['NMI', 'T1']);

  // A trip saved before airports were added (no airport field): still a Mumbai Airport trip
  const legacy = await Trip.create({
    userId: u.userId,
    pickupLocation: AIRPORT,
    pickupTerminal: 'T2',
    destination: 'Navi Mumbai',
    travelDate: date,
    expectedArrivalTime: '09:00',
    arrivalAt: new Date(`${date}T03:30:00Z`),
    passengerCount: 1,
    luggageCount: 1,
  });
  assert.equal((await Trip.collection.findOne({ _id: legacy._id })).airport, undefined);
  const read = (await u.api('GET', `/trips/${legacy._id}`)).data.trip;
  assert.equal(read.airport, 'BOM');
  assert.equal(read.destination, 'Navi Mumbai'); // the old general option still works
  const edited = await u.api('PATCH', `/trips/${legacy._id}`, { luggageCount: 2 });
  assert.equal(edited.status, 200);
  assert.equal((await Trip.findById(legacy._id)).airport, 'BOM');
});

// ---- traveller profiles and identity verification ---------------------------------
const IDENTITY_SECRET = 'integration-identity-secret';
// The KYC provider's result, signed like a real provider's (HMAC-SHA256 of the raw body)
async function identityResult(body, { secret = IDENTITY_SECRET, signature } = {}) {
  const raw = JSON.stringify(body);
  const res = await fetch(`${base}/identity/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Identity-Signature': signature ?? crypto.createHmac('sha256', secret).update(raw).digest('hex') },
    body: raw,
  });
  return { status: res.status, ...(await res.json()) };
}
// Runs `fn` with the test-only identity provider switched on, then restores the default (none)
async function withSandboxIdentity(fn) {
  const saved = [env.identityProvider, env.identityWebhookSecret];
  env.identityProvider = 'sandbox';
  env.identityWebhookSecret = IDENTITY_SECRET;
  try {
    return await fn();
  } finally {
    [env.identityProvider, env.identityWebhookSecret] = saved;
  }
}
const yearsAgo = (years) => `${Number(new Date().toISOString().slice(0, 4)) - years}-01-15`;

test('profile: own details only, validated on the server; sharing is off until the passenger turns it on', async () => {
  const u = await newUser();
  const initial = (await u.api('GET', '/profile')).data.profile;
  assert.deepEqual(initial.profileSharing, { shareProfile: false, showGender: false });
  assert.equal(initial.dateOfBirth, null);
  assert.equal(initial.gender, null);
  assert.equal(initial.identity.status, 'not_started');

  const saved = await u.api('PATCH', '/profile', { dateOfBirth: yearsAgo(30), gender: 'female', profileSharing: { shareProfile: true } });
  assert.equal(saved.status, 200, JSON.stringify(saved.error));
  // Born 15 January, 30 years ago: 30 from 15 January on, 29 before it
  const now = new Date();
  assert.equal(saved.data.profile.age, now.getMonth() === 0 && now.getDate() < 15 ? 29 : 30);
  assert.equal(saved.data.profile.gender, 'female');
  assert.deepEqual(saved.data.profile.profileSharing, { shareProfile: true, showGender: false });

  // Validation: adults only, real dates, known genders, nothing else settable
  for (const [body, field] of [
    [{ dateOfBirth: yearsAgo(15) }, 'dateOfBirth'],
    [{ dateOfBirth: '2001-02-30' }, 'dateOfBirth'],
    [{ dateOfBirth: yearsAgo(120) }, 'dateOfBirth'],
    [{ gender: 'robot' }, 'gender'],
    [{ name: 'A' }, 'name'],
    [{ email: 'x@y.z' }, ''],
    [{ profileSharing: { shareProfile: 'yes' } }, 'profileSharing.shareProfile'],
  ]) {
    const res = await u.api('PATCH', '/profile', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.error.details[0].field, field, JSON.stringify(body));
  }
  // Gender can't be shown without the profile being shared; turning sharing off hides it again
  await u.api('PATCH', '/profile', { profileSharing: { showGender: true } });
  const off = (await u.api('PATCH', '/profile', { profileSharing: { shareProfile: false } })).data.profile;
  assert.deepEqual(off.profileSharing, { shareProfile: false, showGender: false });
  // Gender is optional: it can be removed
  assert.equal((await u.api('PATCH', '/profile', { gender: null })).data.profile.gender, null);
  assert.equal((await fetch(`${base}/profile`)).status, 401);
});

test('identity: without a provider nothing can be verified; with one, pending -> verified / rejected -> retry, own status only', async () => {
  const u = await newUser();
  // No provider configured (the default): clearly unavailable, never "verified"
  const none = (await u.api('GET', '/identity')).data.identity;
  assert.deepEqual([none.status, none.available, none.canStart], ['not_started', false, false]);
  const refused = await u.api('POST', '/identity/start', { method: 'passport', consent: true });
  assert.equal(refused.status, 503);
  assert.equal(refused.error.code, 'IDENTITY_UNAVAILABLE');
  assert.equal(await IdentityVerification.countDocuments({ userId: u.userId }), 0);

  await withSandboxIdentity(async () => {
    // Consent is required, explicitly
    assert.equal((await u.api('POST', '/identity/start', { method: 'passport' })).status, 400);
    assert.equal((await u.api('POST', '/identity/start', { method: 'passport', consent: 'yes' })).status, 400);
    // Documents are never accepted here
    assert.equal((await u.api('POST', '/identity/start', { method: 'passport', consent: true, documentNumber: 'P1234567' })).error.code, 'VALIDATION_ERROR');

    const started = await u.api('POST', '/identity/start', { method: 'aadhaar', consent: true });
    assert.equal(started.status, 202);
    assert.equal(started.data.identity.status, 'pending');
    const again = await u.api('POST', '/identity/start', { method: 'aadhaar', consent: true });
    assert.equal(again.data.identity.status, 'pending'); // still the same session
    const record = await IdentityVerification.findOne({ userId: u.userId }).lean();
    assert.deepEqual(Object.keys(record).sort(), ['__v', '_id', 'attempts', 'consent', 'createdAt', 'method', 'provider', 'providerReference', 'startedAt', 'status', 'updatedAt', 'userId']);
    assert.equal(record.consent.version, '2026-11-identity-v1');

    // The provider's result: forged or unsigned results change nothing
    assert.equal((await identityResult({ reference: record.providerReference, status: 'verified' }, { secret: 'wrong' })).status, 401);
    assert.equal((await u.api('GET', '/identity')).data.identity.status, 'pending');
    // A genuine result, with extra fields the provider might send - none of them are kept
    const ok = await identityResult({ reference: record.providerReference, status: 'verified', name: 'Test User', aadhaar: '1234 5678 9012', dob: '1990-01-01' });
    assert.equal(ok.data.applied, true);
    const verified = (await u.api('GET', '/identity')).data.identity;
    assert.deepEqual([verified.status, verified.canStart], ['verified', false]);
    const stored = JSON.stringify(await IdentityVerification.findOne({ userId: u.userId }).lean());
    for (const secret of ['1234 5678 9012', '1990-01-01', 'Test User']) assert.equal(stored.includes(secret), false, secret);
    assert.equal((await u.api('POST', '/identity/start', { method: 'aadhaar', consent: true })).error.code, 'ALREADY_VERIFIED');
    // Repeating or reversing the result changes nothing
    assert.equal((await identityResult({ reference: record.providerReference, status: 'rejected' })).data.applied, false);

    // Rejected -> retry -> verified
    const r = await newUser();
    await r.api('POST', '/identity/start', { method: 'passport', consent: true });
    const rRef = (await IdentityVerification.findOne({ userId: r.userId })).providerReference;
    await identityResult({ reference: rRef, status: 'rejected', reason: 'document_unreadable' });
    const rejected = (await r.api('GET', '/identity')).data.identity;
    assert.deepEqual([rejected.status, rejected.rejectedReason, rejected.canStart], ['rejected', 'document_unreadable', true]);
    const retry = await r.api('POST', '/identity/start', { method: 'driving_licence', consent: true });
    assert.deepEqual([retry.data.identity.status, retry.data.identity.attempts], ['pending', 2]);
    const rRef2 = (await IdentityVerification.findOne({ userId: r.userId })).providerReference;
    assert.notEqual(rRef2, rRef);
    await identityResult({ reference: rRef2, status: 'verified' });
    assert.equal((await r.api('GET', '/identity')).data.identity.status, 'verified');

    // Nobody can read another passenger's identity record or documents
    const stranger = await newUser();
    assert.equal((await stranger.api('GET', '/identity')).data.identity.status, 'not_started'); // only their own
    for (const path of [`/identity/${u.userId}`, `/identity/${record.providerReference}`, '/identity/documents', `/profile/${u.userId}`]) {
      assert.equal((await stranger.api('GET', path)).status, 404, path);
    }
  });

  // Deleting the account deletes its identity result
  const gone = await newUser();
  await withSandboxIdentity(() => gone.api('POST', '/identity/start', { method: 'passport', consent: true }));
  assert.equal((await gone.api('DELETE', '/auth/me', { password: 'secret123' })).status, 200);
  assert.equal(await IdentityVerification.countDocuments({ userId: gone.userId }), 0);
});

test('traveller cards: name and age only with consent, gender only if chosen, identity status; booking shows them to its own passengers only', async () => {
  const date = '2027-01-25';
  const A = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '12:00' });
  const B = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '12:05' });
  const C = await passenger({ travelDate: date, destination: 'Colaba', expectedArrivalTime: '20:00' }); // not compatible
  const card = async () => (await options(A)).travellers[0];

  // B hasn't consented: nothing personal is shown
  await B.api('PATCH', '/profile', { dateOfBirth: yearsAgo(41), gender: 'male' });
  assert.deepEqual((await card()).profile, { shared: false });

  // B shares name + age, not gender
  await B.api('PATCH', '/profile', { profileSharing: { shareProfile: true } });
  let profile = (await card()).profile;
  assert.equal(profile.shared, true);
  assert.equal(profile.name, `Test ${B.name.split(' ').at(-1)[0]}.`); // first name + last initial ("Test User 7" -> "Test 7.")
  assert.equal(JSON.stringify(profile).includes(B.name), false); // never the full name
  assert.ok([40, 41].includes(profile.age));
  assert.equal(profile.gender, null);
  assert.equal(profile.identity, 'not_verified');
  // ...then gender too, and a genuinely verified identity
  await B.api('PATCH', '/profile', { profileSharing: { showGender: true } });
  await withSandboxIdentity(async () => {
    await B.api('POST', '/identity/start', { method: 'passport', consent: true });
    await identityResult({ reference: (await IdentityVerification.findOne({ userId: B.userId })).providerReference, status: 'verified' });
  });
  profile = (await card()).profile;
  assert.equal(profile.gender, 'male');
  assert.equal(profile.identity, 'verified');

  // Never in any response: date of birth, email, phone, user id, identity details
  const everything = JSON.stringify(await A.api('GET', `/trips/${A.id}/matches`));
  for (const secret of [yearsAgo(41), B.email, B.userId, 'providerReference', 'sandbox_', 'passport']) {
    assert.equal(everything.includes(secret), false, secret);
  }

  // Unrelated passengers and strangers see nothing of B
  assert.equal((await options(C)).travellers.length, 0);
  const stranger = await newUser();
  assert.equal((await stranger.api('GET', `/trips/${A.id}/matches`)).status, 404);

  // Shared ride: profiles visible before confirming (pool card) and in the booking, as B currently shares them
  const poolId = (await choose(B, { mode: 'shared', vehicleType: 'suv' })).data.trip.poolId;
  const joinable = poolsFor(await options(A), 'suv').find((p) => p.id === poolId);
  assert.equal(joinable.others[0].profile.name, profile.name);
  await choose(A, { mode: 'shared', vehicleType: 'suv', poolId });
  await A.api('POST', `/trips/${A.id}/booking`, {});
  await B.api('POST', `/trips/${B.id}/booking`, {});
  const manage = (await A.api('GET', `/trips/${A.id}/booking`)).data;
  assert.equal(manage.ride.pool.others[0].profile.name, profile.name);
  assert.equal(manage.ride.pool.others[0].profile.identity, 'verified');
  assert.equal(manage.booking.travellers[0].profile, undefined); // the stored booking never copies profiles
  assert.equal((await Trip.findById(A.id)).toObject().booking.travellers.some((t) => 'profile' in t), false);
  // A sharing nothing: B sees A as "not shared"
  assert.deepEqual((await B.api('GET', `/trips/${B.id}/booking`)).data.ride.pool.others[0].profile, { shared: false });
  // B turns sharing off: it disappears from A's booking at once
  await B.api('PATCH', '/profile', { profileSharing: { shareProfile: false } });
  assert.deepEqual((await A.api('GET', `/trips/${A.id}/booking`)).data.ride.pool.others[0].profile, { shared: false });
  // Only the booking's own passengers can read it
  for (const outsider of [C, stranger]) assert.equal((await outsider.api('GET', `/trips/${A.id}/booking`)).status, 404);
});

// ---- live pooling: several passengers at once ------------------------------------
const live = (p) => p.api('GET', `/trips/${p.id}/live`);
const considering = async (p) => (await live(p)).data.activity.othersConsidering;

test('live: "also booking" counts only other compatible passengers on the ride screens, and expire', async () => {
  const date = '2027-02-01';
  const A = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '09:00' });
  const B = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '09:05' });
  const C = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '09:10' });
  const otherTerminal = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '09:00', pickupTerminal: 'T1' });
  const otherPlace = await passenger({ travelDate: date, destination: 'Somewhere Typed In', expectedArrivalTime: '09:00' });

  // 1-3. A and B are on the screen: each sees the OTHER, never themselves
  assert.equal(await considering(A), 0);
  assert.equal(await considering(B), 1);
  assert.equal(await considering(A), 1);
  // 4. C arrives: both counts go up
  assert.equal(await considering(C), 2);
  assert.equal(await considering(A), 2);
  // Incompatible passengers (other terminal, a typed destination elsewhere) neither count nor see the others
  assert.equal(await considering(otherTerminal), 0);
  assert.equal(await considering(otherPlace), 0);
  assert.equal(await considering(A), 2);
  // One record per trip, however often (or simultaneously) it checks
  await Promise.all([live(A), live(A), live(A), live(A)]);
  assert.equal(await RideIntent.countDocuments({ tripId: A.id }), 1);

  // 5. B leaves the screen: gone at once. C stops checking: gone when the intent expires
  assert.equal((await B.api('DELETE', `/trips/${B.id}/live`)).status, 200);
  assert.equal(await considering(A), 1);
  await RideIntent.updateOne({ tripId: C.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } }); // = 30 s without a check
  assert.equal(await considering(A), 0);
  assert.equal(await considering(C), 1); // C checks again: back, and sees A

  // Booking or cancelling stops counting at once
  await choose(C, { mode: 'solo', vehicleType: 'sedan' });
  await C.api('POST', `/trips/${C.id}/booking`, {});
  assert.equal(await considering(A), 0);
  assert.equal(await RideIntent.countDocuments({ tripId: C.id }), 0);
  assert.equal(await considering(B), 1); // B came back
  await B.api('PATCH', `/trips/${B.id}`, { status: 'cancelled' });
  assert.equal(await considering(A), 0);

  // Only a number - never who; only for your own trip; login required
  const body = JSON.stringify(await live(A));
  for (const secret of [B.userId, C.userId, B.email, B.id, C.id]) assert.equal(body.includes(secret), false, secret);
  const stranger = await newUser();
  assert.equal((await stranger.api('GET', `/trips/${A.id}/live`)).status, 404);
  assert.equal((await stranger.api('DELETE', `/trips/${A.id}/live`)).status, 404);
  assert.equal((await fetch(`${base}/trips/${A.id}/live`)).status, 401);
});

test('live: a new shared ride appears for compatible passengers (and notifies them); seats and "full" come from the database', async () => {
  const date = '2027-02-02';
  const A = await passenger({ travelDate: date, destination: 'Powai', expectedArrivalTime: '15:00' });
  const B = await passenger({ travelDate: date, destination: 'Powai', expectedArrivalTime: '15:05' });
  const C = await passenger({ travelDate: date, destination: 'Powai', expectedArrivalTime: '15:10', passengerCount: 2 });
  const E = await passenger({ travelDate: date, destination: 'Powai', expectedArrivalTime: '15:15' });
  const D = await passenger({ travelDate: date, destination: 'Colaba', expectedArrivalTime: '15:00' }); // not on the way
  assert.deepEqual((await live(B)).data.pools, []);

  // 6. A starts a shared sedan
  const started = await choose(A, { mode: 'shared', vehicleType: 'sedan' });
  assert.equal(started.data.outcome, 'created');
  const poolId = started.data.trip.poolId;

  // 7. B and C see it on their next check - with seats from the database; D doesn't
  const seenByB = (await live(B)).data.pools;
  assert.deepEqual(seenByB.map((p) => [p.id, p.seatsLeft, p.bookings, p.full]), [[poolId, 3, 1, false]]);
  assert.equal((await live(C)).data.pools[0].id, poolId);
  assert.deepEqual((await live(D)).data.pools, []);
  // ...and are told in-app (A, the creator, and D, incompatible, are not)
  for (const [p, expected] of [[B, 1], [C, 1], [A, 0], [D, 0]]) {
    assert.equal(await Notification.countDocuments({ userId: p.userId, type: 'pool_created' }), expected);
  }
  // 13. D can't join it either
  assert.equal((await choose(D, { mode: 'shared', vehicleType: 'sedan', poolId })).error.code, 'POOL_INCOMPATIBLE');

  // 8-9. B joins: everyone's numbers update
  assert.equal((await choose(B, { mode: 'shared', vehicleType: 'sedan', poolId })).data.outcome, 'joined');
  assert.deepEqual([(await live(A)).data.myPool.bookings, (await live(A)).data.myPool.seatsLeft], [2, 2]);
  assert.equal((await live(C)).data.pools[0].seatsLeft, 2);
  // 10. C (a group of 2) takes the last seats: full; nobody else can join, and it's no longer offered
  await choose(C, { mode: 'shared', vehicleType: 'sedan', poolId });
  const mine = (await live(A)).data.myPool;
  assert.deepEqual([mine.seatsLeft, mine.full], [0, true]);
  assert.deepEqual((await live(E)).data.pools, []);
  assert.equal((await choose(E, { mode: 'shared', vehicleType: 'sedan', poolId })).error.code, 'POOL_FULL');
  const pool = await Pool.findById(poolId);
  assert.equal(pool.seatsTaken, 4);
  assert.equal(pool.members.length, 3);
  // The count can't be set by the app: unknown fields are refused
  assert.equal((await choose(E, { mode: 'shared', vehicleType: 'sedan', poolId, seatsLeft: 9 })).status, 400);
});

test('live: two passengers starting a shared ride at the same moment end up in ONE ride; the last seat goes to one only', async () => {
  // 11. Simultaneous "start a shared ride" by compatible passengers
  for (let round = 0; round < 3; round++) {
    const date = `2027-02-1${round}`;
    const F = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '11:00' });
    const G = await passenger({ travelDate: date, destination: 'Andheri West', expectedArrivalTime: '11:05' });
    const [f, g] = await Promise.all([
      choose(F, { mode: 'shared', vehicleType: 'suv' }),
      choose(G, { mode: 'shared', vehicleType: 'suv' }),
    ]);
    assert.equal(f.status, 200, JSON.stringify(f.error));
    assert.equal(g.status, 200, JSON.stringify(g.error));
    assert.equal(f.data.trip.poolId, g.data.trip.poolId, `round ${round}: one shared ride`);
    assert.deepEqual([f.data.outcome, g.data.outcome].sort(), ['created', 'joined_existing']);
    const pools = await Pool.find({ 'members.tripId': { $in: [F.id, G.id] } });
    assert.equal(pools.length, 1);
    assert.equal(pools[0].seatsTaken, 2);
  }

  // 12. One seat left, two passengers take it at the same moment
  const date = '2027-02-20';
  const host = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '07:00', passengerCount: 3 });
  const poolId = (await choose(host, { mode: 'shared', vehicleType: 'sedan' })).data.trip.poolId; // 3 of 4 seats taken
  const H = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '07:05' });
  const I = await passenger({ travelDate: date, destination: 'Juhu', expectedArrivalTime: '07:10' });
  const results = await Promise.all([choose(H, { mode: 'shared', vehicleType: 'sedan', poolId }), choose(I, { mode: 'shared', vehicleType: 'sedan', poolId })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.ok(['POOL_FULL', 'POOL_CHANGED'].includes(results.find((r) => r.status === 409).error.code));
  const pool = await Pool.findById(poolId);
  assert.deepEqual([pool.seatsTaken, pool.members.length], [4, 2]);

  // 15. A lost response is retried: still one booking, one reference
  const loser = results.find((r) => r.status === 409) === results[0] ? H : I;
  const winner = loser === H ? I : H;
  const [b1, b2] = [await winner.api('POST', `/trips/${winner.id}/booking`, {}), await winner.api('POST', `/trips/${winner.id}/booking`, {})];
  assert.equal(b1.data.booking.reference, b2.data.booking.reference);
  assert.equal(await Trip.countDocuments({ _id: winner.id, 'booking.status': 'confirmed' }), 1);
});

test('live: passengers landing either side of midnight who start a shared ride at the same moment still end up in ONE ride', async () => {
  // Compatible (20 minutes apart) but on different travel dates
  for (let round = 0; round < 4; round++) {
    const day = 21 + round * 2;
    const F = await passenger({ travelDate: `2027-03-${day}`, destination: 'Andheri West', expectedArrivalTime: '23:50' });
    const G = await passenger({ travelDate: `2027-03-${day + 1}`, destination: 'Andheri West', expectedArrivalTime: '00:10' });
    assert.ok((await options(F)).travellers.length === 1, 'they are compatible');
    const [f, g] = await Promise.all([choose(F, { mode: 'shared', vehicleType: 'suv' }), choose(G, { mode: 'shared', vehicleType: 'suv' })]);
    assert.equal(f.status, 200, JSON.stringify(f.error));
    assert.equal(g.status, 200, JSON.stringify(g.error));
    assert.equal(f.data.trip.poolId, g.data.trip.poolId, `round ${round}: one shared ride across midnight`);
    assert.deepEqual([f.data.outcome, g.data.outcome].sort(), ['created', 'joined_existing']);
    assert.equal(await Pool.countDocuments({ 'members.tripId': { $in: [F.id, G.id] } }), 1);
  }
});

// ---- 7. data consistency after everything above ------------------------------------
test('database stays consistent: trips and pools agree, nothing over capacity', async () => {
  const trips = await Trip.find({ rideMode: 'shared', status: { $ne: 'cancelled' } });
  for (const t of trips) {
    const pool = await Pool.findById(t.poolId);
    assert.ok(pool?.members.some((m) => String(m.tripId) === String(t._id)), `trip ${t._id} listed by its pool`);
    assert.equal(pool.vehicleType, t.vehicleType);
  }
  for (const p of await Pool.find({ status: { $ne: 'cancelled' } })) {
    const seats = p.members.reduce((s, m) => s + m.partySize, 0);
    assert.equal(p.seatsTaken, seats);
    assert.ok(p.seatsTaken <= p.seats && p.bagsTaken <= p.bags);
  }
  assert.equal(await Trip.countDocuments({ rideMode: 'solo', poolId: { $ne: null } }), 0);
});
