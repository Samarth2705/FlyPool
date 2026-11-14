// Phase 5: Flight Verification, through the real screens and a real FlyPool
// API (GET/PATCH /trips/:id, POST /trips/:id/verification). Runs for iOS and
// Android (see "projects" in package.json).
//
// Nothing the server says is mocked: every verification result here is the
// server's own. The server READS the document (OCR, PDF text, barcodes) and
// checks it against the trip, so each test uploads a ticket generated for its
// own trip (test/tickets.js) - or deliberately one that doesn't match. Only the phone's native modules are stand-ins
// (file picker, camera, image encoder - see test/setup.js).
import fs from 'node:fs';
import path from 'node:path';
import { Linking } from 'react-native';
import { screen, within } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { act, launchApp, press, signedInUser, typeInto, waitFor } from './helpers';
import { testImage, ticketImage, ticketLines, ticketPdf } from './tickets';

const network = globalThis.network;
const device = globalThis.device;
const MB = 1024 * 1024;
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));
// A screenshot of something else entirely (the React Native developer menu)
const RANDOM_JPG = fixture('random-screenshot.jpg');
// Tickets for a trip: the passenger's name ("Asha Verma"), the flight, the trip's date
const pdfFor = (trip, flight = {}) => ticketPdf(ticketLines({ date: trip.travelDate, ...flight }));
const imageFor = (trip, flight = {}, format = 'png') => ticketImage({ date: trip.travelDate, ...flight }, format);

const auth = (user) => ({ headers: { Authorization: `Bearer ${user.token}` } });
const verifyButton = () => screen.getByTestId('verify');
const verificationPosts = (trip) =>
  network.requests.filter((r) => r.method === 'POST' && r.url === `/trips/${trip.id}/verification`);

// A trip saved through the API (Phase 4 covers creating it in the app)
async function createTrip(user, details = {}) {
  const body = {
    pickupLocation: AIRPORT,
    pickupTerminal: 'T2',
    destination: 'Powai',
    travelDate: addDays(todayInMumbai(), 3),
    expectedArrivalTime: '18:30',
    passengerCount: 1,
    luggageCount: 1,
    openToPooling: true,
    ...details,
  };
  return (await api.post('/trips', body, auth(user))).data.data.trip;
}

// The trip as the server has it in the database
async function serverTrip(user, trip) {
  return (await api.get(`/trips/${trip.id}`, auth(user))).data.data.trip;
}

async function openVerify(details) {
  const user = await signedInUser();
  const trip = await createTrip(user, details);
  network.requests.length = 0; // only what the app sends from here
  await launchApp(`/trip/${trip.id}/verify`);
  await screen.findByTestId('trip-route'); // the trip has loaded
  return { user, trip };
}

// The passenger picks a file in the system picker (copied to the app's cache)
async function uploadFile(name, bytes, mimeType) {
  const uri = device.files.inCache(name, bytes);
  device.documentPicker.answer = { uri, name, mimeType, size: bytes.length };
  await press(screen.getByTestId(screen.queryByTestId('ticket-replace') ? 'ticket-replace' : 'ticket-upload'));
  return uri;
}

async function enterFlight(flightNumber = '6E 2134') {
  await typeInto(screen.getByTestId('flight-number'), flightNumber);
}

async function verifyAndExpectSuccess(trip) {
  await press(verifyButton());
  expect(await screen.findByText('Flight verified successfully.')).toBeTruthy();
  expect(screen.getByText('Find Travellers')).toBeTruthy(); // Phase 6 (test/travellers.test.js)
  expect(screen).toHavePathname(`/trip/${trip.id}/matches`);
  expect(screen.getByText(/passed FlyPool’s demo checks\. This is not a confirmation from the airline\./)).toBeTruthy();
  // The verified details, as the server saved them, one tap away. (Other
  // tests' trips can appear as travellers here, so look inside the card.)
  await press(screen.getByText('Show trip details'));
  return within(screen.getByTestId('verified-flight'));
}

const sentDocument = (trip) => JSON.parse(verificationPosts(trip).at(-1).data).document;

