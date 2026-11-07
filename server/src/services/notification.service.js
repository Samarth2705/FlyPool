// In-app notifications (and their push copies) - created by the server when
// something real happens, for the passengers it concerns:
//   system               welcome after registering
//   compatible_traveller a newly verified trip is compatible with yours
//   pool_joined          someone joined your shared ride
//   pool_left            someone left your shared ride (or cancelled)
//   booking_confirmed    your booking was saved
//   booking_cancelled    your booking was cancelled with its trip
//
// Rules:
// - Each event notifies each user at most once (unique userId + dedupeKey),
//   even if the code runs twice.
// - Texts describe other passengers only by drop-off area and group size -
//   never names, phone numbers or emails.
// - Creating notifications never fails the action that caused them: callers
//   use `quietly()`; problems are logged without personal details.
import { Notification } from '../models/Notification.js';
import { DeviceToken } from '../models/DeviceToken.js';
import { Pool } from '../models/Pool.js';
import { Trip } from '../models/Trip.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { MATCHING, vehicleByType } from '../config/pricing.js';
import { VERIFIED_STATUSES, describeTrip, isCompatible, isOpenToSharing } from './matching.service.js';
import { sendPush } from './push.service.js';

const MODE_LABELS = { shared: 'Shared ride', solo: 'Solo ride' };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const vehicleLabel = (type) => vehicleByType(type)?.label ?? type;
const whenText = (date) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(date);

// Run an event without ever failing the caller
export async function quietly(event, work) {
  try {
    await work();
  } catch (error) {
    console.warn(`[notifications] ${event} failed: ${error.message}`);
  }
}

