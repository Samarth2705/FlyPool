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
  estimateForMembers,
  sharedRideLockKeys,
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

// ---- airports: Mumbai (BOM) and Navi Mumbai (NMI) --------------------------------------
const NMI = 'Navi Mumbai International Airport';

test('passengers at different airports are never matched, even on the same flight, time and destination', () => {
  const atBom = trip({ destination: 'Vashi', terminal: 'T2' });
  const atNmi = trip({ destination: 'Vashi', pickup: NMI, terminal: 'T1' });
  assert.equal(atBom.airport, 'BOM');
  assert.equal(atNmi.airport, 'NMI');
  assert.equal(isCompatible(atBom, atNmi), false);
  assert.equal(isCompatible(atNmi, atBom), false);
  // ...also when the terminals happen to be called the same
  assert.equal(isCompatible(trip({ destination: 'Vashi', terminal: 'T1' }), atNmi), false);
  assert.deepEqual(findCompatibleTrips(atNmi, [atBom]), []);
  // and a Mumbai Airport pool never takes a Navi Mumbai passenger
  assert.equal(whyPoolRejects(pool('suv', [atBom]), atNmi), 'incompatible');
});

test('passengers at Navi Mumbai Airport match each other; Navi Mumbai areas are on the way', () => {
  const a = trip({ destination: 'Kharghar', pickup: NMI, terminal: 'T1' });
  const b = trip({ destination: 'CBD Belapur', pickup: NMI, terminal: 'T1', minutes: 10 });
  assert.equal(a.pickupKey, 'NMI-T1');
  assert.equal(isCompatible(a, b), true);
  assert.equal(isCompatible(a, trip({ destination: 'Colaba', pickup: NMI, terminal: 'T1' })), false); // opposite direction
});

test('routes start at the trip’s own airport: Kharghar is closer to Navi Mumbai Airport', () => {
  const v = vehicleByType('sedan');
  const fromNmi = estimateForMembers(v, [trip({ destination: 'Kharghar', pickup: NMI, terminal: 'T1' })]);
  const fromBom = estimateForMembers(v, [trip({ destination: 'Kharghar' })]);
  assert.ok(fromNmi.roadKm < fromBom.roadKm, `${fromNmi.roadKm} km vs ${fromBom.roadKm} km`);
});

test('every new area is known, so nearby destinations can match', () => {
  for (const area of ['Colaba', 'Cuffe Parade', 'Fort', 'CST / CSMT', 'Churchgate', 'Marine Lines', 'Dadar', 'Bandra', 'Andheri', 'Powai', 'Ghatkopar',
    'Vashi', 'Sanpada', 'Juinagar', 'Nerul', 'Seawoods', 'CBD Belapur', 'Kharghar', 'Kamothe', 'Kalamboli', 'Panvel', 'Ulwe', 'Airoli', 'Ghansoli', 'Kopar Khairane', 'Turbhe', 'Taloja']) {
    assert.equal(trip({ destination: area }).area?.name, area, area);
  }
  // South Mumbai neighbours share a cab
  assert.equal(isCompatible(trip({ destination: 'Cuffe Parade' }), trip({ destination: 'Colaba' })), true);
  assert.equal(isCompatible(trip({ destination: 'CST / CSMT' }), trip({ destination: 'Fort' })), true);
});

test('typed ("Others") destinations: same place matches, different places never just because both were typed', () => {
  const a = trip({ destination: '  Hiranandani   Estate ' });
  const b = trip({ destination: 'hiranandani estate' });
  const c = trip({ destination: 'Lodha Amara' });
  assert.equal(a.area, null);
  assert.equal(isCompatible(a, b), true); // the same text once normalised
  assert.equal(isCompatible(a, c), false);
  // A typed place naming a known area is matched by that area
  assert.equal(trip({ destination: 'Sector 20, Kharghar' }).area.name, 'Kharghar');
  assert.equal(isCompatible(trip({ destination: 'Sector 20, Kharghar' }), trip({ destination: 'Kharghar' })), true);
});

test('trips saved before airports were added are Mumbai Airport trips', () => {
  const legacy = describeTrip({
    _id: 'legacy', userId: 'u-legacy', pickupLocation: AIRPORT.name, pickupTerminal: 'T2', destination: 'Powai',
    arrivalAt: new Date(BASE_TIME), passengerCount: 1, luggageCount: 1, openToPooling: true, flight: { flightNumber: 'AI123' },
  }); // no `airport` field
  assert.equal(legacy.airport, 'BOM');
  assert.equal(legacy.pickupKey, 'BOM-T2'); // the key existing pools use
  assert.equal(isCompatible(legacy, trip({ destination: 'Powai' })), true);
});

test('shared-ride lock keys: any two compatible trips share one - also either side of midnight', () => {
  const at = (iso, overrides = {}) =>
    describeTrip({ _id: String(nextId++).padStart(24, '0'), userId: `u${nextId}`, pickupLocation: AIRPORT.name, pickupTerminal: 'T2', destination: 'Juhu', arrivalAt: new Date(iso), passengerCount: 1, luggageCount: 0, openToPooling: true, ...overrides });
  const shares = (a, b, vehicle = 'sedan') => sharedRideLockKeys(a, vehicle).some((k) => sharedRideLockKeys(b, vehicle).includes(k));

  // 23:50 on the 22nd and 00:10 on the 23rd (Mumbai time): compatible, different travel dates
  const late = at('2026-12-22T23:50:00+05:30');
  const early = at('2026-12-23T00:10:00+05:30');
  assert.equal(isCompatible(late, early), true);
  assert.equal(shares(late, early), true);
  assert.equal(sharedRideLockKeys(late, 'sedan').length, 3);
  assert.ok(sharedRideLockKeys(late, 'sedan').every((k) => k.startsWith('BOM-T2|sedan|')));

  // Every pair of arrival times up to the full window apart shares a key (random times + the exact edge)
  const W = MATCHING.arrivalWindowMinutes * 60 * 1000;
  const start = new Date('2026-12-20T00:00:00+05:30').getTime();
  for (let i = 0; i < 2000; i++) {
    const t = start + Math.floor(Math.random() * 3 * 24 * 3600 * 1000);
    const gap = i === 0 ? W : Math.floor(Math.random() * (W + 1));
    assert.equal(shares(at(new Date(t).toISOString()), at(new Date(t + gap).toISOString())), true, `gap ${gap / 60000} min`);
  }

  // Never shared across vehicles, terminals or airports
  assert.equal(sharedRideLockKeys(late, 'sedan').some((k) => sharedRideLockKeys(early, 'suv').includes(k)), false);
  assert.equal(shares(late, at('2026-12-22T23:50:00+05:30', { pickupTerminal: 'T1' })), false);
  assert.equal(shares(late, at('2026-12-22T23:50:00+05:30', { pickupLocation: 'Navi Mumbai International Airport', pickupTerminal: 'T1' })), false);
  // Far apart (a day): no shared key, so unrelated groups never wait on each other
  assert.equal(shares(late, at('2026-12-23T23:50:00+05:30')), false);
});
