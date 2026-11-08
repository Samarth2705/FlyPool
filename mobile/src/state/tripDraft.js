// What the passenger has typed into a NEW trip form but not saved yet. Kept
// in memory only (never written to the device), for the logged-in user, so
// that if their session expires mid-form and they log in again, the form
// comes back filled in instead of empty. Cleared when the trip is saved and
// on logout, and never shown to a different account.
let draft = null; // { userId, trip, customPickup }

export function getTripDraft(userId) {
  return userId && draft?.userId === userId ? draft : null;
}

export function setTripDraft(userId, trip, customPickup) {
  if (userId) draft = { userId, trip, customPickup };
}

export function clearTripDraft() {
  draft = null;
}
