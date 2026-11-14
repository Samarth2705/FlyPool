// Phase 15: flight ticket verification must READ the document. Every case runs
// the real pipeline: file check -> readTicketDocument (decode, blank check,
// barcode, OCR / PDF text) -> demoVerifier. No database, no network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:1/unused';
process.env.JWT_SECRET ??= 'unit-test-secret-that-is-long-enough-123';
process.env.FLIGHT_VERIFICATION_MODE = 'demo';

const { inspectDocument, demoVerifier, verificationLevels } = await import('../../src/services/flightVerification.service.js');
const { readTicketDocument, stopTicketReader, OCR_ENGINE_FILES } = await import('../../src/services/ticketReader.service.js');
const { findDates, findFlightNumbers, nameAppears, parseBoardingPassBarcode, showsFlightNumber } = await import('../../src/services/ticketAnalysis.js');
const T = await import('../helpers/tickets.js');

after(() => stopTicketReader());

const TRIP = { airline: 'IndiGo', flightNumber: '6E 2134', travelDate: '2026-12-20', today: '2026-11-09', passengerName: 'Asha Verma' };
const lines = (overrides = {}) => T.ticketLines({ name: 'MS ASHA VERMA', date: TRIP.travelDate, ...overrides });

// The whole server-side flow for one upload. Returns the verifier's result, or
// { error } when the file itself is refused (400 INVALID_DOCUMENT).
async function verifyUpload(bytes, mimeType, trip = TRIP) {
  try {
    const { facts, bytes: decoded } = inspectDocument(T.asDocument(bytes, mimeType));
    const content = await readTicketDocument({ kind: facts.kind, mimeType, bytes: decoded });
    return demoVerifier({ ...trip, document: content });
  } catch (error) {
    return { error };
  }
}
const failedChecks = (r) => r.checks.filter((c) => !c.passed).map((c) => c.name);

// ---- the ten required cases ----------------------------------------------------

test('1. a completely black image is not approved (unreadable: blank)', async () => {
  for (const format of ['jpeg', 'png']) {
    const r = await verifyUpload(await T.blankImage('#000000', format), `image/${format}`);
    assert.equal(r.passed, false);
    assert.deepEqual(failedChecks(r), ['document_readable']);
    assert.match(r.checks[0].message, /looks blank/);
    assert.equal(r.extraction.status, 'unreadable');
    assert.equal(r.extraction.problem, 'blank');
  }
});

test('2. a white / blank (or single-colour) image is not approved', async () => {
  for (const colour of ['#ffffff', '#f4f4f4', '#3a6ea5']) {
    const r = await verifyUpload(await T.blankImage(colour, 'png'), 'image/png');
    assert.equal(r.passed, false, colour);
    assert.deepEqual(failedChecks(r), ['document_readable'], colour);
  }
});

test('3. an unrelated photograph is not approved', async () => {
  const r = await verifyUpload(await T.photoImage(), 'image/jpeg');
  assert.equal(r.passed, false);
  assert.deepEqual(failedChecks(r), ['ticket_document']);
  assert.match(r.checks.at(-1).message, /doesn’t look like a boarding pass or e-ticket/);
});

test('4. a corrupted image is refused as an invalid document', async () => {
  const jpegHeaderThenGarbage = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5000, 7)]);
  const truncatedPng = (await T.ticketImage(lines())).subarray(0, 4000);
  for (const [bytes, type] of [[jpegHeaderThenGarbage, 'image/jpeg'], [truncatedPng, 'image/png']]) {
    const r = await verifyUpload(bytes, type);
    assert.equal(r.error?.code, 'INVALID_DOCUMENT', type);
    assert.equal(r.error.statusCode, 400);
  }
  // A real PNG sent as "image/jpeg" is refused by its signature
  assert.equal((await verifyUpload(await T.ticketImage(lines()), 'image/jpeg')).error?.code, 'INVALID_DOCUMENT');
});

