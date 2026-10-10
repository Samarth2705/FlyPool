// Passenger matching rules (Page 4). Pure functions - no database - so they
// can be unit tested (test/matching.test.js). The database side (finding
// candidates, joining pools) is in services/ride.service.js.
//
// Two trips are COMPATIBLE when (numbers in config/pricing.js -> MATCHING):
//   - both are picked up at the airport, at the same terminal
//   - they land within MATCHING.arrivalWindowMinutes of each other
//     (and on the same flight, if MATCHING.requireSameFlight is on)
//   - their drop-offs are on the way: nobody's trip gets longer than the
//     allowed detour. Destinations are compared as areas ("Lokhandwala,
//     Andheri West" = Andheri West); unknown places only match the same text.
// A trip can JOIN a pool when it is compatible with every member and the
// whole group (people and bags) fits the pool's vehicle.
import { AIRPORT, resolveArea, normalizePlace } from '../data/mumbaiAreas.js';
import { distanceKm } from '../utils/geo.js';
import { MATCHING } from '../config/pricing.js';
import { planRoute, estimateRideFare } from './fare.service.js';

// Trips whose flight has been verified (demo verification counts)
export const VERIFIED_STATUSES = ['flight_verified', 'ride_selected'];

// "ai 123" / "AI-123" -> "AI123"
export function normalizeFlightNumber(value) {
  return value ? String(value).replace(/[\s-]/g, '').toUpperCase() : null;
}

// The facts about a trip that matching needs
export function describeTrip(trip) {
  const fromAirport = trip.pickupLocation === AIRPORT.name;
  return {
    id: String(trip._id ?? trip.id),
    userId: String(trip.userId),
    fromAirport,
    pickupKey: fromAirport ? `${AIRPORT.code}-${trip.pickupTerminal}` : `custom:${normalizePlace(trip.pickupLocation)}`,
    destination: trip.destination,
    destinationKey: normalizePlace(trip.destination),
    area: resolveArea(trip.destination), // { name, point } or null if unknown
    partySize: trip.passengerCount,
    bags: trip.luggageCount,
    arrivalAt: new Date(trip.arrivalAt).getTime(),
    flightNumber: normalizeFlightNumber(trip.flight?.flightNumber),
    openToPooling: trip.openToPooling,
    rideMode: trip.rideMode ?? null,
    poolId: trip.poolId ? String(trip.poolId) : null,
    isDemo: Boolean(trip.isDemo),
  };
}

// The same facts for a member stored in a pool
export function describeMember(member, pool) {
  return {
    id: String(member.tripId),
    userId: String(member.userId),
    fromAirport: true,
    pickupKey: pool.pickupKey,
    destination: member.destination,
    destinationKey: normalizePlace(member.destination),
    area: resolveArea(member.destination),
    partySize: member.partySize,
    bags: member.bags,
    arrivalAt: new Date(member.arrivalAt).getTime(),
    flightNumber: normalizeFlightNumber(member.flightNumber),
    openToPooling: true,
    rideMode: 'shared',
    poolId: String(pool._id),
    isDemo: Boolean(member.isDemo),
  };
}

function detourAllowanceKm(directKm) {
  return Math.max(MATCHING.maxDetourKm, directKm * MATCHING.maxDetourRatio);
}

// Can these passengers share one cab without anyone's trip getting too long?
export function routeIsFair(members) {
  if (members.every((m) => m.area)) {
    const { order } = planRoute(members.map((m) => ({ key: m.id, point: m.area.point })));
    return order.every((stop) => {
      const directKm = distanceKm(AIRPORT.point, stop.point);
      return stop.atKm - directKm <= detourAllowanceKm(directKm);
    });
  }
  // Without known locations, only identical destinations can share
  return members.every((m) => m.destinationKey === members[0].destinationKey);
}

// Pickup, arrival time and flight rules between two trips (not destinations)
function sameJourneyStart(a, b) {
  if (!a.fromAirport || !b.fromAirport || a.pickupKey !== b.pickupKey) return false;
  if (Math.abs(a.arrivalAt - b.arrivalAt) > MATCHING.arrivalWindowMinutes * 60 * 1000) return false;
  if (MATCHING.requireSameFlight && (!a.flightNumber || a.flightNumber !== b.flightNumber)) return false;
  return true;
}

export function isCompatible(a, b) {
  return a.userId !== b.userId && sameJourneyStart(a, b) && routeIsFair([a, b]);
}

// Can this trip still be offered to others for sharing?
export function isOpenToSharing(trip) {
  if (trip.rideMode === 'solo') return false;
  if (trip.rideMode === 'shared') return true;
  return trip.openToPooling; // no ride chosen yet: use the Page 2 preference
}

// Other travellers compatible with `me`, best first: same flight, then
// closest arrival time. Never includes `me` or anyone travelling solo.
export function findCompatibleTrips(me, others) {
  return others
    .filter((o) => o.id !== me.id && isOpenToSharing(o) && isCompatible(me, o))
    .map((o) => ({
      ...o,
      minutesApart: Math.round((o.arrivalAt - me.arrivalAt) / 60000),
      sameFlight: Boolean(me.flightNumber && o.flightNumber === me.flightNumber),
    }))
    .sort((a, b) => Number(b.sameFlight) - Number(a.sameFlight) || Math.abs(a.minutesApart) - Math.abs(b.minutesApart));
}

// Do these groups fit in the vehicle?
export function fitsVehicle(vehicle, members) {
  const people = members.reduce((sum, m) => sum + m.partySize, 0);
  const bags = members.reduce((sum, m) => sum + m.bags, 0);
  return people <= vehicle.seats && bags <= vehicle.bags;
}

// Can `me` join this pool? Returns null if yes, otherwise the reason.
// pool: { status, vehicleType, seats, bags, members: [described members] }
export function whyPoolRejects(pool, me) {
  if (pool.status !== 'open') return 'not_open';
  if (pool.members.some((m) => m.id === me.id || m.userId === me.userId)) return 'already_member';
  if (pool.members.length === 0) return 'empty';
  if (!fitsVehicle({ seats: pool.seats, bags: pool.bags }, [...pool.members, me])) return 'full';
  if (!pool.members.every((m) => sameJourneyStart(me, m))) return 'incompatible';
  if (!routeIsFair([...pool.members, me])) return 'incompatible';
  return null;
}

// Estimate for one cab with these described members (in this order).
// No estimate for pickups away from the airport or unknown drop-off areas.
export function estimateForMembers(vehicle, members) {
  return estimateRideFare(
    vehicle,
    members.map((m) => ({ key: m.id, point: m.fromAirport ? (m.area?.point ?? null) : null, partySize: m.partySize })),
  );
}
