// Trip / booking states as My Trips shows them - from the server's fields only.
import { describe, expect, test } from 'vitest';
import { paymentText, reviewedRide, tripState, yourShareOf } from './bookings';
import { makeBooking, makePool, makeRide, makeTrip } from '../test/fixtures';

const NOW = Date.parse('2026-11-14T10:00:00Z'); // before the trip lands (2027-02-10)
const LATER = Date.parse('2027-03-01T00:00:00Z'); // after it landed
const ride = makeRide();

describe('tripState', () => {
  const cases = [
    ['planned', makeTrip({ status: 'awaiting_verification', verification: { status: 'not_started' }, flight: undefined }), 'Trip planned', 'verify'],
    ['verification_pending', makeTrip({ status: 'awaiting_verification', verification: { status: 'failed' } }), 'Flight verification pending', 'verify'],
    ['flight_verified', makeTrip({ status: 'flight_verified' }), 'Flight verified', 'matches'],
    ['left_pool', makeTrip({ status: 'flight_verified', pastBookings: [makeBooking(ride, { status: 'left_pool' })] }), 'Left shared ride · choose a ride', 'matches'],
    ['ride_selected', makeTrip({ status: 'ride_selected' }), 'Ride selected · not booked yet', 'summary'],
    ['booking_confirmed', makeTrip({ status: 'ride_selected', booking: makeBooking(ride) }), 'Booking confirmed', 'summary'],
    ['booking_cancelled', makeTrip({ status: 'cancelled', booking: makeBooking(ride, { status: 'cancelled' }) }), 'Booking cancelled', 'summary'],
    ['trip_cancelled', makeTrip({ status: 'cancelled' }), 'Trip cancelled', null],
  ];
  test.each(cases)('%s', (key, trip, label, nextPath) => {
    const state = tripState(trip, NOW);
    expect(state.key).toBe(key);
    expect(state.label).toBe(label);
    expect(state.next?.path ?? null).toBe(nextPath);
  });

  test('a chosen ride is NOT a booking', () => {
    const state = tripState(makeTrip({ status: 'ride_selected', booking: null }), NOW);
    expect(state.key).not.toBe('booking_confirmed');
    expect(state.inProgress).toBe(true);
    expect(state.cancel).toBe('trip');
  });

  test('booked trips are cancelled as bookings; nothing can be cancelled after landing', () => {
    expect(tripState(makeTrip({ booking: makeBooking(ride) }), NOW).cancel).toBe('booking');
    const landed = tripState(makeTrip({ booking: makeBooking(ride) }), LATER);
    expect(landed.key).toBe('arrived');
    expect(landed.label).toBe('Arrival time passed'); // no "completed" state exists on the server
    expect(landed.cancel).toBeNull();
    expect(tripState(makeTrip({ status: 'flight_verified' }), LATER).cancel).toBeNull();
  });
});

describe('what is sent with Confirm booking', () => {
  test('shared: the pool and the passenger’s share as shown', () => {
    expect(reviewedRide(makeRide({ pool: makePool({ id: 'p9' }) }))).toEqual({ mode: 'shared', vehicleType: 'sedan', poolId: 'p9', yourShare: 300 });
  });
  test('solo: no pool, the whole-cab estimate', () => {
    const solo = makeRide({ mode: 'solo' });
    expect(reviewedRide(solo)).toEqual({ mode: 'solo', vehicleType: 'sedan', poolId: null, yourShare: 600 });
    expect(yourShareOf(null)).toBeNull();
  });
});

describe('payment line', () => {
  test('only what the server recorded - never a refund it did not report', () => {
    expect(paymentText(null)).toBeNull();
    expect(paymentText({ demo: true, payment: null })).toBe('No payment taken (demo mode)');
    expect(paymentText({ demo: false, payment: { status: 'paid', amount: 300 } })).toBe('Paid · ₹300');
    expect(paymentText({ demo: true, payment: { status: 'cancelled', amount: 300 } })).toBe('Payment cancelled · ₹300 (demo mode)');
    expect(paymentText({ demo: true, payment: { status: 'cancelled' } })).not.toMatch(/refund/i);
  });
});
