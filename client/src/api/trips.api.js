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
export async function verifyFlight(tripId, details) {
  const res = await api.post(`/trips/${tripId}/verification`, details);
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
