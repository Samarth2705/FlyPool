// Trip API calls. Server side: server/src/routes/trip.routes.js
// The bearer token is added by the API client. Nothing here is retried
// automatically (see client.js) - a failed write is reported to the screen.
import api, { TIMEOUTS, unwrap } from './client';

// Save the trip details. Returns the saved trip (with its id).
// details: { pickupLocation, pickupTerminal, destination, travelDate,
//            expectedArrivalTime, passengerCount, luggageCount, openToPooling }
// clientRequestId: a random UUID for this exact form - sending it again
// returns the same trip instead of creating a duplicate (201 new, 200 repeat).
export async function createTrip(details, clientRequestId) {
  return unwrap(await api.post('/trips', { ...details, clientRequestId })).trip;
}

// The logged-in passenger's own trips, newest arrival first (max 100).
// when: 'upcoming' (lands now or later), 'past' (already landed) or 'all'.
export async function listTrips(when = 'all') {
  return unwrap(await api.get('/trips', { params: { when } })).trips;
}

// One of the logged-in passenger's trips
export async function getTrip(tripId) {
  return unwrap(await api.get(`/trips/${tripId}`)).trip;
}

// Compatible travellers for a verified trip (read only - nothing is changed).
// Returns { trip, travellers, reason, arrivalWindowMinutes, ... }. Each
// traveller: { ref, area, partySize, flightNumber, sameFlight, minutesApart,
// isDemo, ... } - never a name, contact details or exact address. The server
// decides who is compatible and sends them best first.
// Errors: 409 FLIGHT_NOT_VERIFIED / TRIP_CANCELLED, 404 TRIP_NOT_FOUND
export async function getMatches(tripId) {
  return unwrap(await api.get(`/trips/${tripId}/matches`));
}

// Change some trip details (only before the flight is verified), e.g.
// { destination: 'Powai' }. The server checks the whole trip again.
export async function updateTrip(tripId, changes) {
  return unwrap(await api.patch(`/trips/${tripId}`, changes)).trip;
}

// Flight verification. Returns the updated trip.
// details: { airline, flightNumber, scheduledArrivalTime,
//            document: { mimeType, dataBase64 } }   (document max 3 MB)
// onUploadProgress(fraction 0..1) reports the upload, where supported.
// Errors: 422 VERIFICATION_FAILED (details = the failed checks),
//         400 INVALID_DOCUMENT / VALIDATION_ERROR, 409 ALREADY_VERIFIED,
//         503 VERIFICATION_UNAVAILABLE / VERIFICATION_SERVICE_ERROR
export async function verifyFlight(tripId, details, { onUploadProgress } = {}) {
  const response = await api.post(`/trips/${tripId}/verification`, details, {
    timeout: TIMEOUTS.upload,
    onUploadProgress: onUploadProgress && ((event) => event.total && onUploadProgress(event.loaded / event.total)),
  });
  return unwrap(response).trip;
}

// The saved ride choice of a trip: { trip, ride } (ride is null until chosen).
// ride: { mode: 'shared'|'solo', vehicleType, vehicle, pool, soloFare, status }
export async function getRide(tripId) {
  return unwrap(await api.get(`/trips/${tripId}/ride`));
}

// Choose (or change) the ride - PUT /trips/:tripId/ride. The server runs it
// in a transaction and decides everything (seats, bags, compatibility, the
// fare estimate). Sending the same choice again is safe: it keeps the ride
// already saved instead of creating a second one.
//   { mode: 'solo', vehicleType }                travel alone
//   { mode: 'shared', vehicleType, poolId }      join that shared ride
//   { mode: 'shared', vehicleType }              start a shared ride others can join
// Errors (409): POOL_FULL, POOL_UNAVAILABLE, POOL_INCOMPATIBLE, POOL_CHANGED,
// POOL_NOT_FOUND (404), VEHICLE_TOO_SMALL, VEHICLE_MISMATCH, POOL_CONFIRMED,
// SHARING_UNAVAILABLE, FLIGHT_NOT_VERIFIED, TRIP_EXPIRED, TRIP_CANCELLED
// Returns { trip, ride } as saved.
export async function chooseRide(tripId, choice) {
  return unwrap(await api.put(`/trips/${tripId}/ride`, choice));
}