test('5. an invalid or damaged PDF is refused as an invalid document', async () => {
  const fakePdf = Buffer.from('%PDF-1.4\nthis is not really a pdf');
  const truncated = T.ticketPdf(lines()).subarray(0, 150);
  for (const bytes of [fakePdf, truncated]) {
    const r = await verifyUpload(bytes, 'application/pdf');
    assert.equal(r.error?.code, 'INVALID_DOCUMENT');
  }
  // A valid PDF with no text (e.g. a scan): readable file, but nothing to check
  const empty = await verifyUpload(T.ticketPdf([]), 'application/pdf');
  assert.equal(empty.passed, false);
  assert.equal(empty.extraction.problem, 'no_text');
});

test('6. a document with random text is not approved (PDF and image)', async () => {
  const random = ['Lorem ipsum dolor sit amet, consectetur adipiscing elit.', 'Grocery list: milk, eggs, bread and two apples.', 'Meeting moved to Tuesday 4pm.'];
  for (const [bytes, type] of [[T.ticketPdf(random), 'application/pdf'], [await T.ticketImage(random), 'image/png']]) {
    const r = await verifyUpload(bytes, type);
    assert.equal(r.passed, false, type);
    assert.deepEqual(failedChecks(r), ['ticket_document'], type);
  }
  // Random text that merely mentions a flight number is still not a ticket
  const r = await verifyUpload(T.ticketPdf(['My notes', 'remember 6E 2134 maybe']), 'application/pdf');
  assert.equal(r.passed, false);
});

test('7. a ticket with no flight number is not approved', async () => {
  const r = await verifyUpload(T.ticketPdf(lines({ flightNumber: null })), 'application/pdf');
  assert.equal(r.passed, false);
  assert.deepEqual(failedChecks(r), ['document_flight_number']);
  assert.match(r.checks.find((c) => c.name === 'document_flight_number').message, /couldn’t find a flight number/);
});

test('8. a ticket for a different flight number is rejected', async () => {
  for (const [bytes, type] of [
    [T.ticketPdf(lines({ flightNumber: '6E 5321' })), 'application/pdf'],
    [await T.ticketImage(lines({ flightNumber: '6E 5321' })), 'image/png'],
  ]) {
    const r = await verifyUpload(bytes, type);
    assert.equal(r.passed, false, type);
    assert.deepEqual(failedChecks(r), ['document_flight_number'], type);
    assert.match(r.checks.find((c) => !c.passed).message, /shows flight 6E 5321, not 6E 2134/);
  }
});

test('9. a ticket for a different travel date is rejected', async () => {
  const r = await verifyUpload(T.ticketPdf(lines({ date: '2026-12-27' })), 'application/pdf');
  assert.equal(r.passed, false);
  assert.deepEqual(failedChecks(r), ['document_date']);
  assert.match(r.checks.find((c) => !c.passed).message, /shows 27 Dec 2026, but your trip is on 20 Dec 2026/);
  // The day before is accepted: an overnight flight departs the evening before it lands
  assert.equal((await verifyUpload(T.ticketPdf(lines({ date: '2026-12-19' })), 'application/pdf')).passed, true);
});

test('10. a valid-looking ticket that matches the trip is accepted (PDF, PNG, JPEG, barcode) - as a demo check', async () => {
  const docs = [
    ['PDF e-ticket', T.ticketPdf(lines()), 'application/pdf', 'pdf_text'],
    ['PNG screenshot', await T.ticketImage(lines()), 'image/png', 'ocr'],
    ['JPEG photo', await T.ticketImage(lines(), { format: 'jpeg' }), 'image/jpeg', 'ocr'],
    ['boarding pass barcode', await T.ticketImage(['IndiGo BOARDING PASS'], { barcodeText: T.bcbp({ surname: 'VERMA', given: 'ASHA MS' }) }), 'image/png', 'barcode+ocr'],
  ];
  for (const [label, bytes, type, source] of docs) {
    const r = await verifyUpload(bytes, type);
    assert.equal(r.passed, true, `${label}: ${JSON.stringify(r.checks?.filter((c) => !c.passed) ?? r.error?.message)}`);
    assert.equal(r.extraction.status, 'read');
    assert.equal(r.extraction.source, source, label);
    assert.ok(r.extraction.flightNumbers.includes('6E2134'), label);
    assert.ok(r.extraction.dates.includes('2026-12-20'), label);
    assert.deepEqual(r.flight, { airline: 'IndiGo', flightNumber: '6E2134', arrivalAirport: 'BOM' });
  }
});

