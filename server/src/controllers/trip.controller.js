// Handles the /api/trips requests. requireAuth has already set req.userId,
// which is the only source of the trip owner.
import * as tripService from '../services/trip.service.js';
import * as rideService from '../services/ride.service.js';
import { listTripsQuerySchema } from '../validators/trip.validators.js';
import { AppError } from '../utils/AppError.js';

// POST /api/trips - save the trip details from Page 2.
// 201 for a new trip; 200 when the same form was already submitted.
export async function createTrip(req, res) {
  const { trip, created } = await tripService.createTrip(req.userId, req.body);
  res.status(created ? 201 : 200).json({ success: true, data: { trip } });
}

// GET /api/trips?when=upcoming|past|all - the logged-in passenger's own trips
export async function listTrips(req, res) {
  const query = listTripsQuerySchema.safeParse(req.query);
  if (!query.success) {
    throw new AppError(400, 'VALIDATION_ERROR', query.error.issues[0].message);
  }
  const trips = await tripService.listTripsForUser(req.userId, query.data.when);
  res.json({ success: true, data: { trips: await rideService.rideSummaries(trips) } });
}

// GET /api/trips/current - the trip to resume after login, if any
export async function getCurrentTrip(req, res) {
  const { trip, nextStep } = await tripService.getCurrentTrip(req.userId);
  res.json({ success: true, data: { trip, nextStep } });
}

// GET /api/trips/:tripId - one of the logged-in passenger's trips
export async function getTrip(req, res) {
  const trip = await tripService.getTripForUser(req.params.tripId, req.userId);
  res.json({ success: true, data: { trip } });
}

// PATCH /api/trips/:tripId - edit trip details (before verification) or cancel
export async function updateTrip(req, res) {
  const trip = await tripService.updateTrip(req.params.tripId, req.userId, req.body);
  res.json({ success: true, data: { trip } });
}

// POST /api/trips/:tripId/verification - Page 3 (flight details + document)
export async function verifyFlight(req, res) {
  const trip = await tripService.verifyFlight(req.params.tripId, req.userId, req.body);
  res.json({ success: true, data: { trip } });
}

// GET /api/trips/:tripId/matches - Page 4: compatible travellers, shared
// rides to join (per vehicle) and solo estimates
export async function getMatches(req, res) {
  const options = await rideService.getRideOptions(req.params.tripId, req.userId);
  res.json({ success: true, data: options });
}

// GET /api/trips/:tripId/ride - the saved ride choice (Page 5)
export async function getRide(req, res) {
  const { trip, ride } = await rideService.getRide(req.params.tripId, req.userId);
  res.json({ success: true, data: { trip, ride } });
}

// PUT /api/trips/:tripId/ride - Page 4 -> 5: Shared Ride / Travel Alone + vehicle
export async function chooseRide(req, res) {
  await rideService.chooseRide(req.params.tripId, req.userId, req.body);
  const { trip, ride } = await rideService.getRide(req.params.tripId, req.userId);
  res.json({ success: true, data: { trip, ride } });
}
