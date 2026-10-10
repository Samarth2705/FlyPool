// Fare estimates. All fare maths lives here so the rules are in one place.
// Rates and assumptions come from config/pricing.js. These are provisional
// estimates, never live quotes.
import { AIRPORT } from '../data/mumbaiAreas.js';
import { distanceKm } from '../utils/geo.js';
import { ROAD_DISTANCE_FACTOR, FARE_ROUNDING, FARE_ASSUMPTIONS } from '../config/pricing.js';

export const FARE_SOURCE = 'flypool-pricing-rules';

// Drop-off order for a shared cab: from the airport, always go to the
// nearest drop-off not visited yet.
// stops: [{ key, point }]. Returns the stops in order with the straight-line
// km driven from the airport until each drop (`atKm`), plus the total.
export function planRoute(stops) {
  const remaining = [...stops];
  const order = [];
  let position = AIRPORT.point;
  let totalKm = 0;

  while (remaining.length > 0) {
    let nearest = 0;
    remaining.forEach((stop, i) => {
      if (distanceKm(position, stop.point) < distanceKm(position, remaining[nearest].point)) nearest = i;
    });
    const [stop] = remaining.splice(nearest, 1);
    totalKm += distanceKm(position, stop.point);
    order.push({ ...stop, atKm: totalKm });
    position = stop.point;
  }

  return { order, totalKm };
}

function roundTo(value, step) {
  return Math.round(value / step) * step;
}

// Estimated total fare (whole rupees) for a vehicle over a road distance
export function estimateTotalFare(vehicle, roadKm) {
  const raw = vehicle.baseFare + vehicle.perKm * roadKm;
  return roundTo(Math.max(raw, vehicle.minimumFare), FARE_ROUNDING);
}

// Splits a total equally between people in whole rupees. Any leftover
// rupees go one each to the first people, so the shares always add up to
// the total exactly. 1000 between 3 -> [334, 333, 333].
export function splitEqually(total, people) {
  const base = Math.floor(total / people);
  const extra = total - base * people;
  const shares = Array.from({ length: people }, (_, i) => base + (i < extra ? 1 : 0));
  return { shares, min: base, max: base + (extra > 0 ? 1 : 0) };
}

// Estimate for ONE cab carrying these groups.
// members: [{ key, point, partySize }] in a fixed order (e.g. join order).
// Returns null if any drop-off has no known location.
// shares[key] is that group's part of the total (partySize × per-person,
// with the ₹1 rounding leftovers going to the earliest members).
export function estimateRideFare(vehicle, members) {
  if (members.length === 0 || members.some((m) => !m.point)) return null;

  const route = planRoute(members.map((m) => ({ key: m.key, point: m.point })));
  const roadKm = route.totalKm * ROAD_DISTANCE_FACTOR;
  const total = estimateTotalFare(vehicle, roadKm);
  const people = members.reduce((sum, m) => sum + m.partySize, 0);
  const split = splitEqually(total, people);

  const shares = {};
  let position = 0;
  for (const m of members) {
    shares[m.key] = split.shares.slice(position, position + m.partySize).reduce((a, b) => a + b, 0);
    position += m.partySize;
  }

  return {
    currency: 'INR',
    total,
    people,
    perPerson: { min: split.min, max: split.max },
    roadKm: Math.round(roadKm * 10) / 10,
    shares,
    source: FARE_SOURCE,
  };
}

export { FARE_ASSUMPTIONS };
