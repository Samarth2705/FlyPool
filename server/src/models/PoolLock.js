// A lock document per group of passengers who could share a cab: the same
// pickup (airport + terminal), vehicle and travel date. Starting a new shared
// ride writes to this document inside its transaction, so two passengers who
// start one at the same moment can't both succeed blindly: MongoDB lets one
// transaction commit and makes the other retry - which then sees the first
// shared ride and joins it instead of creating a duplicate
// (ride.service.js chooseRide).
import mongoose from 'mongoose';

const poolLockSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // "BOM-T2|sedan|2026-12-20"
    writes: { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: true },
);

poolLockSchema.index({ key: 1 }, { unique: true });
// Old locks are never needed again (a day after the travel date at most)
poolLockSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 3 * 24 * 60 * 60 });

export const PoolLock = mongoose.model('PoolLock', poolLockSchema);
