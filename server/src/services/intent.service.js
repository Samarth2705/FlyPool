// Live "also booking" counts (models/RideIntent.js).
//
// A passenger counts for another passenger only while ALL of these hold:
//   - their intent hasn't expired (the app is still checking, about every 4 s)
//   - it's a different account and a different trip
//   - their trip is still choosing a ride: flight verified, not cancelled,
//     not booked yet (booking or cancelling removes the intent)
//   - they are compatible by the SAME rules as the compatible-travellers list
//     (matching.service.js): same airport + terminal, arrival window / flight,
//     destinations on the way - typed ("Others") destinations only match the
//     same place - and open to sharing (not travelling alone)
// Only a NUMBER is returned: never who, never anything about them.
import { RideIntent } from '../models/RideIntent.js';
import { Trip } from '../models/Trip.js';
import { describeTrip, findCompatibleTrips, VERIFIED_STATUSES } from './matching.service.js';
import { MATCHING } from '../config/pricing.js';

// An intent lives this long after the app's last check (checks come about
// every 4 s, so a few missed checks - a slow network - don't drop it)
export const INTENT_TTL_MS = 30_000;

// The passenger is on a ride screen now: create or renew their trip's intent
// (one per trip - the unique index turns a race into a renewal)
export async function renewIntent(trip, me) {
  const now = new Date();
  const update = {
    $set: {
      userId: trip.userId,
      pickupKey: me.pickupKey,
      arrivalAt: trip.arrivalAt,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + INTENT_TTL_MS),
    },
  };
  try {
    await RideIntent.updateOne({ tripId: trip._id }, update, { upsert: true });
  } catch (err) {
    if (err.code !== 11000) throw err;
    await RideIntent.updateOne({ tripId: trip._id }, update); // two first checks at once: the other created it
  }
}

// Left the screen, booked, cancelled: stop counting at once
export async function endIntent(tripId) {
  await RideIntent.deleteOne({ tripId });
}

// How many OTHER compatible passengers are choosing a ride right now
export async function countOthersConsidering(me) {
  if (!me.fromAirport) return 0;
  const windowMs = MATCHING.arrivalWindowMinutes * 60 * 1000;
  const intents = await RideIntent.find({
    pickupKey: me.pickupKey,
    expiresAt: { $gt: new Date() },
    tripId: { $ne: me.id },
    userId: { $ne: me.userId },
    arrivalAt: { $gte: new Date(me.arrivalAt - windowMs), $lte: new Date(me.arrivalAt + windowMs) },
  })
    .select('tripId')
    .limit(200);
  if (intents.length === 0) return 0;

  const trips = await Trip.find({
    _id: { $in: intents.map((i) => i.tripId) },
    status: { $in: VERIFIED_STATUSES },
    'booking.status': { $ne: 'confirmed' },
  });
  return findCompatibleTrips(me, trips.map(describeTrip)).length;
}
