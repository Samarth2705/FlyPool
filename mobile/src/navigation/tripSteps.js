// The trip-planning workflow and where each step lives:
//   1 Trip Planning        /  (a new trip)  or  /trip/<id>/details (this trip)
//   2 Flight Verification  /trip/<id>/verify
//   3 Travellers           /trip/<id>/matches
//   4 Ride Selection       /trip/<id>/ride
//   5 Booking Summary      /trip/<id>/summary   (then /trip/<id>/booking:
//                          the confirmed booking)
// A step can be opened only when the steps before it are done - the same
// rule the server enforces (verification needs a saved trip; matching and
// choosing a ride need a verified flight).
import { router } from 'expo-router';

export const VERIFIED_STATUSES = ['flight_verified', 'ride_selected'];

export const TRIP_STEPS = [
  { step: 1, label: 'Plan', title: 'Trip Planning' },
  { step: 2, label: 'Verify', title: 'Flight Verification' },
  { step: 3, label: 'Travellers', title: 'Compatible Travellers' },
  { step: 4, label: 'Ride', title: 'Ride Selection' },
  { step: 5, label: 'Book', title: 'Booking Summary' },
];

export function stepHref(step, tripId) {
  if (step === 1) return tripId ? { pathname: '/trip/[tripId]/details', params: { tripId } } : '/';
  if (step === 2) return { pathname: '/trip/[tripId]/verify', params: { tripId } };
  if (step === 3) return { pathname: '/trip/[tripId]/matches', params: { tripId } };
  if (step === 4) return { pathname: '/trip/[tripId]/ride', params: { tripId } };
  return { pathname: '/trip/[tripId]/summary', params: { tripId } };
}

// Can this step be opened for this trip? trip: { id, status } or null (not
// saved yet / still loading - then only the current step is available).
export function stepAvailable(step, trip) {
  if (step === 1) return true;
  if (!trip?.id || trip.status === 'cancelled') return false;
  if (step === 2) return true;
  if (step === 5) return trip.status === 'ride_selected'; // a ride is chosen
  return VERIFIED_STATUSES.includes(trip.status); // steps 3 and 4
}

// The furthest step this trip has reached (for "Continue" buttons)
export function nextStepFor(trip) {
  if (!trip || trip.status === 'cancelled') return null;
  if (trip.status === 'ride_selected') return 5;
  return VERIFIED_STATUSES.includes(trip.status) ? 3 : 2;
}

// Go to another step of the same trip. Earlier steps are usually already
// in the history (Back keeps working); later ones open on top.
export function goToStep(step, currentStep, tripId) {
  const href = stepHref(step, tripId);
  if (step < currentStep) router.dismissTo(href);
  else router.push(href);
}

// Start a new trip: back to the first screen, then the empty planning form
export function startNewTrip() {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}