// Holds the real verification request back until release()
function holdVerification() {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.url.endsWith('/verification')) await gate;
    return adapter(config);
  });
  return () => act(async () => release());
}

afterEach(() => jest.restoreAllMocks());

// ---- 1, 2: access ------------------------------------------------------------

test('after Trip Details, the real trip id opens Flight Verification', async () => {
  const user = await signedInUser();
  const trip = await createTrip(user, { destination: 'Juhu' });
  await launchApp(`/trip/${trip.id}/verify?created=1`);
  expect(await screen.findByText('Trip saved')).toBeTruthy();
  expect(screen.getByTestId('trip-route')).toHaveTextContent('Mumbai Airport (BOM) · T2 → Juhu');
  expect(network.requests.find((r) => r.url === `/trips/${trip.id}`).authorization).toBe(`Bearer ${user.token}`);
  // Header: back + account menu
  expect(screen.getByLabelText('Back')).toBeTruthy();
  expect(screen.getByLabelText(`Account menu for ${user.name}`)).toBeTruthy();
  // What's already known is filled in
  expect(screen.getByLabelText('Scheduled landing time: 6:30 pm')).toBeTruthy();
  expect(screen.getByLabelText('Drop area: Juhu')).toBeTruthy();
  expect(screen.getByText(/up to 3 MB/)).toBeTruthy();
});

test('logged-out users cannot open Flight Verification', async () => {
  await launchApp('/trip/6aedec0f29d61f45c07c8082/verify');
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(screen).toHavePathname('/login');
  expect(network.requests.filter((r) => r.url.startsWith('/trips'))).toEqual([]);
});

test("someone else's trip is not found", async () => {
  const owner = await signedInUser();
  const trip = await createTrip(owner);
  await signedInUser(); // a different passenger is logged in on this phone
  await launchApp(`/trip/${trip.id}/verify`);
  expect(await screen.findByText('Trip not found.')).toBeTruthy();
  expect(screen.queryByTestId('verify')).toBeNull();
});

// ---- 3, 4, 10, 11, 12: uploads and a successful verification --------------

