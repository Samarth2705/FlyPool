// Trip business logic: saving, editing, cancelling and loading trips, the
// "current trip" after login and flight verification (Page 3). The ride
// choice (Page 4) is in services/ride.service.js. Every function takes the
// owner's userId from the login cookie and only ever touches that user's trips.
import { Trip } from '../models/Trip.js';
import { AppError } from '../utils/AppError.js';
import { notifyCompatibleTravellers, quietly } from './notification.service.js';
import { todayInMumbai, tripDetailsSchema } from '../validators/trip.validators.js';
import { airportByName, airportOfTrip } from '../data/mumbaiAreas.js';
import { inspectDocument, requireVerificationAvailable, verifyFlightDetails } from './flightVerification.service.js';
import { readTicketDocument } from './ticketReader.service.js';
import { User } from '../models/User.js';
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
  // A new pickup (or one that isn't an airport) starts without the old terminal
  const pickupChanged = 'pickupLocation' in changes && changes.pickupLocation !== current.pickupLocation;
  if (!('pickupTerminal' in changes) && (pickupChanged || !airportByName(merged.pickupLocation))) merged.pickupTerminal = null;

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

  const { facts: documentFacts, bytes } = inspectDocument(document); // 400 if not a valid file
  requireVerificationAvailable(); // 503 if switched off - before any reading
  // Read the document (400 if damaged; unreadable -> a failed check below)
  const content = await readTicketDocument({ kind: documentFacts.kind, mimeType: document.mimeType, bytes });
  const user = await User.findById(userId).select('name');
  const result = await verifyFlightDetails({
    airline,
    flightNumber,
    travelDate: trip.travelDate,
    today: todayInMumbai(),
    passengerName: user?.name ?? '',
    airport: airportOfTrip(trip)?.code ?? null,
    document: content,
  });

  trip.verification = {
    status: result.passed ? 'verified' : 'failed',
    method: result.method,
    document: { ...documentFacts, receivedAt: new Date() },
    extraction: result.extraction ?? { status: 'not_configured' },
    levels: result.levels,
    authenticity: result.authenticity,
    checks: result.checks,
    checkedAt: new Date(),
  };

  if (result.passed) {
    // Arrival airport: the pickup airport (the verification checked the ticket
    // arrives there). For a pickup away from the airport: the Mumbai airport
    // the ticket shows the flight arriving at, or null if it doesn't say which -
    // never assumed. The terminal is only known for airport pickups.
    const pickupAirport = airportOfTrip(trip);
    trip.flight = {
      airline: result.flight.airline,
      flightNumber: result.flight.flightNumber,
      flightDate: trip.travelDate,
      scheduledArrivalTime,
      arrivalAirport: pickupAirport?.code ?? result.flight.arrivalAirport ?? null,
      arrivalTerminal: pickupAirport ? trip.pickupTerminal : undefined,
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
  // Passengers whose trips are compatible with this one hear about it
  await quietly('compatible_traveller', () => notifyCompatibleTravellers(trip));
  return trip;
}
