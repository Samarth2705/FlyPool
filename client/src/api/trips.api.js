// Trip API calls. Server side: server/src/routes/trip.routes.js
import api from './client';

// Save the trip details from Page 2. Returns the saved trip (with its id).
// clientRequestId: a random id made once per form - sending it again returns
// the same trip instead of creating a duplicate.
export async function createTrip(details, clientRequestId) {
  const res = await api.post('/trips', { ...details, clientRequestId });
  return res.data.data.trip;
}

// Edit trip details (only before the flight is verified). Returns the trip.
export async function updateTrip(tripId, details) {
  const res = await api.patch(`/trips/${tripId}`, details);
  return res.data.data.trip;
}

// Cancel a trip. Returns the trip.
export async function cancelTrip(tripId) {
  const res = await api.patch(`/trips/${tripId}`, { status: 'cancelled' });
  return res.data.data.trip;
}

// The trip to resume after login: { trip, nextStep } (both null if none)
export async function getCurrentTrip() {
  const res = await api.get('/trips/current');
  return res.data.data;
}

// The logged-in passenger's trips, newest first
export async function listMyTrips() {
  const res = await api.get('/trips');
  return res.data.data.trips;
}

export async function getTrip(tripId) {
  const res = await api.get(`/trips/${tripId}`);
  return res.data.data.trip;
}

// Page 3: flight details + boarding pass / e-ticket ({ mimeType, dataBase64 }).
// Returns the updated trip.
// onUploadProgress (optional): called with a number from 0 to 1 while the
// request is being sent, so the page can show upload progress.
export async function verifyFlight(tripId, details, { onUploadProgress } = {}) {
  const res = await api.post(`/trips/${tripId}/verification`, details, {
    onUploadProgress: onUploadProgress && ((event) => event.total && onUploadProgress(event.loaded / event.total)),
  });
  return res.data.data.trip;
}

// Page 4: { trip, ride, travellers, vehicles: [{ type, soloFare, pools, ... }],
// reason, arrivalWindowMinutes, fareAssumptions }
export async function getMatches(tripId) {
  const res = await api.get(`/trips/${tripId}/matches`);
  return res.data.data;
}

// The saved ride choice of a trip (Page 5): { trip, ride }
export async function getRide(tripId) {
  const res = await api.get(`/trips/${tripId}/ride`);
  return res.data.data;
}

// Page 4 -> 5. choice: { mode: 'shared' | 'solo', vehicleType: 'sedan' | 'suv',
// poolId? } - poolId joins that shared ride; shared without poolId starts one.
// Returns { trip, ride }.
export async function chooseRide(tripId, choice) {
  const res = await api.put(`/trips/${tripId}/ride`, choice);
  return res.data.data;
}

// ---- live ride activity (polled while a ride screen is open) ----------------

// { serverTime, pollAfterMs, activity: { othersConsidering }, pools, myPool, booked }
// All counts and seats come from the database. Only READS (and renews this
// passenger's "choosing a ride" status) - safe to repeat.
export async function getLiveRide(tripId, { signal } = {}) {
  const res = await api.get(`/trips/${tripId}/live`, { signal });
  return res.data.data;
}

// The passenger left the ride screens: stop counting them at once (the
// server also forgets them by itself after 30 s).
export async function leaveLiveRide(tripId) {
  await api.delete(`/trips/${tripId}/live`);
}

// ---- booking -----------------------------------------------------------------

// The booking and what can be done with it:
// { trip, ride, booking, pastBookings, status: { code, label }, timeline,
//   actions: { cancel: { allowed, reason }, leavePool: { allowed, reason } } }
export async function getBooking(tripId) {
  const res = await api.get(`/trips/${tripId}/booking`);
  return res.data.data;
}

// Confirm the chosen ride. `reviewed` is what the passenger saw: { mode,
// vehicleType, poolId, yourShare } - if the ride changed since, the server
// refuses (409 BOOKING_REVIEW_CHANGED) instead of booking something else.
// Safe to repeat: an already confirmed booking is returned (created: false),
// never a second one. Returns { booking, trip, ride, created }.
export async function confirmBooking(tripId, reviewed) {
  const res = await api.post(`/trips/${tripId}/booking`, reviewed, { timeout: 20000 });
  return res.data.data;
}

// Cancel the booking - and its trip. Returns the updated booking view (as getBooking).
export async function cancelBooking(tripId, reason) {
  const res = await api.post(`/trips/${tripId}/booking/cancel`, reason ? { reason } : {});
  return res.data.data;
}

// Leave the shared ride: the booking ends, the trip goes on (choose a ride
// again). Returns the updated booking view (as getBooking).
export async function leaveSharedRide(tripId) {
  const res = await api.post(`/trips/${tripId}/booking/leave-pool`, {});
  return res.data.data;
}

// Payment status for the booking (read-only here):
// { mode, demo, payment: null | { status, amount, ... }, amount, canPay, ... }
export async function getPayment(tripId) {
  const res = await api.get(`/trips/${tripId}/payment`);
  return res.data.data;
}
