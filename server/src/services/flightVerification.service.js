// Flight verification for Page 3.
//
// What is checked, and what each check can and cannot prove:
//   1. File check (inspectDocument): the upload is a real JPG/PNG/WebP/PDF of
//      at most 3 MB - by its first bytes, not its declared type.
//   2. Readability (ticketReader.service.js): the file decodes completely and
//      is not blank, tiny, damaged or a PDF without text.
//   3. Extraction: boarding-pass barcode (IATA BCBP) and/or the printed text
//      (OCR for images, the text layer for PDFs).
//   4. Consistency (demoVerifier below): the document must look like a
//      boarding pass / e-ticket AND show the flight number entered, the trip's
//      date, the trip's airport (Mumbai BOM or Navi Mumbai NMI), and a
//      passenger name that matches the account holder's full name
//      (passengerName.js). A mismatch is refused.
//   5. Authenticity: NOT ESTABLISHED. Nothing here contacts the airline. A
//      fabricated document that contains the right text passes the checks
//      above, so results are stored with method "demo" and labelled "demo
//      verification - not confirmed with the airline" in the apps.
//
// FLIGHT_VERIFICATION_MODE (config/env.js):
//   "demo" - steps 1-4. A file being uploaded is never enough on its own.
//   "off"  - verification is refused with a clear 503 error.
// To connect a real airline / flight-data provider, register it with
// registerFlightVerifier("name", fn) and set FLIGHT_VERIFICATION_MODE=name.
// It gets the same input as demoVerifier and must return the same shape.
import { AppError } from '../utils/AppError.js';
import { parseFlightNumber, nameMatchesAirline } from '../data/airlines.js';
import { analyzeTicket, extractFlightDetails } from './ticketAnalysis.js';
import { airportByCode } from '../data/mumbaiAreas.js';
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

// Checks an uploaded document's encoding, size and real file type.
// Returns { facts: { kind, sizeBytes }, bytes } - the bytes stay in memory only.
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

  return { facts: { kind: FILE_SIGNATURES[mimeType].kind, sizeBytes: bytes.length }, bytes };
}

// Why a document couldn't be read (ticketReader.service.js "problem")
const UNREADABLE = {
  blank: 'Your document looks blank (a single colour, e.g. all black or all white). Upload a clear photo or screenshot of your boarding pass or e-ticket.',
  too_small: 'Your image is too small to read. Upload a larger, clearer photo or screenshot of your boarding pass or e-ticket.',
  no_text: 'We couldn’t find any text in this PDF (it may be a scan). Upload the e-ticket PDF from your airline, or a clear photo or screenshot of it.',
  pdf_protected: 'This PDF is password-protected. Upload an unprotected copy, or a screenshot of your e-ticket.',
  pdf_too_long: 'This PDF has more than 10 pages. Upload just your e-ticket or boarding pass.',
};

const formatDate = (iso) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const showFlight = (n) => n.replace(/^([A-Z0-9]{2})(\d)/, '$1 $2'); // "6E2134" -> "6E 2134"

// What was read, to store with the result - facts only: never the document's
// text or the passenger's name
const extractionFacts = (document, facts, flightNumber) => ({
  status: 'read',
  // airline, flight number, departure / arrival airport, date, departure time - null when not found
  details: extractFlightDetails(document, facts, { flightNumber }),
  source: document.source,
  confidence: document.confidence ?? null,
  flightNumbers: facts.flightNumbers.slice(0, 10),
  flightMatched: facts.flightMatched,
  dates: facts.dates.slice(0, 10),
  airportFound: facts.airportFound,
  nameMatched: facts.nameMatched,
  boardingPassBarcode: facts.boardingPassBarcode,
});