test('PDF e-ticket: picked, shown, sent with the trip id and token, trip verified in the database', async () => {
  const { user, trip } = await openVerify();
  const PDF = pdfFor(trip);
  const uri = await uploadFile('e-ticket.pdf', PDF, 'application/pdf');

  expect(await screen.findByTestId('ticket-pdf')).toBeTruthy();
  expect(screen.getByTestId('ticket-name')).toHaveTextContent('e-ticket.pdf');
  expect(screen.getByTestId('ticket-info')).toHaveTextContent('PDF · 1 KB');
  expect(device.documentPicker.calls[0]).toMatchObject({
    type: expect.arrayContaining(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    copyToCacheDirectory: true,
    multiple: false,
  });

  await enterFlight('6e 2134');
  expect(screen.getByTestId('airline').props.value).toBe('IndiGo'); // filled from the code
  expect(screen.getByText('6E is IndiGo.')).toBeTruthy();
  const result = await verifyAndExpectSuccess(trip);

  // The request: the right trip, the token, the exact backend body
  const [post] = verificationPosts(trip);
  expect(post.authorization).toBe(`Bearer ${user.token}`);
  expect(JSON.parse(post.data)).toEqual({
    airline: 'IndiGo',
    flightNumber: '6E 2134',
    scheduledArrivalTime: '18:30',
    document: { mimeType: 'application/pdf', dataBase64: PDF.toString('base64') },
  });
  expect(device.encoder.calls).toEqual([]); // a PDF is never re-encoded

  // Saved by the server
  const saved = await serverTrip(user, trip);
  expect(saved.status).toBe('flight_verified');
  expect(saved.flight).toMatchObject({ airline: 'IndiGo', flightNumber: '6E2134', scheduledArrivalTime: '18:30', arrivalAirport: 'BOM', arrivalTerminal: 'T2' });
  expect(saved.verification).toMatchObject({ status: 'verified', method: 'demo', document: { kind: 'pdf', sizeBytes: PDF.length } });
  // What the server read from it - facts only, not the text or the name
  expect(saved.verification.extraction).toMatchObject({ status: 'read', source: 'pdf_text', flightNumbers: ['6E2134'], nameMatched: true, airportFound: true });
  expect(saved.verification.extraction.dates).toContain(trip.travelDate);
  expect(JSON.stringify(saved)).not.toContain('ASHA VERMA');
  expect(JSON.stringify(saved)).not.toContain(PDF.toString('base64').slice(0, 40)); // the document itself isn't stored

  // The result screen shows what the server saved - and doesn't overclaim
  expect(result.getByText('6E 2134')).toBeTruthy();
  expect(result.getByText('PDF e-ticket checked, not stored')).toBeTruthy();
  expect(result.getByText(/This is not a confirmation from the airline/)).toBeTruthy();
  expect(device.files.exists(uri)).toBe(false); // temporary copy deleted
});

test('JPG boarding pass: preview shown, sent unchanged', async () => {
  const { user, trip } = await openVerify();
  const JPG = imageFor(trip, { airline: 'Air India', flightNumber: 'AI 101' }, 'jpeg');
  const uri = await uploadFile('boarding-pass.jpg', JPG, 'image/jpeg');
  const preview = await screen.findByTestId('ticket-preview');
  expect(preview.props.source).toEqual({ uri });
  expect(screen.getByTestId('ticket-info')).toHaveTextContent(`Image · ${Math.round(JPG.length / 1024)} KB`);

  await enterFlight('AI 101');
  expect(screen.getByTestId('airline').props.value).toBe('Air India');
  const result = await verifyAndExpectSuccess(trip);
  expect(sentDocument(trip)).toEqual({ mimeType: 'image/jpeg', dataBase64: JPG.toString('base64') });
  const saved = (await serverTrip(user, trip)).verification;
  expect(saved.document).toMatchObject({ kind: 'image', sizeBytes: JPG.length });
  expect(saved.extraction).toMatchObject({ status: 'read', source: 'ocr', flightMatched: true }); // read with OCR
  expect(result.getByText('Photo checked, not stored')).toBeTruthy();
});

test('PNG screenshot: sent as PNG', async () => {
  const { user, trip } = await openVerify();
  const PNG = imageFor(trip, { airline: 'Akasa Air', flightNumber: 'QP 1402' });
  await uploadFile('Screenshot 2026-11-06.png', PNG, 'image/png');
  expect(await screen.findByTestId('ticket-preview')).toBeTruthy();
  await enterFlight('QP 1402');
  await verifyAndExpectSuccess(trip);
  expect(sentDocument(trip)).toEqual({ mimeType: 'image/png', dataBase64: PNG.toString('base64') });
  expect((await serverTrip(user, trip)).status).toBe('flight_verified');
});

test('a file with no type is recognised by its extension', async () => {
  const { trip } = await openVerify();
  await uploadFile('ticket.PDF', pdfFor(trip), undefined); // some Android pickers leave the type out
  expect(await screen.findByTestId('ticket-pdf')).toBeTruthy();
  await enterFlight();
  await verifyAndExpectSuccess(trip);
  expect(sentDocument(trip).mimeType).toBe('application/pdf');
});

// ---- 5, 6: camera ------------------------------------------------------------

test('camera: asks permission, takes the photo, and it verifies', async () => {
  const { user, trip } = await openVerify();
  device.camera.onRequest = { granted: true, canAskAgain: true, status: 'granted' };
  // A phone photo of a printed ticket: grain, blur, the table around it
  const JPG = testImage({ kind: 'phonePhoto', lines: ticketLines({ date: trip.travelDate, airline: 'SpiceJet', flightNumber: 'SG 8152' }) });
  const uri = device.files.inCache('photo-1.jpg', JPG);
  device.camera.answer = { uri, width: 1200, height: 900, fileName: 'photo-1.jpg', mimeType: 'image/jpeg', fileSize: JPG.length };

  await press(screen.getByTestId('ticket-camera'));
  const preview = await screen.findByTestId('ticket-preview');
  expect(preview.props.source).toEqual({ uri });
  expect(device.camera.requests).toBe(1);
  expect(device.camera.launches[0]).toMatchObject({ mediaTypes: 'images', allowsEditing: false });

  await enterFlight('SG 8152');
  await verifyAndExpectSuccess(trip);
  expect(sentDocument(trip).mimeType).toBe('image/jpeg');
  expect((await serverTrip(user, trip)).verification.document.kind).toBe('image');
  expect(device.files.exists(uri)).toBe(false);
});

test('camera permission refused: explained, camera not opened, upload still possible', async () => {
  const { trip } = await openVerify();
  device.camera.onRequest = { granted: false, canAskAgain: true, status: 'denied' };
  await press(screen.getByTestId('ticket-camera'));
  expect(await screen.findByText(/FlyPool needs the camera to photograph your ticket/)).toBeTruthy();
  expect(device.camera.launches).toEqual([]);
  expect(screen.queryByTestId('open-settings')).toBeNull(); // can still be asked next time

  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  expect(await screen.findByTestId('ticket-pdf')).toBeTruthy();
  expect(screen.queryByTestId('ticket-error')).toBeNull();
});

test('camera permission turned off in Settings: offers to open Settings, never re-prompts', async () => {
  await openVerify();
  device.camera.permission = { granted: false, canAskAgain: false, status: 'denied', expires: 'never' };
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();

  await press(screen.getByTestId('ticket-camera'));
  expect(await screen.findByText(/Camera access is turned off for FlyPool/)).toBeTruthy();
  expect(device.camera.requests).toBe(0);
  await press(screen.getByTestId('open-settings'));
  expect(openSettings).toHaveBeenCalled();
});

test('closing the camera or the file picker without choosing changes nothing', async () => {
  await openVerify();
  device.camera.permission = { granted: true, canAskAgain: true, status: 'granted', expires: 'never' };
  await press(screen.getByTestId('ticket-camera')); // answer null: cancelled
  await press(screen.getByTestId('ticket-upload')); // answer null: cancelled
  await waitFor(() => expect(device.documentPicker.calls).toHaveLength(1));
  expect(screen.queryByTestId('ticket-selected')).toBeNull();
  expect(screen.queryByTestId('ticket-error')).toBeNull();
});

// ---- 7, 8: size and type limits ---------------------------------------------

test('a PDF over 3 MB is refused before anything is sent', async () => {
  const { trip } = await openVerify();
  const big = Buffer.concat([pdfFor(trip), Buffer.alloc(3.5 * MB, 0x20)]);
  const uri = await uploadFile('scanned-ticket.pdf', big, 'application/pdf');

  expect(await screen.findByText(/That PDF is larger than 3 MB/)).toBeTruthy();
  expect(screen.queryByTestId('ticket-selected')).toBeNull();
  expect(device.encoder.calls).toEqual([]); // PDFs are never "compressed"
  expect(device.files.exists(uri)).toBe(false);

  await enterFlight();
  await press(verifyButton());
  expect(screen.getByText(/That PDF is larger than 3 MB/)).toBeTruthy(); // still says why
  expect(verificationPosts(trip)).toEqual([]);
});

test('a large photo is made smaller (JPEG) so it fits, and verifies', async () => {
  const { trip } = await openVerify();
  const JPG = imageFor(trip, {}, 'jpeg');
  device.encoder.output = JPG; // what the (stand-in) encoder makes of it
  const big = Buffer.concat([JPG, Buffer.alloc(4 * MB)]); // a 4 MB+ photo
  const original = await uploadFile('IMG_2041.jpg', big, 'image/jpeg');

  expect(await screen.findByTestId('ticket-preview')).toBeTruthy();
  expect(screen.getByTestId('ticket-info')).toHaveTextContent(/made smaller for upload/);
  expect(device.encoder.calls).toEqual([
    expect.objectContaining({ uri: original, maxWidth: 2048, maxHeight: 2048, format: 'jpeg', compress: 0.8 }),
  ]);
  expect(device.files.exists(original)).toBe(false); // only the smaller copy is kept

  await enterFlight();
  await verifyAndExpectSuccess(trip);
  const sent = Buffer.from(sentDocument(trip).dataBase64, 'base64');
  expect(sentDocument(trip).mimeType).toBe('image/jpeg');
  expect(sent.length).toBeLessThanOrEqual(3 * MB);
  expect(sent.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
});

test('a photo that stays over 3 MB after compressing is refused, not uploaded', async () => {
  const { trip } = await openVerify();
  device.encoder.output = Buffer.concat([RANDOM_JPG, Buffer.alloc(3.2 * MB)]); // the encoder can't get it small enough
  await uploadFile('panorama.jpg', Buffer.concat([RANDOM_JPG, Buffer.alloc(5 * MB)]), 'image/jpeg');

  expect(await screen.findByText(/still larger than 3 MB after making it smaller/)).toBeTruthy();
  expect(device.encoder.calls.map((c) => [c.maxWidth, c.compress])).toEqual([
    [2048, 0.8],
    [1600, 0.7],
    [1280, 0.6],
  ]);
  expect(device.files.cacheFiles()).toEqual([]); // every attempt cleaned up
  expect(verificationPosts(trip)).toEqual([]);
});

test('an iPhone HEIC photo is converted to JPEG', async () => {
  const { trip } = await openVerify();
  device.encoder.output = imageFor(trip, {}, 'jpeg'); // the HEIC photo, converted
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(2000)]);
  await uploadFile('IMG_0042.HEIC', heic, 'image/heic');

  expect(await screen.findByTestId('ticket-name')).toHaveTextContent('IMG_0042.jpg');
  expect(device.encoder.calls[0]).toMatchObject({ format: 'jpeg' });
  await enterFlight();
  await verifyAndExpectSuccess(trip);
  expect(sentDocument(trip).mimeType).toBe('image/jpeg');
});