test('real-world images are still read: a noisy phone photo of a printed ticket, a dark-mode screenshot', async () => {
  const ticket = await T.ticketImage(lines(), { format: 'jpeg' });
  for (const [label, bytes, type] of [
    ['phone photo', await T.phonePhotoOf(ticket), 'image/jpeg'],
    ['dark mode', await T.darkModeOf(ticket), 'image/png'],
  ]) {
    const r = await verifyUpload(bytes, type);
    assert.equal(r.passed, true, `${label}: ${JSON.stringify(r.checks?.filter((c) => !c.passed) ?? r.error?.message)}`);
  }
});

// ---- other mismatches --------------------------------------------------------------

test('a ticket in someone else’s name, or not to Mumbai, is rejected', async () => {
  const otherName = await verifyUpload(T.ticketPdf(lines({ name: 'MR JOHN SMITH' })), 'application/pdf');
  assert.deepEqual(failedChecks(otherName), ['passenger_name']);
  const notMumbai = await verifyUpload(T.ticketPdf(lines({ to: 'BLR Bengaluru' })), 'application/pdf');
  assert.deepEqual(failedChecks(notMumbai), ['document_destination']);
  // A boarding pass for the flight LEAVING Mumbai is not the arrival
  const leaving = await verifyUpload(
    await T.ticketImage(['IndiGo BOARDING PASS'], { barcodeText: T.bcbp({ surname: 'VERMA', given: 'ASHA MS', from: 'BOM', to: 'DEL' }) }),
    'image/png',
  );
  assert.deepEqual(failedChecks(leaving), ['document_destination']);
});

