// Integration tests: the real Express app + an isolated, throwaway MongoDB
// replica set (mongodb-memory-server), so transactions behave like Atlas and
// no real data is touched. Run with: npm run test:integration
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
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
});

const { default: mongoose } = await import('mongoose');
const { default: app } = await import('../../src/app.js');
const { env } = await import('../../src/config/env.js');
const { MATCHING } = await import('../../src/config/pricing.js');
const { registerFlightVerifier } = await import('../../src/services/flightVerification.service.js');
const { Trip } = await import('../../src/models/Trip.js');
const { Pool } = await import('../../src/models/Pool.js');
const { User } = await import('../../src/models/User.js');

let server;
let base;

before(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([User.init(), Trip.init(), Pool.init()]); // build unique indexes first
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  await mongoose.disconnect();
  await replSet.stop();
});

// ---- helpers --------------------------------------------------------------------
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4d90000000049454e44ae426082',
  'hex',
).toString('base64');
const DOC = { mimeType: 'image/png', dataBase64: PNG };
const FUTURE_DATE = '2026-12-20';
let userCounter = 0;

function client(ip) {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const json = await res.json();
    return { status: res.status, ...json };
  };
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
  return { api, email: `user${n}@test.flypool.invalid`, userId: res.data.user.id };
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
      document: DOC,
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
    airline: 'Indigo Airlines', flightNumber: 'AI 123', scheduledArrivalTime: '11:30', document: DOC,
  });
  assert.equal(wrongAirline.status, 422);
  assert.match(wrongAirline.error.message, /operated by Air India/);

  let trip = (await p.api('GET', `/trips/${p.id}`)).data.trip;
  assert.equal(trip.expectedArrivalTime, '09:00'); // not overwritten by the failed attempt
  assert.equal(trip.flight, undefined);
  assert.equal(trip.status, 'awaiting_verification');
  assert.equal(trip.verification.status, 'failed');

  for (const [airline, flightNumber] of [['Some Airline', 'ZZ 999'], ['Vistara', 'UK 945']]) {
    const unknown = await p.api('POST', `/trips/${p.id}/verification`, { airline, flightNumber, scheduledArrivalTime: '11:30', document: DOC });
    assert.equal(unknown.status, 422, `${airline} ${flightNumber} must not verify`);
  }
  const malformed = await p.api('POST', `/trips/${p.id}/verification`, { airline: 'IndiGo', flightNumber: 'hello', scheduledArrivalTime: '11:30', document: DOC });
  assert.equal(malformed.status, 400);
  const fakeFile = await p.api('POST', `/trips/${p.id}/verification`, {
    airline: 'Air India', flightNumber: 'AI 123', scheduledArrivalTime: '11:30',
    document: { mimeType: 'image/png', dataBase64: Buffer.from('not an image').toString('base64') },
  });
  assert.equal(fakeFile.error.code, 'INVALID_DOCUMENT');

  const retry = await p.api('POST', `/trips/${p.id}/verification`, { airline: 'Air India', flightNumber: 'aic 0123', scheduledArrivalTime: '11:30', document: DOC });
  assert.equal(retry.status, 200);
  trip = retry.data.trip;
  assert.equal(trip.status, 'flight_verified');
  assert.equal(trip.flight.flightNumber, 'AI123'); // ICAO + leading zero normalised
  assert.equal(trip.expectedArrivalTime, '11:30');
  assert.equal(trip.verification.method, 'demo');
});

test('verification unavailable or failing service never reports success', async () => {
  const p = await passenger({ verify: false });
  const call = () => p.api('POST', `/trips/${p.id}/verification`, { airline: 'Air India', flightNumber: 'AI123', scheduledArrivalTime: '10:00', document: DOC });
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
