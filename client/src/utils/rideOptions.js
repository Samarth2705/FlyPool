// Text for a ride choice (Page 4, Page 5, My Trips).

export const RIDE_MODE_LABELS = { shared: 'Shared Ride', solo: 'Travel Alone' };

// "Shared Ride · Sedan" / "Travel Alone · SUV"
export function rideTitle(ride) {
  if (!ride) return 'No ride chosen yet';
  const vehicle = ride.vehicle?.label ?? ride.vehicleType;
  return `${RIDE_MODE_LABELS[ride.mode]} · ${vehicle}`;
}

// "Lands 10 min after you" / "Lands at the same time as you"
export function arrivalText(minutesApart) {
  if (minutesApart === 0) return 'Lands at the same time as you';
  const minutes = Math.abs(minutesApart);
  return `Lands ${minutes} min ${minutesApart > 0 ? 'after' : 'before'} you`;
}
