// "This passenger is choosing a ride right now": one record per trip, kept
// alive by the app while the passenger is on the compatible-travellers or
// ride-selection screen (each live check, GET /trips/:id/live, renews it).
// It expires on its own (expiresAt) shortly after the app stops checking -
// screen closed, app in the background, phone offline - and is deleted when
// the passenger leaves the screen, books or cancels.
//
// Only used to COUNT compatible passengers ("2 others are also booking");
// nothing about the passenger is ever shown from it.
import mongoose from 'mongoose';

const rideIntentSchema = new mongoose.Schema(
  {
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trip', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pickupKey: { type: String, required: true }, // "BOM-T2": only the same airport + terminal can count
    arrivalAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);

// One record per trip - repeated checks renew it, never duplicate it
rideIntentSchema.index({ tripId: 1 }, { unique: true });
rideIntentSchema.index({ pickupKey: 1, expiresAt: 1 });
// MongoDB removes expired records by itself (within about a minute); queries
// also ignore anything past expiresAt, so the count is right in between
rideIntentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RideIntent = mongoose.model('RideIntent', rideIntentSchema);
