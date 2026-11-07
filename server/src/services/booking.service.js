// Booking confirmation: POST /api/trips/:tripId/booking
//
// Confirming saves a booking record on the trip (models/Trip.js -> booking)
// with a reference made here. It means FlyPool has recorded the booking - no
// payment is taken and no driver is assigned (neither exists yet).
//
// Checked before saving:
//   - the trip is the passenger's own, not cancelled, its flight verified,
//     a ride chosen, and it hasn't already landed
//   - a shared ride still exists, is open, and has at least one other booking
//     (a shared ride nobody has joined can't be booked: travel alone or wait)
//   - optionally, what the passenger reviewed still matches (mode, vehicle,
//     shared ride, their share of the fare) - otherwise 409, review again
//
// Duplicates and races:
//   - confirming an already confirmed trip returns the same booking (200),
//     so a double tap or a retry after a lost response is harmless
//   - the booking is written with ONE conditional update that only matches
//     while the trip still has exactly the ride that was checked and no
//     confirmed booking - two requests at once, or a ride change in between,
//     can never produce two bookings or a booking for a different ride
//   - after confirming, the ride can't be changed (ride.service.js)
import crypto from 'node:crypto';
import { Trip } from '../models/Trip.js';
import { MATCHING } from '../config/pricing.js';
import { AppError } from '../utils/AppError.js';
import * as rideService from './ride.service.js';
import { notifyBookingConfirmed, quietly } from './notification.service.js';

// "FP-" + 8 characters without look-alikes (no 0/O, 1/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newReference() {
  return `FP-${Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('')}`;
}

const isExpired = (trip) =>
  new Date(trip.arrivalAt).getTime() < Date.now() - MATCHING.stillMatchingAfterArrivalMinutes * 60 * 1000;

// The passenger's part of the current estimate (what the summary shows)
function yourShareOf(ride) {
  if (ride.mode === 'solo') return ride.soloFare?.total ?? null;
  return ride.pool?.fare?.yourShare ?? null;
}

function reviewChanged(ride, expected) {
  if (expected.mode !== undefined && expected.mode !== ride.mode) return true;
  if (expected.vehicleType !== undefined && expected.vehicleType !== ride.vehicleType) return true;
  if (expected.poolId !== undefined && (expected.poolId ?? null) !== (ride.pool?.id ?? null)) return true;
  if (expected.yourShare !== undefined && (expected.yourShare ?? null) !== yourShareOf(ride)) return true;
  return false;
}

// Returns { trip, ride, booking, created }
export async function confirmBooking(tripId, userId, expected = {}) {
  const { trip, ride } = await rideService.getRide(tripId, userId); // 404 if not theirs

  if (trip.booking?.status === 'confirmed') return { trip, ride, booking: trip.booking, created: false };
  if (trip.status === 'cancelled') {
    throw new AppError(409, 'TRIP_CANCELLED', 'This trip was cancelled. Plan a new trip to continue.');
  }
  if (trip.status === 'awaiting_verification') {
    throw new AppError(409, 'FLIGHT_NOT_VERIFIED', 'Verify your flight before confirming a booking.');
  }
  if (trip.status !== 'ride_selected' || !ride) {
    throw new AppError(409, 'RIDE_NOT_SELECTED', 'Choose your ride before confirming the booking.');
  }
  if (isExpired(trip)) {
    throw new AppError(409, 'TRIP_EXPIRED', 'This flight has already landed, so it can no longer be booked.');
  }
  if (ride.mode === 'shared') {
    if (!ride.pool || ride.pool.status !== 'open') {
      throw new AppError(409, 'POOL_UNAVAILABLE', 'Your shared ride is no longer available. Please choose your ride again.');
    }
    if (ride.pool.others.length === 0) {
      throw new AppError(
        409,
        'POOL_NO_TRAVELLERS',
        'Nobody has joined your shared ride yet. Wait for a compatible traveller to join, or choose to travel alone.',
      );
    }
  }
  if (reviewChanged(ride, expected)) {
    throw new AppError(
      409,
      'BOOKING_REVIEW_CHANGED',
      'Your ride or its fare changed since you reviewed it. Please check the updated summary and confirm again.',
    );
  }

  const fare = ride.mode === 'solo' ? ride.soloFare : ride.pool.fare;
  const booking = {
    reference: newReference(),
    status: 'confirmed',
    confirmedAt: new Date(),
    mode: ride.mode,
    vehicleType: ride.vehicleType,
    vehicle: ride.vehicle,
    poolId: ride.pool?.id ?? null,
    partySize: trip.passengerCount,
    travellers: ride.mode === 'shared' ? ride.pool.others : [],
    fare: fare ?? null,
  };

  // Only while the trip still has exactly this ride and no confirmed booking
  const updated = await Trip.findOneAndUpdate(
    {
      _id: trip._id,
      userId,
      status: 'ride_selected',
      rideMode: ride.mode,
      vehicleType: ride.vehicleType,
      poolId: trip.poolId ?? null,
      'booking.status': { $ne: 'confirmed' },
    },
    { $set: { booking } },
    { new: true },
  );

  if (!updated) {
    // Another request confirmed it first: that booking is the answer
    const current = await Trip.findOne({ _id: trip._id, userId });
    if (current?.booking?.status === 'confirmed') {
      const fresh = await rideService.getRide(tripId, userId);
      return { ...fresh, booking: current.booking, created: false };
    }
    throw new AppError(409, 'BOOKING_CONFLICT', 'Your ride changed while confirming. Please review the summary and try again.');
  }

  await quietly('booking_confirmed', () => notifyBookingConfirmed(updated, updated.booking));
  const fresh = await rideService.getRide(tripId, userId);
  return { ...fresh, booking: updated.booking, created: true };
}