// Demo verification: the document must be readable and agree with the trip.
// input: { airline, flightNumber, travelDate, today, passengerName, airport, document }
//   airport: the trip's airport code ("BOM" / "NMI"), or null for a pickup away from an airport
//   document: from readTicketDocument() - { readable, problem } or { readable, source, text, barcodes, confidence }
// Returns { passed, checks: [{ name, passed, message }], flight, extraction }
export function demoVerifier({ airline, flightNumber, travelDate, today, passengerName, airport = null, document }) {
  const checks = [];
  const add = (name, passed, message) => checks.push({ name, passed, message });

  // 1. Readable at all? If not, nothing else can be checked.
  if (!document?.readable) {
    add('document_readable', false, UNREADABLE[document?.problem] ?? 'We couldn’t read your document. Upload a clear photo, screenshot or PDF of your ticket.');
    return { passed: false, checks, flight: null, extraction: { status: 'unreadable', problem: document?.problem ?? 'unknown' } };
  }

  const entered = parseFlightNumber(flightNumber);
  const facts = analyzeTicket(document, { travelDate, passengerName, airport, flightNumber: entered?.airline ? entered.normalized : null });
  add(
    'document_readable',
    true,
    facts.boardingPassBarcode ? 'Boarding-pass barcode and text read from your document.' : 'Text read from your document.',
  );

  // 2. Does it look like a boarding pass / e-ticket at all? If not, stop here:
  //    flight numbers or dates "found" in a random photo would only confuse.
  if (facts.ticketTerms < 2) {
    add('ticket_document', false, 'This doesn’t look like a boarding pass or e-ticket. Upload your airline ticket, not another photo or document.');
    return { passed: false, checks, flight: null, extraction: extractionFacts(document, facts, entered?.airline ? entered.normalized : null) };
  }
  add('ticket_document', true, 'The document looks like a boarding pass or e-ticket.');

  // 3. Entered flight number: valid, a known airline, matches the airline entered
  const parsed = parseFlightNumber(flightNumber);
  if (!parsed) {
    add('flight_number', false, `"${flightNumber}" is not a valid flight number.`);
  } else if (!parsed.airline) {
    add('airline_code', false, `We can't check flights with airline code ${parsed.code} yet. Please check the flight number on your ticket.`);
  } else if (!nameMatchesAirline(airline, parsed.airline)) {
    add('airline_code', false, `${parsed.normalized} is operated by ${parsed.airline.name}, but the airline entered is "${airline}".`);
  } else {
    add('airline_code', true, `${parsed.normalized} is operated by ${parsed.airline.name}.`);
  }

  // 4. The same flight number on the document
  if (parsed?.airline) {
    if (facts.flightMatched) {
      add('document_flight_number', true, `Flight ${showFlight(parsed.normalized)} appears on your document.`);
    } else if (facts.flightNumbers.length) {
      add(
        'document_flight_number',
        false,
        `Your document shows flight ${facts.flightNumbers.map(showFlight).join(', ')}, not ${showFlight(parsed.normalized)}. Check the flight number.`,
      );
    } else {
      add('document_flight_number', false, 'We couldn’t find a flight number on your document. Upload a clearer copy of your ticket.');
    }
  }

  // 5. The trip's date (or the day before: an overnight flight's departure date)
  if (facts.dates.some((d) => facts.acceptedDates.includes(d))) {
    add('document_date', true, `Your travel date (${formatDate(travelDate)}) appears on your document.`);
  } else if (facts.dates.length) {
    add(
      'document_date',
      false,
      `Your document shows ${facts.dates.map(formatDate).join(', ')}, but your trip is on ${formatDate(travelDate)}. Check the travel date.`,
    );
  } else {
    add('document_date', false, 'We couldn’t find your travel date on your document. Upload a clearer copy of your ticket.');
  }

  // 6. A flight arriving at the trip's airport (either Mumbai airport for a
  //    pickup away from the airport)
  const tripAirport = airportByCode(airport);
  const airportLabel = tripAirport?.shortName ?? 'Mumbai or Navi Mumbai Airport';
  // The direction counts whenever the document shows it (barcode or a printed
  // route): a ticket for a flight LEAVING Mumbai doesn't verify an arrival.
  if (facts.airportIsOrigin) {
    add(
      'document_destination',
      false,
      `Your ${facts.boardingPassBarcode ? 'boarding pass' : 'ticket'} is for a flight leaving ${tripAirport?.city ?? 'Mumbai'}. FlyPool needs your flight arriving there.`,
    );
  } else if (!facts.airportFound && facts.otherAirport && tripAirport) {
    add(
      'document_destination',
      false,
      `Your ticket is for ${airportByCode(facts.otherAirport).shortName}, but your trip is from ${tripAirport.shortName}. Check the airport in your trip details.`,
    );
  } else {
    add(
      'document_destination',
      facts.airportFound,
      facts.airportFound
        ? `${airportByCode(facts.arrivalAirport)?.shortName ?? airportLabel} appears on your document.`
        : `We couldn’t find ${airportLabel} on your document. FlyPool is for flights arriving there.`,
    );
  }

  // 7. The account holder's name, compared with the document's PASSENGER NAME
  //    only (passengerName.js) - never with the rest of the text. The name read
  //    off the document is never shown, stored or logged.
  let nameMessage = 'The passenger name on your document matches your FlyPool account.';
  if (!facts.nameMatched) {
    nameMessage = facts.nameFieldFound
      ? 'The passenger name on your document doesn’t match the name on your FlyPool account. The ticket must be in your full name, as on your account.'
      : 'We couldn’t find the passenger name on your document. Upload a ticket or boarding pass that clearly shows the passenger’s name.';
  }
  add('passenger_name', facts.nameMatched, nameMessage);

  // 8. Not in the past
  add('flight_date', travelDate >= today, travelDate >= today ? 'Flight date is today or later.' : 'The flight date has already passed.');

  return {
    passed: checks.every((c) => c.passed),
    checks,
    // arrivalAirport: the Mumbai airport (BOM / NMI) the document shows the flight arriving at, or null
    flight: parsed?.airline ? { airline: parsed.airline.name, flightNumber: parsed.normalized, arrivalAirport: facts.arrivalAirport } : null,
    extraction: extractionFacts(document, facts, entered?.airline ? entered.normalized : null),
  };
}