// ---- Phase 15: the document must really be a matching ticket -------------------

test('a random screenshot is refused: the server’s reason is shown and the trip stays unverified', async () => {
  const { user, trip } = await openVerify();
  await uploadFile('Screenshot.jpg', RANDOM_JPG, 'image/jpeg');
  await enterFlight();
  await press(verifyButton());

  expect(await screen.findByText('Your flight couldn’t be verified')).toBeTruthy();
  expect(screen.getByText(/doesn’t look like a boarding pass or e-ticket/)).toBeTruthy();
  expect(screen.queryByText('Flight verified successfully.')).toBeNull();
  expect(screen).toHavePathname(`/trip/${trip.id}/verify`);
  const saved = await serverTrip(user, trip);
  expect(saved.status).toBe('awaiting_verification');
  expect(saved.verification.status).toBe('failed');
});

test('a completely black photo is refused as blank', async () => {
  const { user, trip } = await openVerify();
  await uploadFile('photo.jpg', testImage({ kind: 'blank', colour: '#000000', format: 'jpeg' }), 'image/jpeg');
  await enterFlight();
  await press(verifyButton());
  expect(await screen.findByText(/Your document looks blank/)).toBeTruthy();
  expect((await serverTrip(user, trip)).status).toBe('awaiting_verification');
});

