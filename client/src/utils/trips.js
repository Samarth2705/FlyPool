// Display helpers for a trip, shared by the booking pages and My Trips.
import { airportOf } from '../data/mumbaiLocations';

// "1 bag" / "3 bags"
export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

export function isAirportPickup(trip) {
  return Boolean(airportOf(trip));
}

// "Mumbai Airport (BOM)" / "Navi Mumbai Airport (NMI)", or null for another pickup point
export function airportLabel(trip) {
  return airportOf(trip)?.shortName ?? null;
}

// "Mumbai Airport (BOM) · T2", "Navi Mumbai Airport (NMI) · T1", or the custom pickup point as typed
export function pickupLabel(trip) {
  const airport = airportOf(trip);
  if (!airport) return trip.pickupLocation;
  return trip.pickupTerminal ? `${airport.shortName} · ${trip.pickupTerminal}` : airport.shortName;
}

// "Terminal 2", or null when the terminal isn't known / not an airport pickup
export function terminalLabel(trip) {
  const airport = airportOf(trip);
  if (!airport || !trip.pickupTerminal) return null;
  return airport.terminals.find((t) => t.id === trip.pickupTerminal)?.label ?? trip.pickupTerminal;
}

// "2 people · 3 bags"
export function partyLabel(trip) {
  return `${plural(trip.passengerCount, 'person', 'people')} · ${plural(trip.luggageCount, 'bag', 'bags')}`;
}

export const isDemoVerification = (trip) => Boolean(trip.verification?.method?.startsWith('demo'));