// The five separate questions a verification answers - never merged into one:
//   fileAccepted          a real JPG/PNG/WebP/PDF within the size limit
//   documentReadable      decoded, not blank, text or a barcode could be read
//   detailsExtracted      the essential flight details were found on it
//                         (flight number, date and arrival airport)
//   detailsMatched        they agree with the trip and the passenger
//   authenticityConfirmed a TRUSTED source (airline / booking system) confirmed
//                         the booking. Never true in demo mode: reading a
//                         document can't prove it's genuine.
export function verificationLevels(method, result) {
  const extraction = result.extraction ?? {};
  const details = extraction.details ?? {};
  const confirmed = method !== 'demo' && result.authenticity?.confirmed === true;
  return {
    levels: {
      fileAccepted: true, // anything that reaches a verifier passed inspectDocument
      documentReadable: extraction.status === 'read',
      detailsExtracted: Boolean(details.flightNumber && details.date && (details.arrivalAirport || extraction.airportFound)),
      detailsMatched: result.passed === true,
      authenticityConfirmed: confirmed,
    },
    authenticity: confirmed
      ? { confirmed: true, source: String(result.authenticity.source ?? method), reference: result.authenticity.reference ?? null }
      : { confirmed: false, source: null, reference: null },
  };
}

const verifiers = { demo: demoVerifier };

export function registerFlightVerifier(name, verifier) {
  verifiers[name] = verifier;
}

// Throws 503 when verification is switched off, before any document is read
export function requireVerificationAvailable() {
  const method = env.flightVerificationMode;
  if (method === 'off' || !verifiers[method]) {
    throw new AppError(503, 'VERIFICATION_UNAVAILABLE', 'Flight verification isn’t available right now. Please try again later.');
  }
  return method;
}

// Runs the configured verifier. Never reports success it didn't get:
// unconfigured -> 503, provider error or timeout -> 503 (the trip is untouched).
// Returns { method, passed, checks, flight, extraction }.
export async function verifyFlightDetails(input) {
  const method = requireVerificationAvailable();

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
    return { method, ...result, ...verificationLevels(method, result) };
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
