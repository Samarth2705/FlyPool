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
import { AIRPORTS, airportOfTrip } from '../data/mumbaiAreas.js';

const { Schema } = mongoose;

export const TRIP_STATUSES = ['awaiting_verification', 'flight_verified', 'ride_selected', 'cancelled'];

// The flight as verified on Page 3 (a self-contained record of the flight)
const flightSchema = new Schema(
  {
    airline: { type: String, trim: true, maxlength: 60 },
    flightNumber: { type: String, trim: true, maxlength: 10 }, // e.g. "6E2134"
    flightDate: { type: String }, // "2026-10-12" (= the trip's travelDate)
    scheduledArrivalTime: { type: String }, // "18:30", Mumbai time
    // "BOM" / "NMI": the pickup airport or, for a pickup away from the airport,
    // the one the ticket shows the flight arriving at; null if it doesn't say
    // which. (Such trips verified before 2026-11-15 were stored as "BOM".)
    arrivalAirport: { type: String },
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
    // What was read from the document (barcode / OCR / PDF text) - facts only:
    // never the document's text or the passenger's name.
    //   status: "read" | "unreadable" | "not_configured" (trips verified before reading existed)
    extraction: {
      status: { type: String, default: 'not_configured' },
      problem: String, // why it was unreadable: blank, too_small, no_text, ...
      source: String, // ocr | barcode+ocr | pdf_text
      confidence: Number, // OCR confidence 0-100 (images only)
      flightNumbers: { type: [String], default: undefined }, // read exactly as written
      flightMatched: Boolean, // the entered flight number is on the document (allowing OCR look-alikes)
      dates: { type: [String], default: undefined },
      airportFound: Boolean, // the trip's airport (BOM / NMI) is on the document
      nameMatched: Boolean,
      boardingPassBarcode: Boolean,
      // The flight as read off the document (null = not found). Never the passenger's name.
      details: {
        airline: String,
        flightNumber: String,
        departureAirport: String,
        arrivalAirport: String,
        date: String,
        departureTime: String,
      },
    },
    // What this verification established - separately (flightVerification.service.js)
    levels: {
      fileAccepted: Boolean,
      documentReadable: Boolean,
      detailsExtracted: Boolean,
      detailsMatched: Boolean,
      authenticityConfirmed: Boolean, // only a trusted airline / booking source can set this
    },
    authenticity: {
      confirmed: { type: Boolean, default: false },
      source: String, // the trusted source that confirmed it (none in demo mode)
      reference: String,
    },
    checks: [{ _id: false, name: String, passed: Boolean, message: String }],
    checkedAt: Date,
  },
  { _id: false },
);

// The booking, once the passenger confirms their ride (POST
// /api/trips/:tripId/booking - services/booking.service.js). A confirmed
// booking means FlyPool saved it; there is no payment or driver yet.
// What was booked is kept as a snapshot (ride, travellers, fare estimate at
// that moment), because a shared ride's other bookings can still change.
//   status  confirmed -> cancelled  (Cancel Booking: the trip is cancelled too)
//           confirmed -> left_pool  (Leave Pool: the passenger left the shared
//                                    ride; the booking ends and moves to
//                                    trip.pastBookings, the trip goes on)
const bookingSchema = new Schema(
  {
    reference: { type: String, required: true }, // e.g. "FP-7K3Q9M2X", made by the server
    status: { type: String, enum: ['confirmed', 'cancelled', 'left_pool'], required: true },
    confirmedAt: { type: Date, required: true },
    cancelledAt: { type: Date },
    cancelReason: { type: String, maxlength: 200 }, // optional, from the passenger
    endedAt: { type: Date }, // when a booking ended by leaving its shared ride
    mode: { type: String, enum: ['shared', 'solo'], required: true },
    vehicleType: { type: String, enum: ['sedan', 'suv'], required: true },
    vehicle: { type: Schema.Types.Mixed }, // { type, label, seats, bags }
    poolId: { type: String, default: null },
    partySize: { type: Number, required: true },
    travellers: { type: [Schema.Types.Mixed], default: [] }, // other bookings in the shared ride (public facts only)
    fare: { type: Schema.Types.Mixed, default: null }, // the estimate shown when confirming (null if none)
  },
  { _id: false },
);

const tripSchema = new Schema(
  {
    // Who owns the trip - always taken from the login cookie, never the request body
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    pickupLocation: { type: String, required: true, trim: true, maxlength: 120 },
    // The airport's code when picking up at one ("BOM" Mumbai, "NMI" Navi Mumbai),
    // otherwise null. Trips saved before airports were added don't have it:
    // it's worked out from pickupLocation when read (see toJSON / airportOfTrip).
    airport: { type: String, enum: [...AIRPORTS.map((a) => a.code), null], default: undefined },
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

    // Set when the passenger confirms the booking (see bookingSchema)
    booking: { type: bookingSchema, default: null },
    // Earlier bookings of this trip that ended without cancelling the trip
    // (the passenger left the shared ride) - kept for history
    pastBookings: { type: [bookingSchema], default: [] },

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
        ret.airport = airportOfTrip(ret)?.code ?? null; // also for trips saved before airports were added
        return ret;
      },
    },
  },
);

// A user's trips, newest activity first (My Trips, "current trip" after login)
tripSchema.index({ userId: 1, updatedAt: -1 });
// Matching: verified trips arriving around a given time
tripSchema.index({ status: 1, arrivalAt: 1 });
// Booking references are unique
tripSchema.index({ 'booking.reference': 1 }, { unique: true, partialFilterExpression: { 'booking.reference': { $type: 'string' } } });
// One trip per form submission per user (only when an id was sent)
tripSchema.index(
  { userId: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: 'string' } } },
);

export const Trip = mongoose.model('Trip', tripSchema);
