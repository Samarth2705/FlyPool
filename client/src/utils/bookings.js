// What state a trip and its booking are in - from the server's own fields only
// (trip.status, trip.verification, trip.booking, trip.pastBookings, arrivalAt).
// A chosen ride ("ride_selected") is NOT a booking: only booking.status
// "confirmed" means booked. FlyPool has no "completed" state yet: after the
// arrival time a confirmed booking shows "Arrival time passed" (as the server's
// booking status does).
import { formatRupees } from './format';

const lastPastBooking = (trip) => (trip.pastBookings ?? []).at(-1) ?? null;

export const isBooked = (trip) => trip?.booking?.status === 'confirmed';

// { key, label, tone, next: { path, label } | null, inProgress, cancel: 'booking' | 'trip' | null }
export function tripState(trip, now = Date.now()) {
  const landed = new Date(trip.arrivalAt).getTime() < now;
  const base = { next: null, inProgress: false, cancel: null };

  if (trip.status === 'cancelled') {
    return trip.booking
      ? { ...base, key: 'booking_cancelled', label: 'Booking cancelled', tone: 'neutral', next: { path: 'summary', label: 'View details' } }
      : { ...base, key: 'trip_cancelled', label: 'Trip cancelled', tone: 'neutral' };
  }
  if (isBooked(trip)) {
    return landed
      ? { ...base, key: 'arrived', label: 'Arrival time passed', tone: 'neutral', next: { path: 'summary', label: 'View booking' } }
      : { ...base, key: 'booking_confirmed', label: 'Booking confirmed', tone: 'success', next: { path: 'summary', label: 'View booking' }, cancel: 'booking' };
  }
  const cancel = landed ? null : 'trip';
  if (trip.status === 'ride_selected') {
    return { ...base, key: 'ride_selected', label: 'Ride selected · not booked yet', tone: 'warning', next: { path: 'summary', label: 'Review & book' }, inProgress: true, cancel };
  }
  if (trip.status === 'flight_verified') {
    const left = lastPastBooking(trip)?.status === 'left_pool';
    return {
      ...base,
      key: left ? 'left_pool' : 'flight_verified',
      label: left ? 'Left shared ride · choose a ride' : 'Flight verified',
      tone: 'brand',
      next: { path: 'matches', label: 'Choose ride' },
      inProgress: true,
      cancel,
    };
  }
  // awaiting_verification
  const tried = trip.verification?.status === 'failed';
  return {
    ...base,
    key: tried ? 'verification_pending' : 'planned',
    label: tried ? 'Flight verification pending' : 'Trip planned',
    tone: 'warning',
    next: { path: 'verify', label: 'Verify flight' },
    inProgress: true,
    cancel,
  };
}

// The passenger's part of the ride's current estimate - what the review shows
// and what the server compares when confirming (booking.service.js yourShareOf)
export function yourShareOf(ride) {
  if (!ride) return null;
  if (ride.mode === 'solo') return ride.soloFare?.total ?? null;
  return ride.pool?.fare?.yourShare ?? null;
}

// What the passenger reviewed, sent with "Confirm booking"
export function reviewedRide(ride) {
  return { mode: ride.mode, vehicleType: ride.vehicleType, poolId: ride.pool?.id ?? null, yourShare: yourShareOf(ride) };
}

const PAYMENT_LABELS = {
  pending: 'Payment started, not completed',
  processing: 'Payment processing',
  paid: 'Paid',
  failed: 'Payment failed',
  cancelled: 'Payment cancelled',
};

// The payment line, from GET /payment - never claims a payment or refund the server didn't record
export function paymentText(view) {
  if (!view) return null;
  const demo = view.demo ? ' (demo mode)' : '';
  const p = view.payment;
  if (!p) return `No payment taken${demo}`;
  const amount = typeof p.amount === 'number' ? ` · ${formatRupees(p.amount)}` : '';
  return `${PAYMENT_LABELS[p.status] ?? p.status}${amount}${demo}`;
}