test('arrival airport: a printed route must ARRIVE at the airport (not just mention it); which airport is recorded', async () => {
  const pdf = (from, to, extra = []) => T.ticketPdf([...lines({ from, to }), ...extra]);
  const destination = (r) => r.checks.find((c) => c.name === 'document_destination');
  const BOM_TRIP = { ...TRIP, airport: 'BOM' };
  const NMI_TRIP = { ...TRIP, airport: 'NMI' };
  const AWAY = { ...TRIP, airport: null }; // pickup away from the airport: either Mumbai airport

  // Text-only tickets (no barcode) for a flight LEAVING the airport are refused
  for (const [trip, from, city] of [[BOM_TRIP, 'BOM Mumbai T2', 'Mumbai'], [NMI_TRIP, 'NMI Navi Mumbai', 'Navi Mumbai'], [AWAY, 'BOM Mumbai T2', 'Mumbai']]) {
    const r = await verifyUpload(pdf(from, 'DEL Delhi'), 'application/pdf', trip);
    assert.deepEqual(failedChecks(r), ['document_destination'], `${trip.airport} trip, ticket leaving ${from}`);
    assert.equal(destination(r).message, `Your ticket is for a flight leaving ${city}. FlyPool needs your flight arriving there.`);
    assert.equal(r.flight.arrivalAirport, null);
  }
  // "DEL -> BOM" on one line counts as a route too
  assert.deepEqual(failedChecks(await verifyUpload(pdf(null, null, ['BOM -> DEL']), 'application/pdf', BOM_TRIP)), ['document_destination']);

  // Arriving there: accepted, and the airport recorded
  for (const [trip, to, code] of [[BOM_TRIP, 'BOM Mumbai T2', 'BOM'], [NMI_TRIP, 'NMI Navi Mumbai T1', 'NMI'], [AWAY, 'NMI Navi Mumbai T1', 'NMI'], [AWAY, 'BOM Mumbai T1', 'BOM']]) {
    const r = await verifyUpload(pdf('DEL Delhi', to), 'application/pdf', trip);
    assert.equal(r.passed, true, `${trip.airport} trip, ticket to ${to}: ${JSON.stringify(failedChecks(r))}`);
    assert.equal(r.flight.arrivalAirport, code);
  }
  // Pickup away from the airport: the message names the airport the ticket shows
  assert.equal(destination(await verifyUpload(pdf('DEL Delhi', 'NMI Navi Mumbai T1'), 'application/pdf', AWAY)).message, 'Navi Mumbai Airport (NMI) appears on your document.');

  // A return ticket shows both directions: the leg arriving in Mumbai counts
  const returnTicket = await verifyUpload(pdf('DEL Delhi', 'BOM Mumbai T2', ['Return: BOM -> DEL']), 'application/pdf', BOM_TRIP);
  assert.equal(returnTicket.passed, true, JSON.stringify(failedChecks(returnTicket)));
  assert.equal(returnTicket.flight.arrivalAirport, 'BOM');

  // The other Mumbai airport, or not Mumbai at all, are still refused
  assert.match(destination(await verifyUpload(pdf('DEL Delhi', 'NMI Navi Mumbai'), 'application/pdf', BOM_TRIP)).message, /Your ticket is for Navi Mumbai Airport \(NMI\), but your trip is from Mumbai Airport \(BOM\)/);
  assert.deepEqual(failedChecks(await verifyUpload(pdf('DEL Delhi', 'GOI Goa'), 'application/pdf', AWAY)), ['document_destination']);

  // No route printed at all: the airport's name is still enough (direction unknown), as before
  const noRoute = await verifyUpload(T.ticketPdf([...lines({ from: null, to: null }), 'Arriving Mumbai T2']), 'application/pdf', BOM_TRIP);
  assert.equal(noRoute.passed, true, JSON.stringify(failedChecks(noRoute)));
  // ... and for a pickup away from the airport, if both airports are named, which one stays unknown
  const both = await verifyUpload(T.ticketPdf([...lines({ from: null, to: null }), 'Mumbai T2 / Navi Mumbai lounge offer']), 'application/pdf', AWAY);
  assert.equal(both.passed, true, JSON.stringify(failedChecks(both)));
  assert.equal(both.flight.arrivalAirport, null);
});

test('the entered details must still be consistent: airline name and past dates', async () => {
  const wrongAirline = await verifyUpload(T.ticketPdf(lines()), 'application/pdf', { ...TRIP, airline: 'Air India' });
  assert.deepEqual(failedChecks(wrongAirline), ['airline_code']);
  const past = await verifyUpload(T.ticketPdf(lines({ date: '2026-11-01' })), 'application/pdf', { ...TRIP, travelDate: '2026-11-01' });
  assert.deepEqual(failedChecks(past), ['flight_date']);
});

test('a tiny image is unreadable, not approved', async () => {
  const tiny = await sharp(await T.ticketImage(lines())).resize({ width: 150 }).png().toBuffer();
  const r = await verifyUpload(tiny, 'image/png');
  assert.equal(r.passed, false);
  assert.equal(r.extraction.problem, 'too_small');
});

test('the stored extraction holds facts only - never the document text or the passenger name', async () => {
  const r = await verifyUpload(T.ticketPdf(lines()), 'application/pdf');
  const stored = JSON.stringify(r.extraction);
  for (const secret of ['ASHA', 'VERMA', 'X7K2QZ', 'Passenger', 'Seat']) assert.equal(stored.includes(secret), false, secret);
  assert.deepEqual(Object.keys(r.extraction).sort(), ['airportFound', 'boardingPassBarcode', 'confidence', 'dates', 'details', 'flightMatched', 'flightNumbers', 'nameMatched', 'source', 'status']);
});

// ---- extraction details ----------------------------------------------------------------

