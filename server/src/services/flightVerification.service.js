// Flight verification for Page 3.
//
// What is real and what is not:
//   - Document check: REAL. The uploaded boarding pass / e-ticket is decoded
//     in memory, its size is checked and its real file type is confirmed from
//     its first bytes. It is never written to disk, a database or the logs,
//     and is dropped as soon as the request ends.
//   - Data extraction (OCR): NOT CONNECTED. Nothing is read from the document.
//   - Flight check: chosen by FLIGHT_VERIFICATION_MODE (config/env.js):
//       "demo" - consistency checks only (format, airline code vs airline
//                name, date). NOT a real flight lookup. Results are stored with
//                method "demo" and labelled "demo verification" in the app.
//                Default outside production.
//       "off"  - verification is refused with a clear 503 error. Default in
//                production, so demo results can't be mistaken for real ones.
//
// To connect a real flight-data provider, register it with
// registerFlightVerifier("name", fn) and set FLIGHT_VERIFICATION_MODE=name.
// It gets the same input as demoVerifier and must return the same shape;
// timeouts and errors are handled by verifyFlightDetails() below.
import { AppError } from '../utils/AppError.js';
import { parseFlightNumber, nameMatchesAirline } from '../data/airlines.js';
import { env } from '../config/env.js';

// 3 MB: base64 makes it ~4 MB, under the ~4.5 MB request limit of serverless hosts (Vercel)
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024;

// The first bytes ("magic numbers") of each allowed file type
const FILE_SIGNATURES = {
  'image/jpeg': { kind: 'image', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { kind: 'image', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': {
    kind: 'image',
    matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  'application/pdf': { kind: 'pdf', matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
};

export const ALLOWED_DOCUMENT_TYPES = Object.keys(FILE_SIGNATURES);

// Checks an uploaded document and returns only harmless facts about it.
// Throws a 400 error if it is empty, too large, or not really a JPG/PNG/WebP/PDF.
export function inspectDocument({ mimeType, dataBase64 }) {
  const fail = (message) => {
    throw new AppError(400, 'INVALID_DOCUMENT', message, [{ field: 'document', message }]);
  };

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) fail('The document could not be read. Please choose the file again.');
  const bytes = Buffer.from(dataBase64, 'base64');

  if (bytes.length === 0) fail('The document is empty.');
  if (bytes.length > MAX_DOCUMENT_BYTES) fail('The document is larger than 3 MB.');
  if (!FILE_SIGNATURES[mimeType]?.matches(bytes)) {
    fail('This file is not a valid JPG, PNG, WebP or PDF document.');
  }

  return { kind: FILE_SIGNATURES[mimeType].kind, sizeBytes: bytes.length };
}

// Demo verification: consistency checks on what the passenger entered.
// input: { airline, flightNumber, travelDate, today }
// Returns { passed, checks: [{ name, passed, message }], flight: { airline, flightNumber } }
export function demoVerifier({ airline, flightNumber, travelDate, today }) {
  const parsed = parseFlightNumber(flightNumber);
  const checks = [
    { name: 'document', passed: true, message: 'Boarding pass or e-ticket received (file type and size checked).' },
  ];

  if (!parsed) {
    checks.push({ name: 'flight_number', passed: false, message: `"${flightNumber}" is not a valid flight number.` });
  } else if (!parsed.airline) {
    checks.push({
      name: 'airline_code',
      passed: false,
      message: `We can't check flights with airline code ${parsed.code} yet. Please check the flight number on your ticket.`,
    });
  } else if (!nameMatchesAirline(airline, parsed.airline)) {
    checks.push({
      name: 'airline_code',
      passed: false,
      message: `${parsed.normalized} is operated by ${parsed.airline.name}, but the airline entered is "${airline}".`,
    });
  } else {
    checks.push({ name: 'airline_code', passed: true, message: `${parsed.normalized} is operated by ${parsed.airline.name}.` });
  }

  checks.push(
    travelDate >= today
      ? { name: 'flight_date', passed: true, message: 'Flight date is today or later.' }
      : { name: 'flight_date', passed: false, message: 'The flight date has already passed.' },
  );

  return {
    passed: checks.every((c) => c.passed),
    checks,
    flight: parsed?.airline ? { airline: parsed.airline.name, flightNumber: parsed.normalized } : null,
  };
}

const verifiers = { demo: demoVerifier };

export function registerFlightVerifier(name, verifier) {
  verifiers[name] = verifier;
}

// Runs the configured verifier. Never reports success it didn't get:
// unconfigured -> 503, provider error or timeout -> 503 (the trip is untouched).
// Returns { method, passed, checks, flight }.
export async function verifyFlightDetails(input) {
  const method = env.flightVerificationMode;
  if (method === 'off' || !verifiers[method]) {
    throw new AppError(
      503,
      'VERIFICATION_UNAVAILABLE',
      'Flight verification isn’t available right now. Please try again later.',
    );
  }

  let timer;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => verifiers[method](input)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Flight verification timed out')), env.verificationTimeoutMs);
      }),
    ]);
    if (typeof result?.passed !== 'boolean' || !Array.isArray(result.checks)) {
      throw new Error('Flight verifier returned an unexpected result');
    }
    return { method, ...result };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error(`[verification] ${method} verifier failed: ${err.message}`);
    throw new AppError(
      503,
      'VERIFICATION_SERVICE_ERROR',
      'We couldn’t check your flight right now. Your trip is saved - please try again in a few minutes.',
    );
  } finally {
    clearTimeout(timer);
  }
}