// ---- managing a booking (Ride Management) ----------------------------------------
//
// FlyPool has no ride dispatch yet (no driver, "scheduled" or "started"
// states), so the status and timeline below only use what really happens:
// trip planned, flight verified, ride chosen, booking confirmed, left a
// shared ride, cancelled - each with the time it was saved - plus whether
// the arrival time has passed.

const STATUS_LABELS = {
  confirmed: 'Booking confirmed',
  arrived: 'Arrival time passed',
  cancelled: 'Cancelled',
  not_booked: 'Not booked',
};

const hasLanded = (trip) => new Date(trip.arrivalAt).getTime() < Date.now();

function statusOf(trip) {
  if (trip.status === 'cancelled') return 'cancelled';
  if (trip.booking?.status === 'confirmed') return hasLanded(trip) ? 'arrived' : 'confirmed';
  return 'not_booked';
}

function timelineOf(trip) {
  const events = [{ key: 'planned', label: 'Trip planned', at: trip.createdAt }];
  if (trip.verification?.status === 'verified') events.push({ key: 'verified', label: 'Flight verified', at: trip.verification.checkedAt });
  for (const past of trip.pastBookings ?? []) {
    events.push({ key: 'booked', label: `Booking ${past.reference} confirmed`, at: past.confirmedAt });
    events.push({ key: 'left_pool', label: `Left the shared ride (booking ${past.reference} ended)`, at: past.endedAt });
  }
  if (trip.rideSelectedAt) events.push({ key: 'ride', label: 'Ride chosen', at: trip.rideSelectedAt });
  if (trip.booking) events.push({ key: 'booked', label: `Booking ${trip.booking.reference} confirmed`, at: trip.booking.confirmedAt });
  if (trip.status === 'cancelled') {
    events.push({
      key: 'cancelled',
      label: trip.booking ? `Booking ${trip.booking.reference} cancelled` : 'Trip cancelled',
      at: trip.cancelledAt,
    });
  }
  return events.filter((e) => e.at).sort((a, b) => new Date(a.at) - new Date(b.at));
}

const allowed = (ok, reason = null) => ({ allowed: ok, reason });

// What the passenger may do now (the server checks again when they do it)
function actionsFor(trip, ride) {
  const booking = trip.booking;
  const both = (why) => ({ cancel: allowed(false, why), leavePool: allowed(false, why) });
  if (trip.status === 'cancelled') return both(booking ? 'This booking is already cancelled.' : 'This trip was cancelled.');
  if (!booking || booking.status !== 'confirmed') return both('This trip has no confirmed booking.');
  if (hasLanded(trip)) return both('The arrival time has passed, so this booking can no longer be changed or cancelled.');
  const poolStatus = ride?.pool?.status;
  if (booking.mode === 'shared' && poolStatus && poolStatus !== 'open') {
    return both(
      poolStatus === 'completed' ? 'This ride has already been completed.' : 'Your shared ride is already confirmed, so it can’t be changed here.',
    );
  }
  return {
    cancel: allowed(true),
    leavePool: booking.mode === 'shared' && trip.poolId ? allowed(true) : allowed(false, 'Solo rides have no shared ride to leave.'),
  };
}

// GET /api/trips/:tripId/booking -> everything the Ride Management screen shows
export async function getBookingManagement(tripId, userId) {
  const { trip, ride } = await rideService.getRide(tripId, userId); // 404 if not theirs
  const code = statusOf(trip);
  return {
    trip,
    ride,
    booking: trip.booking,
    pastBookings: trip.pastBookings ?? [],
    status: { code, label: STATUS_LABELS[code] },
    timeline: timelineOf(trip),
    actions: actionsFor(trip, ride),
  };
}

// POST /api/trips/:tripId/booking/cancel { reason? }
// Cancels the booking AND its trip with the existing cancellation (one
// transaction: leaves the shared ride, keeps every record). Refused when
// there is no booking, it is already cancelled, or the arrival time passed.
export async function cancelBooking(tripId, userId, { reason } = {}) {
  const { trip } = await rideService.getRide(tripId, userId); // 404 if not theirs
  if (trip.booking && (trip.booking.status === 'cancelled' || trip.status === 'cancelled')) {
    throw new AppError(409, 'BOOKING_ALREADY_CANCELLED', 'This booking is already cancelled.');
  }
  if (!trip.booking || trip.booking.status !== 'confirmed') {
    throw new AppError(409, 'NO_ACTIVE_BOOKING', 'This trip has no confirmed booking to cancel.');
  }
  try {
    await rideService.cancelTrip(tripId, userId, { reason: reason || undefined });
  } catch (error) {
    // Two cancellations at the same moment: the other one won
    if (error.code === 'TRIP_CANCELLED') throw new AppError(409, 'BOOKING_ALREADY_CANCELLED', 'This booking is already cancelled.');
    throw error;
  }
  return getBookingManagement(tripId, userId);
}

// POST /api/trips/:tripId/booking/leave-pool - see rideService.leaveSharedRide
export async function leaveSharedRide(tripId, userId) {
  await rideService.leaveSharedRide(tripId, userId);
  return getBookingManagement(tripId, userId);
}
