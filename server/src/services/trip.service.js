// Trip business logic: saving, editing, cancelling and loading trips, the
// "current trip" after login and flight verification (Page 3). The ride
// choice (Page 4) is in services/ride.service.js. Every function takes the
// owner's userId from the login cookie and only ever touches that user's trips.
import { Trip } from '../models/Trip.js';
import { AppError } from '../utils/AppError.js';
import { todayInMumbai, tripDetailsSchema, MUMBAI_AIRPORT } from '../validators/trip.validators.js';
import { inspectDocument, verifyFlightDetails } from './flightVerification.service.js';
import { VERIFIED_STATUSES } from './matching.service.js';
import * as rideService from './ride.service.js';

// Trips that still need the passenger to do something, and the page for it.
// A chosen ride ("ride_selected") is a request that needs nothing more from
// the passenger, so it never decides where someone lands.
export const NEXT_STEP_BY_STATUS = {
  awaiting_verification: 'verify',
  flight_verified: 'matches',
};

// A trip stays "current" until this long after its arrival time
const CURRENT_TRIP_GRACE_MS = 2 * 60 * 60 * 1000;

// Mumbai is UTC+05:30, so "18:30" on the travel date becomes a real moment in time
function arrivalMoment(travelDate, time) {
  return new Date(`${travelDate}T${time}:00+05:30`);
}

function requireNotCancelled(trip) {
  if (trip.status === 'cancelled') {
    throw new AppError(409, 'TRIP_CANCELLED', 'This trip was cancelled. Plan a new trip to continue.');
  }
}

// Page 2. With a clientRequestId, sending the same form twice returns the
// trip created the first time instead of a duplicate. Returns { trip, created }.
export async function createTrip(userId, { clientRequestId, ...details }) {
  if (clientRequestId) {
    const existing = await Trip.findOne({ userId, clientRequestId });
    if (existing) return { trip: existing, created: false };
  }

  const arrivalAt = arrivalMoment(details.travelDate, details.expectedArrivalTime);
  try {
    const trip = await Trip.create({ ...details, userId, arrivalAt, clientRequestId });
    return { trip, created: true };
  } catch (err) {
    // Two identical requests at the same moment: the unique index stops the
    // second one, which then returns the first one's trip
    if (err.code === 11000 && clientRequestId) {
      return { trip: await Trip.findOne({ userId, clientRequestId }), created: false };
    }
    throw err;
  }
}

// A user's trips, newest arrival first. when: "upcoming" | "past" | "all"
export async function listTripsForUser(userId, when = 'all') {
  const now = new Date();
  const filter = { userId };
  if (when === 'upcoming') filter.arrivalAt = { $gte: now };
  if (when === 'past') filter.arrivalAt = { $lt: now };
  return Trip.find(filter).sort({ arrivalAt: -1, updatedAt: -1 }).limit(100);
}

// Only the passenger who created a trip may see it. Someone else's trip
// gets the same "not found" error, so trip ids can't be probed.
export async function getTripForUser(tripId, userId) {
  const trip = await Trip.findOne({ _id: tripId, userId });
  if (!trip) {
    throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found.');
  }
  return trip;
}

// After login: the trip the passenger is in the middle of, if any.
// Picks, among their own not-yet-arrived trips that still need an action,
// the one they worked on most recently (then the soonest arrival).
// Returns { trip, nextStep } - both null when there is nothing to resume.
export async function getCurrentTrip(userId) {
  const trip = await Trip.findOne({
    userId,
    status: { $in: Object.keys(NEXT_STEP_BY_STATUS) },
    arrivalAt: { $gte: new Date(Date.now() - CURRENT_TRIP_GRACE_MS) },
  }).sort({ updatedAt: -1, arrivalAt: 1 });

  return { trip, nextStep: trip ? NEXT_STEP_BY_STATUS[trip.status] : null };
}

// PATCH: either edit trip details or cancel. Details can only change before
// the flight is verified (verification and matching are based on them).
// The trip keeps its id and owner; status and other protected fields are
// never taken from the request.
export async function updateTrip(tripId, userId, changes) {
  const trip = await getTripForUser(tripId, userId);
  requireNotCancelled(trip);

  // Cancelling also takes the trip out of its shared ride (in a transaction)
  if (changes.status === 'cancelled') return rideService.cancelTrip(tripId, userId);

  if (trip.status !== 'awaiting_verification') {
    throw new AppError(409, 'TRIP_LOCKED', 'Trip details can only be changed before your flight is verified.');
  }

  // Check the trip as a whole after the change (e.g. destination ≠ pickup)
  const current = {
    pickupLocation: trip.pickupLocation,
    pickupTerminal: trip.pickupTerminal,
    destination: trip.destination,
    travelDate: trip.travelDate,
    expectedArrivalTime: trip.expectedArrivalTime,
    passengerCount: trip.passengerCount,
    luggageCount: trip.luggageCount,
    openToPooling: trip.openToPooling,
  };
  const merged = { ...current, ...changes };
  if (merged.pickupLocation !== MUMBAI_AIRPORT && !('pickupTerminal' in changes)) merged.pickupTerminal = null;

  const result = tripDetailsSchema.safeParse(merged);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    throw new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details);
  }

  Object.assign(trip, result.data);
  trip.arrivalAt = arrivalMoment(result.data.travelDate, result.data.expectedArrivalTime);
  await trip.save();
  return trip;
}

// Page 3: check the document, run the configured verification and save the
// result. Only a PASSED verification changes the trip (flight details,
// arrival time); a failed attempt is recorded without touching the trip, so
// the passenger can correct the details and try again. If the verification
// service is unavailable nothing is saved at all.
// The document's contents are only used inside this function.
export async function verifyFlight(tripId, userId, { airline, flightNumber, scheduledArrivalTime, document }) {
  const trip = await getTripForUser(tripId, userId);
  requireNotCancelled(trip);
  if (VERIFIED_STATUSES.includes(trip.status)) {
    throw new AppError(409, 'ALREADY_VERIFIED', 'This flight has already been verified.');
  }

  const documentFacts = inspectDocument(document); // throws if not a valid file
  const result = await verifyFlightDetails({ airline, flightNumber, travelDate: trip.travelDate, today: todayInMumbai() });

  trip.verification = {
    status: result.passed ? 'verified' : 'failed',
    method: result.method,
    document: { ...documentFacts, receivedAt: new Date() },
    extraction: { status: 'not_configured' },
    checks: result.checks,
    checkedAt: new Date(),
  };

  if (result.passed) {
    trip.flight = {
      airline: result.flight.airline,
      flightNumber: result.flight.flightNumber,
      flightDate: trip.travelDate,
      scheduledArrivalTime,
      arrivalAirport: 'BOM',
      arrivalTerminal: trip.pickupLocation === MUMBAI_AIRPORT ? trip.pickupTerminal : undefined,
    };
    trip.expectedArrivalTime = scheduledArrivalTime;
    trip.arrivalAt = arrivalMoment(trip.travelDate, scheduledArrivalTime);
    trip.status = 'flight_verified';
  }
  await trip.save();

  if (!result.passed) {
    const failed = result.checks.filter((c) => !c.passed);
    throw new AppError(422, 'VERIFICATION_FAILED', failed[0].message, failed);
  }
  return trip;
}
