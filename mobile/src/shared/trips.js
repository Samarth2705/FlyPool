// Copied from the web app: client/src/utils/trips.js
// Pure JavaScript shared with the website - keep the two in sync.
// Display helpers for a trip, shared by the booking pages and My Trips.
import { MUMBAI_AIRPORT } from './mumbaiLocations';

// "1 bag" / "3 bags"
export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

export function isAirportPickup(trip) {
  return trip.pickupLocation === MUMBAI_AIRPORT.name;
}

// "Mumbai Airport (BOM) · T2", or the custom pickup point as typed
export function pickupLabel(trip) {
  if (!isAirportPickup(trip)) return trip.pickupLocation;
  return trip.pickupTerminal ? `${MUMBAI_AIRPORT.shortName} · ${trip.pickupTerminal}` : MUMBAI_AIRPORT.shortName;
}

// "Terminal 2", or null when the terminal isn't known / not an airport pickup
export function terminalLabel(trip) {
  if (!isAirportPickup(trip) || !trip.pickupTerminal) return null;
  return MUMBAI_AIRPORT.terminals.find((t) => t.id === trip.pickupTerminal)?.label ?? trip.pickupTerminal;
}

// "2 people · 3 bags"
export function partyLabel(trip) {
  return `${plural(trip.passengerCount, 'person', 'people')} · ${plural(trip.luggageCount, 'bag', 'bags')}`;
}

export const isDemoVerification = (trip) => Boolean(trip.verification?.method?.startsWith('demo'));
