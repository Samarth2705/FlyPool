// A shared ride: ONE cab that several passengers' trips join.
//
// Each member trip points back here with trip.poolId. Joining and leaving
// happen inside database transactions (services/ride.service.js), so seats
// and bags can never go over the vehicle's capacity, and a trip can't be in
// two pools at once (unique index on members.tripId below).
//
// status:
//   open       accepting passengers (the only status FlyPool sets today)
//   confirmed  reserved for a future booking/dispatch feature - members of a
//              confirmed ride can't leave or switch without a cancellation flow
//   completed  reserved, as above
//   cancelled  everyone left; kept for history
//
// A pool is NOT a booking and has no driver: FlyPool has no dispatch yet.
import mongoose from 'mongoose';

const { Schema } = mongoose;

export const POOL_STATUSES = ['open', 'confirmed', 'completed', 'cancelled'];

// What matching needs to know about each member, copied when they join.
// Trip details can't change after verification, so this stays accurate.
const memberSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    partySize: { type: Number, required: true, min: 1 },
    bags: { type: Number, required: true, min: 0 },
    destination: { type: String, required: true }, // as typed - never shown to others
    destinationArea: { type: String, default: null }, // e.g. "Andheri West" - shown to others
    arrivalAt: { type: Date, required: true },
    flightNumber: { type: String, default: null },
    isDemo: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const poolSchema = new Schema(
  {
    vehicleType: { type: String, enum: ['sedan', 'suv'], required: true },
    // Capacity of this ride's vehicle, copied from config/pricing.js at creation
    seats: { type: Number, required: true },
    bags: { type: Number, required: true },

    // Pickup: airport + terminal, e.g. "BOM-T2". Drop-offs are the members' destinations.
    pickupKey: { type: String, required: true },
    pickupAirport: { type: String, default: 'BOM' },
    pickupTerminal: { type: String, default: null },
    travelDate: { type: String, required: true },

    members: { type: [memberSchema], default: [] },
    seatsTaken: { type: Number, default: 0, min: 0 },
    bagsTaken: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: POOL_STATUSES, default: 'open' },

    // Estimate for the whole cab with the current members
    // ({ currency, total, people, perPerson: {min, max}, roadKm, source })
    fareEstimate: { type: Schema.Types.Mixed, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDemo: { type: Boolean, default: false }, // sample data from `npm run seed:demo`
  },
  {
    timestamps: true,
    // Saving a pool fails if someone else changed it after it was loaded
    optimisticConcurrency: true,
  },
);

// Open pools at a terminal around an arrival time (matching)
poolSchema.index({ status: 1, pickupKey: 1, 'members.arrivalAt': 1 });
// A trip can be a member of at most one pool (only counts pools that have members)
poolSchema.index(
  { 'members.tripId': 1 },
  { unique: true, partialFilterExpression: { 'members.tripId': { $exists: true } } },
);

export const Pool = mongoose.model('Pool', poolSchema);