// Save one notification per user (skipping ones that already exist), then push
async function deliver(entries) {
  if (entries.length === 0) return;
  const result = await Notification.bulkWrite(
    entries.map(({ userId, dedupeKey, ...fields }) => ({
      updateOne: {
        filter: { userId, dedupeKey },
        update: { $setOnInsert: { userId, dedupeKey, ...fields } },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  // Push only the new ones
  const created = Object.keys(result.upsertedIds ?? {}).map((i) => entries[Number(i)]);
  await Promise.all(
    created.map((n) =>
      sendPush(n.userId, {
        title: n.title,
        body: n.message,
        data: { type: n.type, tripId: n.tripId ? String(n.tripId) : null, poolId: n.poolId ? String(n.poolId) : null },
      }),
    ),
  );
}

// ---- events ---------------------------------------------------------------------

export function notifyWelcome(user) {
  return deliver([
    {
      userId: user._id,
      type: 'system',
      title: 'Welcome to FlyPool',
      message: 'Plan a trip from Mumbai Airport and we’ll look for verified travellers to share your cab with.',
      dedupeKey: 'welcome',
    },
  ]);
}

// A trip's flight was just verified: tell the owners of compatible trips
export async function notifyCompatibleTravellers(newTrip) {
  const me = describeTrip(newTrip);
  if (!me.fromAirport || !isOpenToSharing(me)) return;
  const windowMs = MATCHING.arrivalWindowMinutes * 60 * 1000;
  const candidates = await Trip.find({
    _id: { $ne: newTrip._id },
    userId: { $ne: newTrip.userId },
    status: { $in: VERIFIED_STATUSES },
    arrivalAt: { $gte: new Date(Math.max(me.arrivalAt - windowMs, Date.now())), $lte: new Date(me.arrivalAt + windowMs) },
    ...(env.isProduction ? { isDemo: { $ne: true } } : {}),
  }).limit(200);

  const area = me.area?.name;
  const entries = candidates
    .map(describeTrip)
    .filter((other) => isOpenToSharing(other) && isCompatible(other, me))
    .map((other) => ({
      userId: other.userId,
      type: 'compatible_traveller',
      title: 'New compatible traveller',
      message: `A verified traveller (${plural(me.partySize, 'person', 'people')}) landing within ${MATCHING.arrivalWindowMinutes} min of you is heading ${area ? `to ${area}` : 'your way'}.`,
      tripId: other.id,
      dedupeKey: `compatible:${other.id}:${me.id}`,
    }));
  await deliver(entries);
}

// Someone joined a shared ride: tell the other members
export async function notifyPoolJoined(poolId, joinerTripId) {
  const pool = await Pool.findById(poolId);
  if (!pool) return;
  const joiner = pool.members.find((m) => String(m.tripId) === String(joinerTripId));
  if (!joiner) return;
  const entries = pool.members
    .filter((m) => String(m.tripId) !== String(joinerTripId))
    .map((m) => ({
      userId: m.userId,
      type: 'pool_joined',
      title: 'A traveller joined your shared ride',
      message: `A booking heading to ${joiner.destinationArea ?? 'your area'} (${plural(joiner.partySize, 'person', 'people')}) joined your shared ${vehicleLabel(pool.vehicleType)}. The fare estimate has been updated.`,
      tripId: m.tripId,
      poolId: pool._id,
      dedupeKey: `pool_joined:${pool._id}:${joinerTripId}:${new Date(joiner.joinedAt).getTime()}`,
    }));
  await deliver(entries);
}

// Someone left a shared ride (changed ride or cancelled): tell who remains
export async function notifyPoolLeft(poolId, leaver, at = new Date()) {
  const pool = await Pool.findById(poolId);
  if (!pool || pool.members.length === 0) return;
  const entries = pool.members.map((m) => ({
    userId: m.userId,
    type: 'pool_left',
    title: 'A traveller left your shared ride',
    message: `A booking heading to ${leaver.area ?? 'another area'} (${plural(leaver.partySize, 'person', 'people')}) left your shared ${vehicleLabel(pool.vehicleType)}. The fare estimate has been updated.`,
    tripId: m.tripId,
    poolId: pool._id,
    dedupeKey: `pool_left:${pool._id}:${leaver.tripId}:${at.getTime()}`,
  }));
  await deliver(entries);
}

export function notifyBookingConfirmed(trip, booking) {
  return deliver([
    {
      userId: trip.userId,
      type: 'booking_confirmed',
      title: 'Booking confirmed',
      message: `Booking ${booking.reference}: ${MODE_LABELS[booking.mode]} in a ${vehicleLabel(booking.vehicleType)} to ${trip.destination}, landing ${whenText(trip.arrivalAt)}.`,
      tripId: trip._id,
      poolId: booking.poolId ?? null,
      bookingReference: booking.reference,
      dedupeKey: `booking_confirmed:${booking.reference}`,
    },
  ]);
}

// The passenger left their booked shared ride (the trip goes on)
export function notifyLeftSharedRide(trip, reference) {
  return deliver([
    {
      userId: trip.userId,
      type: 'booking_updated',
      title: 'You left your shared ride',
      message: `Booking ${reference} for your trip to ${trip.destination} has ended. Choose a new ride for this trip when you’re ready.`,
      tripId: trip._id,
      bookingReference: reference,
      dedupeKey: `left_pool:${reference}`,
    },
  ]);
}

export function notifyBookingCancelled(trip) {
  const booking = trip.booking;
  return deliver([
    {
      userId: trip.userId,
      type: 'booking_cancelled',
      title: 'Booking cancelled',
      message: `Booking ${booking.reference} was cancelled together with your trip to ${trip.destination}.`,
      tripId: trip._id,
      bookingReference: booking.reference,
      dedupeKey: `booking_cancelled:${booking.reference}`,
    },
  ]);
}

// ---- reading and marking -----------------------------------------------------------

// Newest first, 30 at a time; `before` (ISO date) pages back
export async function listNotifications(userId, { before, limit = 30 } = {}) {
  const filter = { userId, ...(before ? { createdAt: { $lt: new Date(before) } } : {}) };
  const [items, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  const page = items.slice(0, limit);
  return {
    notifications: page,
    unreadCount,
    nextBefore: items.length > limit ? page.at(-1).createdAt.toISOString() : null,
  };
}

export async function markRead(userId, notificationId) {
  const updated =
    (await Notification.findOneAndUpdate({ _id: notificationId, userId, readAt: null }, { $set: { readAt: new Date() } }, { new: true })) ??
    (await Notification.findOne({ _id: notificationId, userId }));
  // Someone else's notification gets the same answer as a missing one
  if (!updated) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
  return updated;
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
  return { updated: result.modifiedCount };
}

// ---- device push tokens -------------------------------------------------------------

// One record per token: the same phone registering again (or after another
// person logs in on it) updates the record instead of adding one
export async function registerDeviceToken(userId, { token, platform }) {
  const update = { $set: { userId, platform, lastSeenAt: new Date() } };
  try {
    await DeviceToken.updateOne({ token }, update, { upsert: true });
  } catch (error) {
    if (error.code !== 11000) throw error;
    await DeviceToken.updateOne({ token }, update); // two registrations raced: update the winner
  }
  return { registered: true };
}

// Only the owner can remove their phone's token (logout)
export async function removeDeviceToken(userId, token) {
  const result = await DeviceToken.deleteOne({ token, userId });
  return { removed: result.deletedCount };
}