test('a ticket for another flight or another day is refused, with what the ticket shows', async () => {
  const { user, trip } = await openVerify();
  await uploadFile('e-ticket.pdf', pdfFor(trip, { flightNumber: '6E 5321' }), 'application/pdf');
  await enterFlight('6E 2134');
  await press(verifyButton());
  expect(await screen.findByText(/Your document shows flight 6E 5321, not 6E 2134/)).toBeTruthy();

  const [y, m, d] = trip.travelDate.split('-').map(Number);
  const otherDay = new Date(Date.UTC(y, m - 1, d + 5)).toISOString().slice(0, 10);
  await uploadFile('e-ticket.pdf', ticketPdf(ticketLines({ date: otherDay })), 'application/pdf');
  await press(verifyButton());
  expect(await screen.findByText(/but your trip is on/)).toBeTruthy();
  expect((await serverTrip(user, trip)).status).toBe('awaiting_verification');
});

test('unsupported file types are refused', async () => {
  const { trip } = await openVerify();
  for (const [name, type] of [
    ['notes.txt', 'text/plain'],
    ['ticket.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['animation.gif', 'image/gif'],
  ]) {
    const uri = await uploadFile(name, Buffer.from('not a ticket'), type);
    expect(await screen.findByText('Please choose a JPG, PNG, WebP or PDF file.')).toBeTruthy();
    expect(screen.queryByTestId('ticket-selected')).toBeNull();
    expect(device.files.exists(uri)).toBe(false);
  }
  expect(verificationPosts(trip)).toEqual([]);
});

test('a file that only pretends to be a PDF is rejected by the server, shown on the document', async () => {
  const { user, trip } = await openVerify();
  await uploadFile('ticket.pdf', Buffer.from('this is really a text file'), 'application/pdf');
  await enterFlight();
  await press(verifyButton());

  expect(await screen.findByText('This file is not a valid JPG, PNG, WebP or PDF document.')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/verify`);
  expect((await serverTrip(user, trip)).status).toBe('awaiting_verification');
});

// ---- 9: drop area ------------------------------------------------------------

test('drop area: search, pick from the list, or use an area that is not listed', async () => {
  const { user, trip } = await openVerify();
  await press(screen.getByTestId('drop-area-field'));
  await typeInto(screen.getByTestId('drop-area-search'), 'and');
  expect(screen.getByLabelText('Andheri West, Mumbai')).toBeTruthy();
  expect(screen.getByLabelText('Andheri East, Mumbai')).toBeTruthy();
  // Navi Mumbai areas are listed too, in their own group
  await typeInto(screen.getByTestId('drop-area-search'), 'kharghar');
  expect(screen.getByLabelText('Kharghar, Navi Mumbai')).toBeTruthy();
  await typeInto(screen.getByTestId('drop-area-search'), 'and');
  expect(screen.queryByLabelText('Bandra West, Mumbai')).toBeNull();
  await press(screen.getByLabelText('Andheri West, Mumbai'));
  expect(screen.getByLabelText('Drop area: Andheri West')).toBeTruthy();
  expect(screen.queryByTestId('drop-area-search')).toBeNull(); // closed

  await press(screen.getByTestId('drop-area-field'));
  await typeInto(screen.getByTestId('drop-area-search'), 'Versova');
  expect(screen.queryByLabelText('Versova, Mumbai')).toBeNull(); // not on the shared list...
  await press(screen.getByLabelText('Use Versova')); // ...but any area is allowed
  expect(screen.getByLabelText('Drop area: Versova')).toBeTruthy();
  expect(screen.getByText('Your trip will be updated with this drop area.')).toBeTruthy();

  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  await enterFlight();
  const result = await verifyAndExpectSuccess(trip);

  // The drop area is the trip's destination: saved first, with the existing PATCH
  const writes = network.requests.filter((r) => ['PATCH', 'POST'].includes(r.method) && r.url.startsWith(`/trips/${trip.id}`));
  expect(writes.map((r) => [r.method, r.url])).toEqual([
    ['PATCH', `/trips/${trip.id}`],
    ['POST', `/trips/${trip.id}/verification`],
  ]);
  expect(JSON.parse(writes[0].data)).toEqual({ destination: 'Versova' });
  expect(writes[0].authorization).toBe(`Bearer ${user.token}`);
  const saved = await serverTrip(user, trip);
  expect(saved).toMatchObject({ destination: 'Versova', status: 'flight_verified' });
  expect(result.getByText('Versova')).toBeTruthy(); // on the result
});

test('an unchanged drop area is not re-sent', async () => {
  const { trip } = await openVerify();
  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  await enterFlight();
  await verifyAndExpectSuccess(trip);
  expect(network.requests.filter((r) => r.method === 'PATCH')).toEqual([]);
});

test('the drop area cannot be the pickup point', async () => {
  const { trip } = await openVerify({ pickupLocation: 'Hotel Sahara Star', pickupTerminal: null });
  await press(screen.getByTestId('drop-area-field'));
  await typeInto(screen.getByTestId('drop-area-search'), 'hotel sahara star');
  await press(screen.getByLabelText('Use hotel sahara star'));
  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  await enterFlight();
  await press(verifyButton());
  expect(screen.getByText('Destination must be different from the pickup location.')).toBeTruthy();
  expect(network.requests.filter((r) => r.method !== 'GET' && r.url.startsWith(`/trips/${trip.id}`))).toEqual([]);
});

// ---- 13: failed verification and validation --------------------------------

test('missing details are listed and nothing is sent', async () => {
  const { trip } = await openVerify();
  await press(verifyButton());
  expect(screen.getByText('Enter a flight number like 6E 2134 or AI 101 (airline code + up to 4 digits).')).toBeTruthy();
  expect(screen.getByText('Enter your airline.')).toBeTruthy();
  expect(screen.getByText('Add a photo or file of your boarding pass or e-ticket.')).toBeTruthy();
  expect(network.requests.filter((r) => r.method !== 'GET')).toEqual([]);
  expect(screen).toHavePathname(`/trip/${trip.id}/verify`);
});

test('a failed check shows the server’s message; fixing it and retrying works', async () => {
  const { user, trip } = await openVerify();
  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  await enterFlight('6E 2134');
  await typeInto(screen.getByTestId('airline'), 'Air India'); // doesn't match the 6E code

  await press(verifyButton());
  expect(await screen.findByText('Your flight couldn’t be verified')).toBeTruthy();
  expect(screen.getByText(/6E2134 is operated by IndiGo, but the airline entered is "Air India"\./)).toBeTruthy();
  expect(screen.queryByText('Flight verified successfully.')).toBeNull();
  expect(screen).toHavePathname(`/trip/${trip.id}/verify`);
  const failed = await serverTrip(user, trip);
  expect(failed.status).toBe('awaiting_verification');
  expect(failed.verification.status).toBe('failed');
  expect(screen.getByTestId('ticket-selected')).toBeTruthy(); // the document is still here

  await typeInto(screen.getByTestId('airline'), 'IndiGo');
  expect(verifyButton()).toHaveTextContent('Try again');
  await verifyAndExpectSuccess(trip);
  expect(verificationPosts(trip)).toHaveLength(2);
});

test('an airline code the server cannot check is reported as such', async () => {
  const { trip } = await openVerify();
  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  await enterFlight('ZZ 123');
  expect(screen.getByText('Airline code ZZ isn’t one we can check yet.')).toBeTruthy();
  await typeInto(screen.getByTestId('airline'), 'Zed Air');
  await press(verifyButton());
  expect(await screen.findByText(/We can't check flights with airline code ZZ yet/)).toBeTruthy();
});

// ---- 14: duplicates, network failures --------------------------------------

test('tapping Verify repeatedly sends one request', async () => {
  const { user, trip } = await openVerify();
  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  await enterFlight();

  const release = holdVerification();
  await press(verifyButton());
  expect(await screen.findByText(/Uploading your document…|Checking your flight details…/)).toBeTruthy();
  expect(verifyButton().props.accessibilityState).toEqual({ disabled: true, busy: true });
  await press(verifyButton());
  await press(verifyButton());
  await release();

  expect(await screen.findByText('Flight verified successfully.')).toBeTruthy();
  expect(verificationPosts(trip)).toHaveLength(1);
  expect((await serverTrip(user, trip)).verification.status).toBe('verified');
});

test('offline: nothing is retried automatically; the passenger retries by hand', async () => {
  const { trip } = await openVerify();
  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  await enterFlight();

  network.mode = 'offline';
  await press(verifyButton());
  expect(await screen.findByText('We couldn’t verify your flight right now')).toBeTruthy();
  expect(screen.getByText(/Your details and document are still here/)).toBeTruthy();
  await act(() => new Promise((resolve) => setTimeout(resolve, 1500)));
  expect(verificationPosts(trip)).toHaveLength(1); // no automatic retry
  expect(screen.getByTestId('ticket-selected')).toBeTruthy();

  network.mode = 'online';
  await verifyAndExpectSuccess(trip);
  expect(verificationPosts(trip)).toHaveLength(2);
});

test('a lost response: retrying finds the flight already verified - shown from the server, not assumed', async () => {
  const { user, trip } = await openVerify();
  await uploadFile('e-ticket.pdf', pdfFor(trip), 'application/pdf');
  await enterFlight();

  network.mode = 'lose-response'; // the server verifies; the answer never arrives
  await press(verifyButton());
  expect(await screen.findByText('We couldn’t verify your flight right now')).toBeTruthy();
  network.mode = 'online';
  expect((await serverTrip(user, trip)).status).toBe('flight_verified');

  await press(verifyButton()); // 409 ALREADY_VERIFIED -> the trip is reloaded
  expect(await screen.findByText('Your flight is verified')).toBeTruthy();
  expect(screen.getByTestId('verified-flight')).toBeTruthy();
  await press(screen.getByText('Continue'));
  expect(await screen.findByText('Flight verified successfully.')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/matches`);
});

// ---- privacy -----------------------------------------------------------------

test('ticket contents and the token never reach the logs', async () => {
  const { user, trip } = await openVerify();
  const logs = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    jest.spyOn(console, level).mockImplementation((...args) => logs.push(args.map(String).join(' ')));
  }
  const PDF = pdfFor(trip);
  await uploadFile('e-ticket.pdf', PDF, 'application/pdf');
  await enterFlight();
  await verifyAndExpectSuccess(trip);
  const all = logs.join('\n');
  expect(all).not.toContain('ASHA VERMA'); // nor what was read from it
  expect(all).not.toContain(PDF.toString('base64').slice(0, 24));
  expect(all).not.toContain(user.token);
});

