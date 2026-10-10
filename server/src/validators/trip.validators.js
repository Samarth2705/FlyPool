// Rules for the trip details sent from Page 2.
// The same rules (and messages) are used in client/src/utils/tripValidation.js.
import { z } from 'zod';
import { parseFlightNumber } from '../data/airlines.js';

export const MUMBAI_AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
export const MAX_PASSENGERS = 6;
export const MAX_LUGGAGE = 10;

// Trips are booked up to a year ahead
const MAX_DAYS_AHEAD = 365;

// Today's date in Mumbai as "YYYY-MM-DD" (the airport's time zone,
// not the server's, so "today" is the same for every passenger)
export function todayInMumbai(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// True for real calendar dates only (rejects e.g. "2026-02-30")
function isRealDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === isoDate;
}

const count = (label, min, max) =>
  z
    .number({ error: `${label} must be a number.` })
    .int(`${label} must be a whole number.`)
    .min(min, `${label} must be at least ${min}.`)
    .max(max, `${label} can be at most ${max}.`);

// Flight number: airline code (2-character IATA like "6E", or 3-letter ICAO
// like "IGO") + 1-4 digits + optional letter. Spaces/hyphens are ignored.
export const flightVerificationSchema = z.object({
  airline: z
    .string({ error: 'Airline is required.' })
    .trim()
    .min(2, 'Enter your airline.')
    .max(60, 'Airline name is too long.'),
  flightNumber: z
    .string({ error: 'Flight number is required.' })
    .trim()
    .max(12, 'Enter a flight number like 6E 2134 or AI 101.')
    .refine(
      (value) => parseFlightNumber(value) !== null,
      'Enter a flight number like 6E 2134 or AI 101 (airline code + up to 4 digits).',
    ),
  scheduledArrivalTime: z
    .string({ error: 'Scheduled arrival time is required.' })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid arrival time.'),
  // The boarding pass / e-ticket, base64-encoded. Checked and then discarded
  // by services/flightVerification.service.js - never stored.
  document: z.object(
    {
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], {
        error: 'Upload a JPG, PNG, WebP or PDF file.',
      }),
      dataBase64: z.string().min(1, 'Add your boarding pass or e-ticket.'),
    },
    { error: 'Add your boarding pass or e-ticket.' },
  ),
});

// PUT /api/trips/:tripId/ride - Page 4 ride choice
export const rideChoiceSchema = z
  .object({
    mode: z.enum(['shared', 'solo'], { error: 'Choose Shared Ride or Travel Alone.' }),
    vehicleType: z.enum(['sedan', 'suv'], { error: 'Choose a Sedan or an SUV.' }),
    poolId: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid shared ride.').optional(),
  })
  .strict('This field cannot be set.')
  .refine((body) => body.mode === 'shared' || !body.poolId, 'A solo ride cannot join a shared ride.');

// The trip-details fields from Page 2 (used for creating and editing)
const tripDetailsFields = {
  pickupLocation: z
    .string({ error: 'Pickup location is required.' })
    .trim()
    .min(3, 'Enter a pickup location.')
    .max(120, 'Pickup location is too long.'),
  pickupTerminal: z.enum(['T1', 'T2'], { error: 'Choose Terminal 1 or Terminal 2.' }).nullable().default(null),
  destination: z
    .string({ error: 'Destination is required.' })
    .trim()
    .min(2, 'Enter your destination.')
    .max(120, 'Destination is too long.'),
  travelDate: z
    .string({ error: 'Travel date is required.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid travel date.')
    .refine(isRealDate, 'Choose a valid travel date.'),
  expectedArrivalTime: z
    .string({ error: 'Arrival time is required.' })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid arrival time.'),
  passengerCount: count('Passengers', 1, MAX_PASSENGERS),
  luggageCount: count('Bags', 0, MAX_LUGGAGE).default(1),
  openToPooling: z.boolean({ error: 'Choose whether you are open to sharing.' }).default(true),
};

// Rules that involve more than one field
function checkTripRules(trip, ctx) {
  const sameAsPickup = trip.destination.toLowerCase() === trip.pickupLocation.toLowerCase();
  if (sameAsPickup) {
    ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Destination must be different from the pickup location.' });
  }

  if (trip.pickupLocation === MUMBAI_AIRPORT && !trip.pickupTerminal) {
    ctx.addIssue({ code: 'custom', path: ['pickupTerminal'], message: 'Choose Terminal 1 or Terminal 2.' });
  }

  const today = todayInMumbai();
  if (trip.travelDate < today) {
    ctx.addIssue({ code: 'custom', path: ['travelDate'], message: 'Travel date cannot be in the past.' });
  } else if (trip.travelDate > addDays(today, MAX_DAYS_AHEAD)) {
    ctx.addIssue({ code: 'custom', path: ['travelDate'], message: 'Choose a date within the next year.' });
  }
}

// A complete, consistent set of trip details
export const tripDetailsSchema = z.object(tripDetailsFields).superRefine(checkTripRules);

// POST /api/trips. clientRequestId is a random id the page creates once per
// form, so a repeated click or network retry returns the same trip instead
// of creating a duplicate.
export const createTripSchema = z
  .object({ ...tripDetailsFields, clientRequestId: z.uuid('Invalid request id.').optional() })
  .superRefine(checkTripRules);

// PATCH /api/trips/:tripId - either edit some trip details (before the
// flight is verified) or cancel the trip. Anything else - owner, status,
// verification, pool or fare fields - is rejected, never silently applied.
export const updateTripSchema = z
  .object({
    pickupLocation: tripDetailsFields.pickupLocation,
    pickupTerminal: z.enum(['T1', 'T2'], { error: 'Choose Terminal 1 or Terminal 2.' }).nullable(),
    destination: tripDetailsFields.destination,
    travelDate: tripDetailsFields.travelDate,
    expectedArrivalTime: tripDetailsFields.expectedArrivalTime,
    passengerCount: tripDetailsFields.passengerCount,
    luggageCount: count('Bags', 0, MAX_LUGGAGE),
    openToPooling: z.boolean({ error: 'Choose whether you are open to sharing.' }),
    status: z.literal('cancelled', { error: 'The only status you can set is "cancelled".' }),
  })
  .partial()
  .strict('This field cannot be changed.')
  .refine((body) => Object.keys(body).length > 0, 'Nothing to update.')
  .refine((body) => !body.status || Object.keys(body).length === 1, 'Cancel a trip on its own, without other changes.');

// GET /api/trips?when=upcoming|past
export const listTripsQuerySchema = z.object({
  when: z.enum(['upcoming', 'past', 'all'], { error: 'Use when=upcoming, past or all.' }).default('all'),
});
