// Unit tests for fare estimates. Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitEqually, estimateTotalFare, estimateRideFare, planRoute } from '../../src/services/fare.service.js';
import { vehicleByType } from '../../src/config/pricing.js';
import { resolveArea } from '../../src/data/mumbaiAreas.js';

const sedan = vehicleByType('sedan');
const suv = vehicleByType('suv');
const point = (name) => resolveArea(name).point;

test('equal split adds up to the total, extra rupees go to the first people', () => {
  assert.deepEqual(splitEqually(900, 3), { shares: [300, 300, 300], min: 300, max: 300 });
  assert.deepEqual(splitEqually(1000, 3).shares, [334, 333, 333]);
  for (let people = 1; people <= 6; people++) {
    for (const total of [300, 310, 455, 1234]) {
      const { shares } = splitEqually(total, people);
      assert.equal(shares.reduce((a, b) => a + b), total, `${total} / ${people}`);
      assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
    }
  }
});

test('total fare uses base + per km, the minimum fare, and rounds to ₹10', () => {
  assert.equal(estimateTotalFare(sedan, 0), sedan.minimumFare);
  assert.equal(estimateTotalFare(sedan, 20), 520); // 120 + 20 × 20
  assert.equal(estimateTotalFare(sedan, 20.3) % 10, 0);
});

test('an SUV is priced with its own rates, not the sedan fare', () => {
  const stops = [{ key: 'me', point: point('Thane'), partySize: 1 }];
  const sedanFare = estimateRideFare(sedan, stops).total;
  const suvFare = estimateRideFare(suv, stops).total;
  assert.ok(suvFare > sedanFare);
});

test('route visits the nearest drop-off first', () => {
  const { order } = planRoute([
    { key: 'thane', point: point('Thane') },
    { key: 'powai', point: point('Powai') },
  ]);
  assert.deepEqual(order.map((s) => s.key), ['powai', 'thane']);
});

test('shares per group add up to the total; companions pay their own share', () => {
  const fare = estimateRideFare(sedan, [
    { key: 'a', point: point('Andheri West'), partySize: 2 },
    { key: 'b', point: point('Andheri West'), partySize: 1 },
  ]);
  assert.equal(fare.people, 3);
  assert.equal(fare.shares.a + fare.shares.b, fare.total);
  assert.ok(fare.shares.a >= 2 * fare.perPerson.min);
  assert.equal(fare.currency, 'INR');
});

test('solo ride: one group pays the whole fare', () => {
  const fare = estimateRideFare(sedan, [{ key: 'me', point: point('Juhu'), partySize: 3 }]);
  assert.equal(fare.shares.me, fare.total);
});

test('no estimate when a drop-off location is unknown', () => {
  assert.equal(estimateRideFare(sedan, [{ key: 'me', point: null, partySize: 1 }]), null);
});
