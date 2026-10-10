// A passenger's airport journey: trip details (Page 2), flight verification
// (Page 3) and their ride choice (Page 4). Each trip belongs to exactly one
// user (userId), taken from the login cookie on the server.
//
// Status workflow (only the server moves a trip forward):
//
//   awaiting_verification  trip details saved (Page 2), flight not verified yet
//        |  POST /:tripId/verification succeeds
//   flight_verified        flight verified (demo verification for now)
//        |  PUT /:tripId/ride
//   ride_selected          ride chosen: rideMode "shared" (member of a Pool) or
//                          "solo". A ride REQUEST - not a booking, no driver.
//
//   cancelled              set by the passenger (PATCH { status: "cancelled" })
//                          from any of the above; leaves any open pool
//
// "booking_confirmed" / "completed" are deliberately not used yet: FlyPool
// can't confirm or complete a real booking. Past trips are recognised by
// their arrival time instead.
import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TRIP_STATUSES = ['awaiting_verification', 'flight_verified', 'ride_selected', 'cancelled'];

// The flight as verified on Page 3 (a self-contained record of the flight)
const flightSchema = new Schema(
  {
    airline: { type: String, trim: true, maxlength: 60 },
    flightNumber: { type: String, trim: true, maxlength: 10 }, // e.g. "6E2134"
    flightDate: { type: String }, // "2026-10-12" (= the trip's travelDate)
    scheduledArrivalTime: { type: String }, // "18:30", Mumbai time
    arrivalAirport: { type: String }, // "BOM"
    arrivalTerminal: { type: String }, // "T1" / "T2" when known
  },
  { _id: false },
);

// The result of Page 3. The document itself is NEVER stored - only the
// facts below. See services/flightVerification.service.js.
const verificationSchema = new Schema(
  {
    status: { type: String, enum: ['not_started', 'verified', 'failed'], default: 'not_started' },
    method: { type: String }, // "demo" until a real verification provider is connected
    document: {
      kind: { type: String, enum: ['image', 'pdf'] },
      sizeBytes: Number,
      receivedAt: Date,
    },
    // Reading details from the document (OCR) - "not_configured" for now
    extraction: { status: { type: String, default: 'not_configured' } },
    checks: [{ _id: false, name: String, passed: Boolean, message: String }],
    checkedAt: Date,
  },
  { _id: false },
);

const tripSchema = new Schema(
  {
    // Who owns the trip - always taken from the login cookie, never the request body
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    pickupLocation: { type: String, required: true, trim: true, maxlength: 120 },
    // "T1" or "T2" when picking up at the airport, otherwise null
    pickupTerminal: { type: String, enum: ['T1', 'T2', null], default: null },
    destination: { type: String, required: true, trim: true, maxlength: 120 },

    // As the passenger entered them (Mumbai time): "2026-10-12" and "18:30"
    travelDate: { type: String, required: true },
    expectedArrivalTime: { type: String, required: true },
    // The same moment as a real date, used to match passengers arriving
    // around the same time and to tell upcoming from past trips
    arrivalAt: { type: Date, required: true, index: true },

    passengerCount: { type: Number, required: true, min: 1, max: 6 },
    luggageCount: { type: Number, required: true, min: 0, max: 10 },
    openToPooling: { type: Boolean, default: true },

    status: { type: String, enum: TRIP_STATUSES, default: 'awaiting_verification', index: true },
    cancelledAt: { type: Date },

    flight: { type: flightSchema, default: undefined },
    verification: { type: verificationSchema, default: () => ({}) },

    // Page 4 choice. rideMode "shared" -> poolId points at the shared ride
    // (models/Pool.js) whose estimate is the source of truth; "solo" -> the
    // whole cab for this trip's group, estimate in soloFareEstimate.
    rideMode: { type: String, enum: ['shared', 'solo', null], default: null },
    vehicleType: { type: String, enum: ['sedan', 'suv', null], default: null },
    poolId: { type: Schema.Types.ObjectId, ref: 'Pool', default: null, index: true },
    soloFareEstimate: { type: Schema.Types.Mixed, default: null },
    rideSelectedAt: { type: Date },

    // Random id sent by Page 2 once per form, so retries don't create duplicates
    clientRequestId: { type: String },

    // Sample traveller created by `npm run seed:demo`. Never matched in production.
    isDemo: { type: Boolean, default: false },
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        ret.userId = ret.userId.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.clientRequestId;
        if (ret.poolId) ret.poolId = ret.poolId.toString();
        return ret;
      },
    },
  },
);

// A user's trips, newest activity first (My Trips, "current trip" after login)
tripSchema.index({ userId: 1, updatedAt: -1 });
// Matching: verified trips arriving around a given time
tripSchema.index({ status: 1, arrivalAt: 1 });
// One trip per form submission per user (only when an id was sent)
tripSchema.index(
  { userId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } },
);

export const Trip = mongoose.model('Trip', tripSchema);