// Confirm the booking of the chosen ride - POST /trips/:tripId/booking.
// `reviewed` is what the passenger saw on the Booking Summary
// ({ mode, vehicleType, poolId, yourShare }); if the saved ride no longer
// matches, the server answers 409 BOOKING_REVIEW_CHANGED instead of booking.
// Returns { booking, trip, ride, created }: created=false means it was
// already confirmed (repeating the request is safe - same booking).
// booking: { reference, status, confirmedAt, mode, vehicleType, vehicle,
//            poolId, partySize, travellers, fare }
// Errors (409): FLIGHT_NOT_VERIFIED, RIDE_NOT_SELECTED, POOL_UNAVAILABLE,
// POOL_NO_TRAVELLERS, BOOKING_REVIEW_CHANGED, BOOKING_CONFLICT,
// TRIP_EXPIRED, TRIP_CANCELLED; 404 TRIP_NOT_FOUND
export async function confirmBooking(tripId, reviewed) {
  const response = await api.post(`/trips/${tripId}/booking`, reviewed);
  return unwrap(response);
}

// Ride Management (GET /trips/:tripId/booking):
// { trip, ride, booking, pastBookings, status: { code, label },
//   timeline: [{ key, label, at }], actions: { cancel, leavePool } }
// status.code: confirmed | arrived | cancelled | not_booked
// actions.*: { allowed, reason } - what the server allows right now
export async function getBookingManagement(tripId) {
  return unwrap(await api.get(`/trips/${tripId}/booking`));
}

// Cancel the booking AND its trip (kept as history). reason: optional text.
// Errors (409): BOOKING_ALREADY_CANCELLED, NO_ACTIVE_BOOKING, TRIP_IN_PAST,
// RIDE_COMPLETED, POOL_CONFIRMED; 404 TRIP_NOT_FOUND. Returns the new view.
export async function cancelBooking(tripId, { reason } = {}) {
  return unwrap(await api.post(`/trips/${tripId}/booking/cancel`, reason ? { reason } : {}));
}

// Leave the booked shared ride: the booking ends (kept in pastBookings), the
// trip goes on - back to choosing a ride. Errors (409): NOT_IN_POOL,
// NO_ACTIVE_BOOKING, TRIP_IN_PAST, RIDE_COMPLETED, POOL_CONFIRMED.
export async function leaveSharedRide(tripId) {
  return unwrap(await api.post(`/trips/${tripId}/booking/leave-pool`, {}));
}

// Payment for the booking (GET /trips/:tripId/payment): { mode, demo, trip,
// booking, amount, fare: { total, people, partySize, share, perPerson, breakdown },
// blocker: { code, message } | null, payment (latest for this booking) | null,
// canPay, pool: { total, collected, outstanding, overCollected, allPaid,
// members: [{ label, isYou, area, partySize, booked, share, paid }] } | null,
// history: [payment] }. The amount is worked out by the server.
export async function getPaymentView(tripId) {
  return unwrap(await api.get(`/trips/${tripId}/payment`));
}

// Start (or continue) paying: { payment, created }. Sends no amount.
// Errors (409): ALREADY_PAID, WAITING_FOR_BOOKINGS, NO_ACTIVE_BOOKING,
// FARE_UNAVAILABLE, POOL_UNAVAILABLE; 503 PAYMENTS_UNAVAILABLE.
export async function startPayment(tripId) {
  return unwrap(await api.post(`/trips/${tripId}/payment`, {}));
}

// Live ride activity, polled while the ride screens are open (useLiveRide):
//   { activity: { othersConsidering }, pools, myPool, booked, pollAfterMs, serverTime }
// Each check also tells the server this passenger is still choosing a ride.
export async function getLiveRide(tripId) {
  return unwrap(await api.get(`/trips/${tripId}/live`));
}

// The passenger left the ride screens: stop counting them at once (best effort -
// if this fails, the server stops counting them by itself after ~30 s)
export async function leaveLiveRide(tripId) {
  return unwrap(await api.delete(`/trips/${tripId}/live`, { timeout: 5000 }));
}
