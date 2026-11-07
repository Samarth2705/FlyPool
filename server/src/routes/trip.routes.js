import { Router } from 'express';
import mongoose from 'mongoose';
import {
  createTrip,
  listTrips,
  getCurrentTrip,
  getTrip,
  updateTrip,
  verifyFlight,
  getMatches,
  getRide,
  chooseRide,
  confirmBooking,
  getBookingManagement,
  cancelBooking,
  leaveSharedRide,
} from '../controllers/trip.controller.js';
import { getPaymentView, startPayment } from '../controllers/payment.controller.js';
import { startPaymentSchema } from '../validators/payment.validators.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { AppError } from '../utils/AppError.js';
import { tripWriteLimiter } from '../middleware/rateLimiter.js';
import {
  createTripSchema,
  updateTripSchema,
  flightVerificationSchema,
  rideChoiceSchema,
  bookingConfirmSchema,
  cancelBookingSchema,
  leavePoolSchema,
} from '../validators/trip.validators.js';

const router = Router();

// Every trip route needs a logged-in passenger
router.use(requireAuth);

// A malformed trip id gets the same answer as someone else's trip
router.param('tripId', (req, res, next, tripId) => {
  if (!mongoose.isValidObjectId(tripId)) return next(new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found.'));
  next();
});

router.get('/', listTrips);
router.post('/', tripWriteLimiter, validate(createTripSchema), createTrip);
router.get('/current', getCurrentTrip); // before /:tripId, so "current" isn't read as an id
router.get('/:tripId', getTrip);
router.patch('/:tripId', tripWriteLimiter, validate(updateTripSchema), updateTrip);

// Page 3. Its larger JSON size limit and rate limit are set in app.js
// (they must run before the body is read).
router.post('/:tripId/verification', validate(flightVerificationSchema), verifyFlight);

// Page 4 / 5
router.get('/:tripId/matches', getMatches);
router.get('/:tripId/ride', getRide);
router.put('/:tripId/ride', tripWriteLimiter, validate(rideChoiceSchema), chooseRide);

// Booking summary -> confirmation (no payment yet)
router.post('/:tripId/booking', tripWriteLimiter, validate(bookingConfirmSchema), confirmBooking);

// Ride Management: view, cancel the booking (and its trip), leave the shared ride
router.get('/:tripId/booking', getBookingManagement);
router.post('/:tripId/booking/cancel', tripWriteLimiter, validate(cancelBookingSchema), cancelBooking);
router.post('/:tripId/booking/leave-pool', tripWriteLimiter, validate(leavePoolSchema), leaveSharedRide);

// Payment for the booking (amount worked out by the server)
router.get('/:tripId/payment', getPaymentView);
router.post('/:tripId/payment', paymentLimiter, validate(startPaymentSchema), startPayment);

export default router;
