// Deleting an account (required by the app stores).
//
// What happens:
//   - the password is checked again, so a borrowed unlocked phone can't do it
//   - upcoming trips are cancelled, which also frees their seats in shared
//     rides (each cancellation runs in its own transaction, as on My Trips)
//   - the user record is deleted: name, email, phone and password hash
//   - past and cancelled trips are KEPT, as an anonymous record. They hold
//     no personal details (no name, email or phone), and their owner id no
//     longer leads to anyone.
// Every session of the account stops working at once: requireAuth rejects
// tokens whose account no longer exists.
// Safe to call again if it fails part-way: already-cancelled trips are skipped.
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Trip } from '../models/Trip.js';
import { cancelTrip } from './ride.service.js';
import { AppError } from '../utils/AppError.js';

export async function deleteAccount(userId, password) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new AppError(401, 'AUTH_REQUIRED', 'Please log in to continue.');
  if (!(await bcrypt.compare(password, user.password))) {
    throw new AppError(403, 'INVALID_PASSWORD', 'That password is incorrect.');
  }

  const upcoming = await Trip.find({ userId, status: { $ne: 'cancelled' }, arrivalAt: { $gte: new Date() } }).select('_id');
  for (const trip of upcoming) {
    await cancelTrip(trip._id, userId);
  }

  await User.deleteOne({ _id: userId });
  return { cancelledTrips: upcoming.length };
}
