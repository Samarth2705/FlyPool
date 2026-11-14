// The logged-in passenger's own traveller profile and identity check.
// Server side: server/src/routes/profile.routes.js
import api from './client';

// { name, dateOfBirth, age, gender, profileSharing: { showGender }, identity }
export async function getProfile() {
  const res = await api.get('/profile');
  return res.data.data.profile;
}

// changes: { dateOfBirth?, gender?, profileSharing?: { showGender } } -> the updated profile
export async function updateProfile(changes) {
  const res = await api.patch('/profile', changes);
  return res.data.data.profile;
}

// Own identity check: { status: not_started|pending|verified|rejected, available, manual, methods, canStart, ... }
export async function getIdentity() {
  const res = await api.get('/identity');
  return res.data.data.identity;
}

// Manual (demo) check: upload a photo/PDF of an ID -> status "pending"
// document: { mimeType, dataBase64 }
export async function submitIdentity({ method, document }) {
  const res = await api.post('/identity/submit', { method, consent: true, document }, { timeout: 60000 });
  return res.data.data.identity;
}
