// Ride choices the passenger has made on the Ride Selection screen but not
// saved yet, per trip - kept in memory only (not on the device), so leaving
// the screen (e.g. back to Compatible Travellers) and coming back shows the
// same choices. A saved ride always comes from the server instead.
//   { mode: 'shared'|'solo'|null, vehicleType: 'sedan'|'suv'|null, poolChoice: '<poolId>'|'new' }
const drafts = new Map();

export const getRideDraft = (tripId) => drafts.get(tripId) ?? null;

export function setRideDraft(tripId, draft) {
  drafts.set(tripId, draft);
}

export function clearRideDraft(tripId) {
  drafts.delete(tripId);
}

// On logout: nothing unsaved is left behind for the next account
export function clearAllRideDrafts() {
  drafts.clear();
}
