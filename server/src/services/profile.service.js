// Traveller profiles: what a passenger has chosen to show other passengers,
// and the account holder's own profile settings.
//
// What other passengers can ever see (and only with shareProfile on):
//   name      first name + last initial ("Asha V.") - never the full surname
//   age       worked out from the date of birth - the date itself is never shared
//   gender    only if showGender is also on
//   identity  "verified" only after a genuine provider check, else "not_verified"
// Never shared: date of birth, email, phone, identity documents or numbers,
// provider references. Profiles are only attached where the API already
// describes a relevant traveller (compatible travellers of YOUR verified trip,
// members of a shared ride you can join or are in) - never by user id lookup.
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { todayInMumbai } from '../validators/trip.validators.js';
import { verifiedUserIds } from './identity.service.js';
import { displayName } from './chat.service.js';

// "Asha Verma" -> "Asha V." - the same short form the group chat uses
export const shortName = (fullName = '') => displayName(String(fullName));

// Whole years between "YYYY-MM-DD" and today in Mumbai
export function ageFrom(dateOfBirth, today = todayInMumbai()) {
  if (!dateOfBirth) return null;
  const [by, bm, bd] = dateOfBirth.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

const NOT_SHARED = Object.freeze({ shared: false });

// userIds -> Map(userId -> public profile). Users who haven't turned sharing on
// get { shared: false } and nothing else.
export async function publicProfiles(userIds) {
  const ids = [...new Set(userIds.map(String))];
  if (ids.length === 0) return new Map();
  const [users, verified] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('name dateOfBirth gender profileSharing'),
    verifiedUserIds(ids),
  ]);
  const profiles = new Map(ids.map((id) => [id, NOT_SHARED]));
  for (const u of users) {
    if (!u.profileSharing?.shareProfile) continue;
    profiles.set(String(u._id), {
      shared: true,
      name: shortName(u.name),
      age: ageFrom(u.dateOfBirth),
      gender: u.profileSharing.showGender ? (u.gender ?? null) : null,
      identity: verified.has(String(u._id)) ? 'verified' : 'not_verified',
    });
  }
  return profiles;
}

// ---- the account holder's own profile ----------------------------------------

export function ownProfile(user, identity) {
  return {
    name: user.name,
    dateOfBirth: user.dateOfBirth ?? null,
    age: ageFrom(user.dateOfBirth),
    gender: user.gender ?? null,
    profileSharing: {
      shareProfile: Boolean(user.profileSharing?.shareProfile),
      showGender: Boolean(user.profileSharing?.showGender),
    },
    identity, // own status, see identity.service.js
  };
}

// PATCH /api/profile - only the fields given; validated by profileUpdateSchema
export async function updateProfile(userId, changes) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Account not found.');
  if ('name' in changes) user.name = changes.name;
  if ('dateOfBirth' in changes) user.dateOfBirth = changes.dateOfBirth;
  if ('gender' in changes) user.gender = changes.gender;
  if (changes.profileSharing) {
    const next = { ...user.profileSharing.toObject?.(), ...changes.profileSharing };
    if (!next.shareProfile) next.showGender = false; // gender is only ever shown inside a shared profile
    user.profileSharing = next;
  }
  await user.save();
  return user;
}
