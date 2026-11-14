// How another passenger is described, from the server's `profile`:
// short name ("Asha V."), age (if they entered a date of birth) and gender
// (only if they chose to show it). The server never sends a date of birth,
// email, phone or identity details. (Same wording as the mobile app.)

export const GENDER_LABELS = { female: 'Female', male: 'Male', non_binary: 'Non-binary' };

export const ID_TYPES = [
  { value: 'aadhaar', label: 'Aadhaar card' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'voter_id', label: 'Voter ID' },
];

// "Asha Verma" -> "Asha V." - the server's rule (server/src/services/chat.service.js displayName)
export function shortName(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Traveller';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.at(-1)[0].toUpperCase()}.`;
}

// "Asha V. · 29 · Female" (only what the server sent), or the fallback
export function profileLine(profile, fallback = 'Traveller') {
  if (!profile?.shared) return fallback;
  const parts = [profile.name, profile.age != null ? `${profile.age}` : null, GENDER_LABELS[profile.gender] ?? null].filter(Boolean);
  return parts.length ? parts.join(' · ') : fallback;
}