test('temporary copies are deleted on Remove, on Replace and when leaving the screen', async () => {
  const { trip } = await openVerify();
  const PDF = pdfFor(trip);
  const first = await uploadFile('first.pdf', PDF, 'application/pdf');
  expect(await screen.findByTestId('ticket-pdf')).toBeTruthy();
  await press(screen.getByTestId('ticket-remove'));
  expect(screen.queryByTestId('ticket-selected')).toBeNull();
  expect(device.files.exists(first)).toBe(false);

  const second = await uploadFile('second.pdf', PDF, 'application/pdf');
  await screen.findByTestId('ticket-pdf');
  const third = await uploadFile('third.jpg', RANDOM_JPG, 'image/jpeg'); // Replace
  await screen.findByTestId('ticket-preview');
  expect(device.files.exists(second)).toBe(false);
  expect(device.files.exists(third)).toBe(true);

  await press(screen.getByLabelText('Back'));
  expect(await screen.findByText('Where are you headed?')).toBeTruthy();
  expect(device.files.exists(third)).toBe(false);
});

// ---- the next screen ---------------------------------------------------------

test('an already verified trip shows its result instead of the form', async () => {
  const user = await signedInUser();
  const trip = await createTrip(user);
  await api.post(
    `/trips/${trip.id}/verification`,
    { airline: 'IndiGo', flightNumber: '6E 2134', scheduledArrivalTime: '19:05', document: { mimeType: 'application/pdf', dataBase64: pdfFor(trip).toString('base64') } },
    auth(user),
  );
  await launchApp(`/trip/${trip.id}/verify`);
  expect(await screen.findByText('Your flight is verified')).toBeTruthy();
  expect(screen.getByText('7:05 pm')).toBeTruthy();
  expect(screen.queryByTestId('verify')).toBeNull();
});

test('the next screen never shows success for a trip that is not verified', async () => {
  const user = await signedInUser();
  const trip = await createTrip(user);
  await launchApp(`/trip/${trip.id}/matches`);
  expect(await screen.findByText('This flight isn’t verified yet')).toBeTruthy();
  expect(screen.queryByText('Flight verified successfully.')).toBeNull();
  await press(screen.getByText('Verify your flight'));
  expect(await screen.findByTestId('verify')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/verify`);
});
