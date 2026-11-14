// Text for a ride choice (Page 4, Page 5, My Trips).

export const RIDE_MODE_LABELS = { shared: 'Shared Ride', solo: 'Travel Alone' };

// "Shared Ride · Sedan" / "Travel Alone · SUV"
export function rideTitle(ride) {
  if (!ride) return 'No ride chosen yet';
  const vehicle = ride.vehicle?.label ?? ride.vehicleType;
  return `${RIDE_MODE_LABELS[ride.mode]} · ${vehicle}`;
}
