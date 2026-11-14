// The logged-in passenger's own traveller profile and identity verification.
//   GET   /profile           { profile }  name, date of birth, age, gender, sharing, identity
//   PATCH /profile           { profile }  only the fields sent (validated on the server)
//   GET   /identity          { identity } own status only
//   POST  /identity/start    { identity } method + explicit consent (external provider only)
//   POST  /identity/submit   { identity } manual (demo) check: method + consent + the ID file
import api, { unwrap } from './client';

export async function getProfile() {
  return unwrap(await api.get('/profile')).profile;
}

export async function updateProfile(changes) {
  return unwrap(await api.patch('/profile', changes)).profile;
}

export async function getIdentity() {
  return unwrap(await api.get('/identity')).identity;
}

// consent must be the passenger's explicit "I agree" - never sent automatically
export async function startIdentityVerification(method, consent) {
  return unwrap(await api.post('/identity/start', { method, consent })).identity;
}

// Manual (demo) check: the ID as { mimeType, dataBase64 } -> status "pending".
// Sent only after the passenger's explicit "I agree".
export async function submitIdentity(method, document) {
  return unwrap(await api.post('/identity/submit', { method, consent: true, document }, { timeout: 60000 })).identity;
}