test('dates are read in the formats tickets use', () => {
  const cases = {
    '20 Dec 2026': '2026-12-20',
    '20-DEC-26': '2026-12-20',
    '20DEC26': '2026-12-20',
    'Sun, 20 December 2026': '2026-12-20',
    'December 20, 2026': '2026-12-20',
    '20/12/2026': '2026-12-20',
    '2026-12-20': '2026-12-20',
    '20 DEC 10:00': '2026-12-20', // no year: the one nearest the trip; "10" is a time, not 2010
  };
  for (const [text, iso] of Object.entries(cases)) assert.deepEqual(findDates(text, '2026-12-20'), [iso], text);
  assert.deepEqual(findDates('31/02/2026 Seat 14C PNR X7K2QZ', '2026-12-20'), []); // not real dates
});

test('OCR look-alikes: "AI 101" read as "Al 101" still matches; other numbers do not', async () => {
  for (const [text, wanted, expected] of [
    ['Flight: Al 101', 'AI101', true],
    ['Flight AI-0101', 'AI101', true],
    ['Flight: GE 2l34', '6E2134', true],
    ['Flight: Al 456', 'AI101', false],
    ['Flight: AI 1010', 'AI101', false],
    ['PNR X7K2QZ Seat 14C', '6E2134', false],
  ]) {
    assert.equal(showsFlightNumber(text, wanted), expected, text);
  }
  // End to end: an Air India ticket image read with OCR (where "I" often comes out as "l")
  const airIndia = await T.ticketImage(lines({ airline: 'Air India', flightNumber: 'AI 101' }), { format: 'jpeg' });
  const r = await verifyUpload(airIndia, 'image/jpeg', { ...TRIP, airline: 'Air India', flightNumber: 'AI 101' });
  assert.equal(r.passed, true, JSON.stringify(r.checks?.filter((c) => !c.passed)));
});

test('flight numbers, names and boarding-pass barcodes are read', () => {
  assert.deepEqual(findFlightNumbers('Flight 6E 2134 / AI-101 / IGO 5321 / PNR X7K2QZ / Seat 14C / T2'), ['6E2134', '6E5321', 'AI101']);
  assert.ok(nameAppears('VERMA/ASHA MS', 'Asha Verma'));
  assert.ok(!nameAppears('SMITH/JOHN MR', 'Asha Verma'));
  const pass = parseBoardingPassBarcode(T.bcbp({ surname: 'VERMA', given: 'ASHA MS' }), '2026-12-20');
  assert.equal(pass.flightNumber, '6E2134');
  assert.equal(pass.from, 'DEL');
  assert.equal(pass.to, 'BOM');
  assert.ok(pass.dates.includes('2026-12-20')); // day 354
  assert.equal(parseBoardingPassBarcode('not a boarding pass', '2026-12-20'), null);
});

// ---- extracted details and the five verification levels ---------------------------

test('the flight details are read off the ticket: airline, flight, departure and arrival airport, date, departure time', async () => {
  const withTime = [...lines(), 'Departure: 07:45   Boarding: 07:05'];
  for (const [bytes, type] of [[T.ticketPdf(withTime), 'application/pdf'], [await T.ticketImage(withTime), 'image/png']]) {
    const r = await verifyUpload(bytes, type);
    assert.equal(r.passed, true, type);
    assert.deepEqual(r.extraction.details, {
      airline: 'IndiGo',
      flightNumber: '6E2134',
      departureAirport: 'DEL',
      arrivalAirport: 'BOM',
      date: '2026-12-20',
      departureTime: '07:45',
    }, type);
  }
  // From a boarding-pass barcode: the airports come from the barcode itself
  const pass = await verifyUpload(await T.ticketImage(['IndiGo BOARDING PASS'], { barcodeText: T.bcbp({ surname: 'VERMA', given: 'ASHA MS' }) }), 'image/png');
  assert.equal(pass.extraction.details.departureAirport, 'DEL');
  assert.equal(pass.extraction.details.arrivalAirport, 'BOM');
  // Not printed -> null, never guessed
  const noTime = await verifyUpload(T.ticketPdf(lines({ from: null })), 'application/pdf');
  assert.equal(noTime.extraction.details.departureTime, null);
  assert.equal(noTime.extraction.details.departureAirport, null);
  // The passenger's name is compared, never kept
  assert.equal(JSON.stringify(noTime.extraction).includes('VERMA'), false);
});

