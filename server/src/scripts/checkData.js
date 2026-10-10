// READ-ONLY consistency check of users, trips and shared rides (pools).
//
//   npm run check:data
//
// Reports problems by record id only (no names, emails or other personal
// data) and exits with code 1 if any are found. It never changes data.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { TRIP_STATUSES } from '../models/Trip.js';
import { POOL_STATUSES } from '../models/Pool.js';
import { vehicleByType } from '../config/pricing.js';

const problems = [];
const report = (what, id, detail) => problems.push(`${what} ${id}: ${detail}`);
const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);

async function main() {
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  const db = mongoose.connection.db;
  const [users, trips, pools] = await Promise.all([
    db.collection('users').find({}, { projection: { _id: 1 } }).toArray(),
    db.collection('trips').find({}).toArray(),
    db.collection('pools').find({}).toArray(),
  ]);
  const userIds = new Set(users.map((u) => String(u._id)));
  const tripById = new Map(trips.map((t) => [String(t._id), t]));
  const poolById = new Map(pools.map((p) => [String(p._id), p]));

  for (const t of trips) {
    const id = String(t._id);
    if (!userIds.has(String(t.userId))) report('trip', id, 'owner user does not exist');
    if (!TRIP_STATUSES.includes(t.status)) report('trip', id, `unknown status "${t.status}"`);
    if (t.poolSelection) report('trip', id, 'old "poolSelection" field present - run npm run migrate:pools');

    const verified = ['flight_verified', 'ride_selected'].includes(t.status);
    if (verified && t.verification?.status !== 'verified') report('trip', id, 'verified status but verification is not "verified"');
    if (verified && !t.flight?.flightNumber) report('trip', id, 'verified status but no flight details');
    if (t.status === 'ride_selected' && !t.rideMode) report('trip', id, 'ride_selected but no rideMode');
    if (t.rideMode === 'solo' && t.poolId) report('trip', id, 'solo ride but still points at a pool');

    if (t.status !== 'cancelled' && t.rideMode === 'shared') {
      const pool = poolById.get(String(t.poolId));
      if (!pool) report('trip', id, 'shared ride but its pool does not exist');
      else if (!pool.members.some((m) => String(m.tripId) === id)) report('trip', id, 'pool does not list this trip');
      else if (pool.vehicleType !== t.vehicleType) report('trip', id, `vehicle ${t.vehicleType} differs from its pool (${pool.vehicleType})`);
    }
    if (t.status === 'cancelled' && t.poolId) report('trip', id, 'cancelled but still points at a pool');
  }

  const seenMembers = new Map();
  for (const p of pools) {
    const id = String(p._id);
    if (!POOL_STATUSES.includes(p.status)) report('pool', id, `unknown status "${p.status}"`);
    const vehicle = vehicleByType(p.vehicleType);
    if (!vehicle) report('pool', id, `unknown vehicle "${p.vehicleType}"`);
    if (p.seatsTaken !== sum(p.members, 'partySize')) report('pool', id, 'seatsTaken does not match its members');
    if (p.bagsTaken !== sum(p.members, 'bags')) report('pool', id, 'bagsTaken does not match its members');
    if (p.seatsTaken > p.seats || p.bagsTaken > p.bags) report('pool', id, 'over capacity');
    if (p.status === 'open' && p.members.length === 0) report('pool', id, 'open but has no members');
    if (p.status === 'cancelled' && p.members.length > 0) report('pool', id, 'cancelled but still has members');

    for (const m of p.members) {
      const tripId = String(m.tripId);
      if (seenMembers.has(tripId)) report('pool', id, `trip ${tripId} is also in pool ${seenMembers.get(tripId)}`);
      seenMembers.set(tripId, id);
      const trip = tripById.get(tripId);
      if (!trip) report('pool', id, `member trip ${tripId} does not exist`);
      else {
        if (String(trip.poolId) !== id) report('pool', id, `member trip ${tripId} points at a different pool`);
        if (String(trip.userId) !== String(m.userId)) report('pool', id, `member trip ${tripId} has a different owner`);
        if (trip.passengerCount !== m.partySize) report('pool', id, `member trip ${tripId} group size changed`);
      }
    }
  }

  console.log(`Checked ${users.length} users, ${trips.length} trips, ${pools.length} pools.`);
  if (problems.length === 0) console.log('No problems found.');
  else {
    console.log(`${problems.length} problem(s):`);
    problems.forEach((p) => console.log(' - ' + p));
  }
  await mongoose.disconnect();
  process.exit(problems.length === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('Check failed:', err.message);
  await mongoose.disconnect();
  process.exit(2);
});
