// Unit tests for passenger matching (pure functions, no database). Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeTrip,
  findCompatibleTrips,
  isCompatible,
  routeIsFair,
  whyPoolRejects,
  normalizeFlightNumber,
} from '../../src/services/matching.service.js';
import { AIRPORT } from '../../src/data/mumbaiAreas.js';
import { vehicleByType, MATCHING } from '../../src/config/pricing.js';

let nextId = 1;
const BASE_TIME = new Date('2026-10-20T10:00:00+05:30').getTime();

// A described trip with sensible defaults
function trip({ destination = 'Andheri West', minutes = 0, party = 1, bags = 1, terminal = 'T2', flight = 'AI123', pooling = true, rideMode = null, pickup, user } = {}) {
  const id = String(nextId++).padStart(24, '0');
  return describeTrip({
    _id: id,
    userId: user ?? `u${id}`,
    pickupLocation: pickup ?? AIRPORT.name,
    pickupTerminal: terminal,
    destination,
    arrivalAt: new Date(BASE_TIME + minutes * 60000),
    passengerCount: party,
    luggageCount: bags,
    openToPooling: pooling,
    rideMode,
    flight: { flightNumber: flight },
  });
}

// A pool of described members in a vehicle
function pool(vehicleType, members, status = 'open') {
  const v = vehicleByType(vehicleType);
  return { status, vehicleType, seats: v.seats, bags: v.bags, members };
}

test('the AI123 example: 10:00 and 10:10 to Andheri West are compatible', () => {
  const a = trip({ minutes: 0 });
  const b = trip({ minutes: 10 });
  assert.ok(isCompatible(b, a));
  const found = findCompatibleTrips(b, [a]);
  assert.equal(found.length, 1);
  assert.equal(found[0].sameFlight, true);
  assert.equal(found[0].minutesApart, -10);
});

test('nobody is matched with their own trip or their other trips', () => {
  const me = trip({ user: 'same-user' });
  const mine = trip({ user: 'same-user', minutes: 5 });
  assert.equal(findCompatibleTrips(me, [me, mine]).length, 0);
});

test('destinations are compared as areas, not exact text', () => {
  const a = trip({ destination: 'Lokhandwala, Andheri West' });
  const b = trip({ destination: 'andheri west' });
  assert.ok(isCompatible(a, b));
  assert.ok(isCompatible(trip({ destination: 'Andheri West' }), trip({ destination: 'Andheri East' })));
});

test('incompatible: opposite direction, other terminal, too far apart in time', () => {
  const me = trip();
  assert.ok(!isCompatible(me, trip({ destination: 'Colaba' })));
  assert.ok(!isCompatible(me, trip({ terminal: 'T1' })));
  assert.ok(!isCompatible(me, trip({ minutes: MATCHING.arrivalWindowMinutes + 1 })));
  assert.ok(!isCompatible(me, trip({ pickup: 'Hotel Leela, Andheri East' })));
});

test('same flight is not enough: destination must be compatible', () => {
  assert.ok(!isCompatible(trip({ destination: 'Andheri West' }), trip({ destination: 'Thane' })));
});

test('on-the-way destinations match (Powai then Thane)', () => {
  assert.ok(routeIsFair([trip({ destination: 'Powai' }), trip({ destination: 'Thane' })]));
});

test('solo travellers and private-cab trips are not offered for sharing', () => {
  const me = trip();
  assert.equal(findCompatibleTrips(me, [trip({ rideMode: 'solo' })]).length, 0);
  assert.equal(findCompatibleTrips(me, [trip({ pooling: false })]).length, 0);
  assert.equal(findCompatibleTrips(me, [trip({ pooling: false, rideMode: 'shared' })]).length, 1);
});

test('same flight ranks first, then closest arrival time', () => {
  const me = trip({ flight: 'AI123' });
  const result = findCompatibleTrips(me, [trip({ minutes: 5, flight: '6E2134' }), trip({ minutes: 30, flight: 'ai 123' })]);
  assert.deepEqual(result.map((r) => r.sameFlight), [true, false]);
});

test('flight numbers are normalised', () => {
  assert.equal(normalizeFlightNumber('ai 123'), 'AI123');
  assert.equal(normalizeFlightNumber('6E-2134'), '6E2134');
});

test('joining a pool: fits until the vehicle is full', () => {
  const sedanPool = pool('sedan', [trip({ party: 2, bags: 0 }), trip({ party: 1, bags: 0 })]);
  assert.equal(whyPoolRejects(sedanPool, trip({ party: 1, bags: 0 })), null); // 4 of 4
  assert.equal(whyPoolRejects(sedanPool, trip({ party: 2, bags: 0 })), 'full'); // 5 > 4
  const suvPool = pool('suv', [trip({ party: 2, bags: 0 }), trip({ party: 1, bags: 0 })]);
  assert.equal(whyPoolRejects(suvPool, trip({ party: 2, bags: 0 })), null); // 5 of 6
});

test('bags count towards capacity too', () => {
  const sedanPool = pool('sedan', [trip({ bags: 2 })]);
  assert.equal(whyPoolRejects(sedanPool, trip({ bags: 2 })), 'full'); // 4 > 3 bags
  assert.equal(whyPoolRejects(pool('suv', [trip({ bags: 2 })]), trip({ bags: 2 })), null);
});

test('a pool rejects incompatible, duplicate or closed membership', () => {
  const member = trip();
  assert.equal(whyPoolRejects(pool('sedan', [member]), trip({ destination: 'Colaba' })), 'incompatible');
  assert.equal(whyPoolRejects(pool('sedan', [member]), trip({ minutes: 90 })), 'incompatible');
  assert.equal(whyPoolRejects(pool('sedan', [member]), member), 'already_member');
  assert.equal(whyPoolRejects(pool('sedan', [member], 'confirmed'), trip()), 'not_open');
  // every member must suit the newcomer, not just the first one
  const mixed = pool('suv', [trip({ destination: 'Andheri West' }), trip({ destination: 'Juhu', minutes: 55 })]);
  assert.equal(whyPoolRejects(mixed, trip({ destination: 'Andheri West', minutes: -20 })), 'incompatible');
});

test('unknown destinations only match the exact same text', () => {
  const me = trip({ destination: 'Some Hotel Road' });
  assert.ok(isCompatible(me, trip({ destination: 'some hotel road' })));
  assert.ok(!isCompatible(me, trip({ destination: 'Other Place' })));
});