test('five separate levels: file accepted, readable, details extracted, details matched, authenticity (never in demo mode)', async () => {
  const levelsOf = async (bytes, type, trip = TRIP) => verificationLevels('demo', await verifyUpload(bytes, type, trip)).levels;
  const L = (fileAccepted, documentReadable, detailsExtracted, detailsMatched) => ({ fileAccepted, documentReadable, detailsExtracted, detailsMatched, authenticityConfirmed: false });

  assert.deepEqual(await levelsOf(await T.blankImage('#000000'), 'image/jpeg'), L(true, false, false, false)); // black
  assert.deepEqual(await levelsOf(await T.blankImage('#ffffff', 'png'), 'image/png'), L(true, false, false, false)); // white
  assert.deepEqual(await levelsOf(await T.photoImage(), 'image/jpeg'), L(true, true, false, false)); // random photo
  assert.deepEqual(await levelsOf(T.ticketPdf(lines({ flightNumber: null })), 'application/pdf'), L(true, true, false, false)); // missing flight number
  assert.deepEqual(await levelsOf(T.ticketPdf(lines({ flightNumber: '6E 5321' })), 'application/pdf'), L(true, true, true, false)); // other flight
  assert.deepEqual(await levelsOf(T.ticketPdf(lines({ date: '2026-12-27' })), 'application/pdf'), L(true, true, true, false)); // other date
  // a Navi Mumbai ticket for a Mumbai Airport (BOM) trip
  assert.deepEqual(await levelsOf(T.ticketPdf(lines({ to: 'NMI Navi Mumbai T1' })), 'application/pdf', { ...TRIP, airport: 'BOM' }), L(true, true, true, false));
  // Readable, extracted and matching - but NOT authenticated: demo mode reads documents, it can't confirm a booking
  const demo = verificationLevels('demo', await verifyUpload(T.ticketPdf(lines()), 'application/pdf'));
  assert.deepEqual(demo.levels, L(true, true, true, true));
  assert.deepEqual(demo.authenticity, { confirmed: false, source: null, reference: null });
  // Even if a demo result claimed authenticity, it is not accepted
  assert.equal(verificationLevels('demo', { passed: true, authenticity: { confirmed: true, source: 'x' } }).levels.authenticityConfirmed, false);
});

test('authenticity is only set when a non-demo, trusted source confirms (TEST DOUBLE - no real airline provider exists)', () => {
  const extraction = { status: 'read', airportFound: true, details: { flightNumber: '6E2134', date: '2026-12-20', arrivalAirport: 'BOM' } };
  const confirmed = verificationLevels('airline-api-test-double', { passed: true, extraction, authenticity: { confirmed: true, source: 'airline-api-test-double', reference: 'PNR-CHECK-1' } });
  assert.equal(confirmed.levels.authenticityConfirmed, true);
  assert.deepEqual(confirmed.authenticity, { confirmed: true, source: 'airline-api-test-double', reference: 'PNR-CHECK-1' });
  // A provider that matched the details but did not confirm the booking: not authenticated
  assert.equal(verificationLevels('airline-api-test-double', { passed: true, extraction }).levels.authenticityConfirmed, false);
});

// Deployment: the OCR engine's WebAssembly files are loaded by path at runtime,
// so they are listed for Vercel's file tracing. If a tesseract.js upgrade renames
// them, OCR would crash only on the server - catch it here instead.
test('every OCR engine file listed for deployment exists', async () => {
  const fs = await import('node:fs');
  assert.equal(OCR_ENGINE_FILES.length, 6);
  for (const file of OCR_ENGINE_FILES) assert.ok(fs.existsSync(file), `missing: ${file}`);
});
