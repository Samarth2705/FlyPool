// Checks the Page 2 form before it is sent. Uses the same rules and
// messages as server/src/validators/trip.validators.js - the server checks
// again, so these are only here to give instant feedback.
import { todayInMumbai, addDays } from './dates';

export const MAX_PASSENGERS = 6;
export const MAX_LUGGAGE = 10;
const MAX_DAYS_AHEAD = 365;

// Returns { fieldName: 'message' } - empty when everything is valid
export function validateTrip(trip, { requireTerminal }) {
  const errors = {};
  const pickup = trip.pickupLocation.trim();
  const destination = trip.destination.trim();
  const today = todayInMumbai();

  if (pickup.length < 3) errors.pickupLocation = 'Enter a pickup location.';
  if (requireTerminal && !trip.pickupTerminal) errors.pickupTerminal = 'Choose Terminal 1 or Terminal 2.';

  if (destination.length < 2) errors.destination = 'Enter your destination.';
  else if (destination.toLowerCase() === pickup.toLowerCase()) {
    errors.destination = 'Destination must be different from the pickup location.';
  }

  if (!trip.travelDate) errors.travelDate = 'Choose your travel date.';
  else if (trip.travelDate < today) errors.travelDate = 'Travel date cannot be in the past.';
  else if (trip.travelDate > addDays(today, MAX_DAYS_AHEAD)) errors.travelDate = 'Choose a date within the next year.';

  if (!trip.expectedArrivalTime) errors.expectedArrivalTime = 'Choose your expected arrival time.';

  if (!Number.isInteger(trip.passengerCount) || trip.passengerCount < 1 || trip.passengerCount > MAX_PASSENGERS) {
    errors.passengerCount = `Passengers must be between 1 and ${MAX_PASSENGERS}.`;
  }
  if (!Number.isInteger(trip.luggageCount) || trip.luggageCount < 0 || trip.luggageCount > MAX_LUGGAGE) {
    errors.luggageCount = `Bags must be between 0 and ${MAX_LUGGAGE}.`;
  }

  return errors;
}
