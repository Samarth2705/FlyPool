// Lock documents for starting shared rides. A key is a pickup (airport +
// terminal), a vehicle and a slot of time as long as the arrival window
// (matching.service.js sharedRideLockKeys). Starting a new shared ride writes
// to the trip's three keys (its slot and the one either side) inside its
// transaction. Any two compatible passengers share at least one key - also
// when they land either side of midnight - so if they start a ride at the
// same moment MongoDB lets one transaction commit and makes the other retry,
// which then sees the first shared ride and joins it instead of creating a
// duplicate (ride.service.js chooseRide).
//
// Keys written before 2026-11-15 used the travel date ("BOM-T2|sedan|2026-12-20");
// they are no longer used and expire by themselves (below).
import mongoose from 'mongoose';

const poolLockSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // "BOM-T2|sedan|492521" (slot number)
    writes: { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: true },
);

poolLockSchema.index({ key: 1 }, { unique: true });
// Old locks are never needed again (a slot is long past within a day)
poolLockSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });

export const PoolLock = mongoose.model('PoolLock', poolLockSchema);
