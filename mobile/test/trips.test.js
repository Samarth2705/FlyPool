// Phase 4: the Trip Details screen, through the real screens and a real
// FlyPool API (POST /trips, GET /trips/:id). Runs for iOS and Android (see
// "projects" in package.json). No API response is mocked: every trip here is
// created by the server and read back from its database.
import { Alert, Platform } from 'react-native';
import { screen } from 'expo-router/testing-library';
import api from '../src/api/client';
import { addDays, formatDate, todayInMumbai } from '../src/shared/dates';
import { isoToPickerDate } from '../src/utils/pickerDates';
import { act, chooseDestination, enterDestination, fireEvent, launchApp, press, signedInUser, typeInto, waitFor } from './helpers';

const network = globalThis.network;
const nativePicker = globalThis.nativePicker;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const tripPosts = () => network.requests.filter((r) => r.method === 'POST' && r.url === '/trips');
const continueButton = () => screen.getByTestId('continue');
const isDisabled = (element) => Boolean(element.props.accessibilityState?.disabled);

// The user's trips as the server has them in the database (outside the app)
async function serverTrips(user) {
  const response = await api.get('/trips', { headers: { Authorization: `Bearer ${user.token}` } });
  return response.data.data.trips;
}

// Holds the real POST /trips back until release() - to act while it's in flight
function holdTripRequest() {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.method === 'post' && config.url === '/trips') await gate;
    return adapter(config);
  });
  return () => act(async () => release());
}

async function openTripDetails() {
  const user = await signedInUser();
  await launchApp('/');
  await screen.findByText('Where are you headed?');
  return user;
}

// Choose a date / time the way a passenger does on this platform:
// Android - the system dialog (native module, see test/setup.js)
// iOS     - the bottom sheet with the native picker view, then "Done"
async function pick(fieldLabel, mode, date) {
  const field = screen.getByLabelText(new RegExp(`^${fieldLabel}:`));
  if (Platform.OS === 'android') {
    nativePicker.answer = date;
    await press(field);
    return;
  }
  await press(field);
  const picker = await screen.findByTestId(`${mode}-picker`);
  await act(async () => {
    fireEvent(picker, 'change', { nativeEvent: { timestamp: date.getTime() } });
  });
  await press(screen.getByText('Done'));
}

const IN_3_DAYS = () => addDays(todayInMumbai(), 3);

async function fillValidTrip({ destination = 'Powai', date = IN_3_DAYS() } = {}) {
  await press(screen.getByTestId('terminal-T2'));
  await enterDestination(destination);
  await pick('Travel date', 'date', isoToPickerDate(date));
  await pick('Expected landing time', 'time', new Date(2000, 0, 1, 18, 30));
  await waitFor(() => expect(isDisabled(continueButton())).toBe(false));
}

afterEach(() => jest.restoreAllMocks());

// ---- 1, 2: access ------------------------------------------------------------

test('a logged-in user lands on Trip Details, with the logo and account menu', async () => {
  const user = await openTripDetails();
  expect(screen).toHavePathname('/');
  expect(screen.getAllByLabelText('FlyPool').length).toBeGreaterThan(0);
  await press(screen.getByLabelText(`Account menu for ${user.name}`));
  expect(screen.getByText(user.email)).toBeTruthy();
  expect(screen.getByText('Log out')).toBeTruthy(); // logout itself: test/auth.test.js
});

test('logged-out users cannot open Trip Details', async () => {
  await launchApp('/');
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(screen).toHavePathname('/login');
  expect(screen.queryByText('Where are you headed?')).toBeNull();
});

test('logged-out users cannot open a trip screen by its link', async () => {
  await launchApp('/trip/6aedec0f29d61f45c07c8082/verify');
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(screen).toHavePathname('/login');
  expect(network.requests.filter((r) => r.url.startsWith('/trips'))).toEqual([]);
});

test('a session that ends while filling the form goes back to login without saving', async () => {
  const user = await openTripDetails();
  await fillValidTrip();
  await api.post('/auth/logout', undefined, { headers: { Authorization: `Bearer ${user.token}` } }); // revoked elsewhere

  await press(continueButton());
  expect(await screen.findByText('Your session has ended')).toBeTruthy();
  expect(screen).toHavePathname('/login');
  expect(tripPosts()).toHaveLength(1); // tried once, refused (401)

  // Logging in again brings the typed details back - nothing silently lost
  await typeInto(screen.getByLabelText('Email'), user.email);
  await typeInto(screen.getByLabelText('Password'), user.password);
  await press(screen.getByText('Log in'));
  expect(await screen.findByText('Where are you headed?')).toBeTruthy();
  expect(screen.getByLabelText('Destination: Powai')).toBeTruthy();
  expect(screen.getByTestId('terminal-T2').props.accessibilityState.checked).toBe(true);
  await waitFor(() => expect(isDisabled(continueButton())).toBe(false));
  await press(continueButton());
  await waitFor(async () => expect(await serverTrips(user)).toHaveLength(1));
});

test('an unsaved trip form is never shown to another account, and is forgotten on logout', async () => {
  const first = await openTripDetails();
  await chooseDestination('Bandra West');
  // Log out on purpose from the account menu
  await press(screen.getByLabelText(`Account menu for ${first.name}`));
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    buttons.find((b) => b.style === 'destructive').onPress();
  });
  await press(screen.getByText('Log out'));
  expect(await screen.findByText('Welcome back')).toBeTruthy();

  // Same account again: the form starts empty (logout forgets it)
  await typeInto(screen.getByLabelText('Email'), first.email);
  await typeInto(screen.getByLabelText('Password'), first.password);
  await press(screen.getByText('Log in'));
  expect(await screen.findByText('Where are you headed?')).toBeTruthy();
  expect(screen.getByLabelText('Destination: not chosen')).toBeTruthy();
});

// ---- 3, 4, 5: the fields -----------------------------------------------------

test('pickup: airport terminals, or another pickup point', async () => {
  await openTripDetails();
  expect(screen.getByText('Mumbai Airport (BOM)')).toBeTruthy();

  await press(screen.getByTestId('terminal-T1'));
  expect(screen.getByTestId('terminal-T1').props.accessibilityState.checked).toBe(true);
  await press(screen.getByTestId('terminal-T2'));
  expect(screen.getByTestId('terminal-T1').props.accessibilityState.checked).toBe(false);
  expect(screen.getByTestId('terminal-T2').props.accessibilityState.checked).toBe(true);

  await press(screen.getByText('Not at the airport? Use another pickup point'));
  await typeInto(screen.getByTestId('pickup-input'), 'Hotel Sahara Star');
  expect(screen.getByTestId('pickup-input').props.value).toBe('Hotel Sahara Star');

  await press(screen.getByText('Use Mumbai Airport (BOM) instead'));
  expect(screen.getByTestId('terminal-T2').props.accessibilityState.checked).toBe(false); // choose again
});

test('destination: a searchable list grouped as Mumbai and Navi Mumbai, plus Others', async () => {
  await openTripDetails();
  await press(screen.getByTestId('destination-field'));
  for (const group of ['Mumbai', 'Navi Mumbai']) expect(screen.getByRole('header', { name: group })).toBeTruthy();
  expect(screen.getByTestId('destination-others')).toBeTruthy(); // in view without scrolling
  for (const area of ['Colaba, Mumbai', 'Cuffe Parade, Mumbai', 'Vashi, Navi Mumbai', 'Kharghar, Navi Mumbai', 'Taloja, Navi Mumbai']) {
    expect(screen.getByLabelText(area)).toBeTruthy();
  }

  // Search from the start of any word: "and" finds Andheri, not Bandra
  await typeInto(screen.getByTestId('destination-search'), 'and');
  expect(screen.getByLabelText('Andheri West, Mumbai')).toBeTruthy();
  expect(screen.getByLabelText('Andheri, Mumbai')).toBeTruthy();
  expect(screen.queryByLabelText('Bandra West, Mumbai')).toBeNull();
  expect(screen.getByTestId('destination-others')).toBeTruthy(); // always offered
  await typeInto(screen.getByTestId('destination-search'), 'kh');
  expect(screen.getByLabelText('Kharghar, Navi Mumbai')).toBeTruthy();
  expect(screen.getByLabelText('Kopar Khairane, Navi Mumbai')).toBeTruthy();
  expect(screen.queryByRole('header', { name: 'Mumbai' })).toBeNull(); // no Mumbai matches: that group is hidden
  await typeInto(screen.getByTestId('destination-search'), 'csmt');
  await press(screen.getByLabelText('CST / CSMT, Mumbai'));
  expect(screen.getByLabelText('Destination: CST / CSMT')).toBeTruthy();
  expect(screen.queryByTestId('destination-search')).toBeNull(); // closed
  expect(screen.queryByTestId('destination-input')).toBeNull(); // no text field for a listed area

  await chooseDestination('Kharghar');
  expect(screen.getByLabelText('Destination: Kharghar')).toBeTruthy();
});

test('Others: the destination must be typed; it is saved as typed (trimmed) and kept when editing', async () => {
  const user = await openTripDetails();
  await press(screen.getByTestId('terminal-T2'));
  await press(screen.getByTestId('destination-field'));
  await press(screen.getByTestId('destination-others'));
  expect(screen.getByLabelText('Destination: Others')).toBeTruthy();
  expect(screen.getByTestId('destination-input').props.value).toBe(''); // never "Others" itself
  await pick('Travel date', 'date', isoToPickerDate(IN_3_DAYS()));
  await pick('Expected landing time', 'time', new Date(2000, 0, 1, 18, 30));

  // Empty (or only spaces): required
  await typeInto(screen.getByTestId('destination-input'), '   ');
  expect(isDisabled(continueButton())).toBe(true);
  expect(screen.getByText('Enter your destination.')).toBeTruthy();
  expect(tripPosts()).toEqual([]);

  await typeInto(screen.getByTestId('destination-input'), '  Hiranandani   Estate, Thane West ');
  await waitFor(() => expect(isDisabled(continueButton())).toBe(false));
  await press(continueButton());
  await waitFor(async () => expect(await serverTrips(user)).toHaveLength(1));
  const [saved] = await serverTrips(user);
  expect(saved.destination).toBe('Hiranandani Estate, Thane West');
  expect(JSON.parse(tripPosts()[0].data).destination).toBe('Hiranandani Estate, Thane West');

  // Editing the trip: "Others" is still chosen and the typed place is kept
  await launchApp(`/trip/${saved.id}/details`);
  await screen.findByTestId('destination-field');
  expect(screen.getByLabelText('Destination: Others')).toBeTruthy();
  expect(screen.getByTestId('destination-input').props.value).toBe('Hiranandani Estate, Thane West');
});

test('airports: Mumbai or Navi Mumbai; Navi Mumbai has one terminal, so none is asked for', async () => {
  const user = await openTripDetails();
  expect(screen.getByTestId('airport-BOM').props.accessibilityState.checked).toBe(true); // the default
  expect(screen.getByTestId('terminal-T1')).toBeTruthy();

  await press(screen.getByTestId('airport-NMI'));
  expect(screen.getByTestId('airport-NMI').props.accessibilityState.checked).toBe(true);
  expect(screen.getByTestId('single-terminal')).toHaveTextContent(/Terminal 1/);
  expect(screen.queryByTestId('terminal-T2')).toBeNull();
  await chooseDestination('Vashi');
  await pick('Travel date', 'date', isoToPickerDate(IN_3_DAYS()));
  await pick('Expected landing time', 'time', new Date(2000, 0, 1, 18, 30));
  await waitFor(() => expect(isDisabled(continueButton())).toBe(false));
  await press(continueButton());

  await waitFor(async () => expect(await serverTrips(user)).toHaveLength(1));
  const [saved] = await serverTrips(user);
  expect(saved).toMatchObject({ pickupLocation: 'Navi Mumbai International Airport', airport: 'NMI', pickupTerminal: 'T1', destination: 'Vashi' });
  // Shown with its airport on the next screen
  expect(await screen.findByText('Navi Mumbai Airport (NMI) · T1 → Vashi')).toBeTruthy();
});

test('pickup and destination cannot be the same', async () => {
  await openTripDetails();
  await press(screen.getByText('Not at the airport? Use another pickup point'));
  await typeInto(screen.getByTestId('pickup-input'), 'Powai');
  await chooseDestination('Powai');
  expect(screen.getByText('Destination must be different from the pickup location.')).toBeTruthy();
  expect(isDisabled(continueButton())).toBe(true);
});

test('travel date: native picker limited to today … one year ahead (Mumbai dates)', async () => {
  await openTripDetails();
  const today = todayInMumbai();
  const date = addDays(today, 10);

  await pick('Travel date', 'date', isoToPickerDate(date));
  expect(screen.getByLabelText(`Travel date: ${formatDate(date)}`)).toBeTruthy(); // e.g. "Mon, 16 Nov 2026"

  // The picker can't go before Mumbai's today or past a year from it
  if (Platform.OS === 'android') {
    const opened = nativePicker.opened.find((o) => o.mode === 'date');
    expect(new Date(opened.minimumDate)).toEqual(isoToPickerDate(today));
    expect(new Date(opened.maximumDate)).toEqual(isoToPickerDate(addDays(today, 365)));
  } else {
    await press(screen.getByLabelText(new RegExp('^Travel date:')));
    const picker = await screen.findByTestId('date-picker');
    expect(picker.props.minimumDate).toBe(isoToPickerDate(today).getTime());
    expect(picker.props.maximumDate).toBe(isoToPickerDate(addDays(today, 365)).getTime());
    await press(screen.getByText('Cancel'));
    expect(screen.getByLabelText(`Travel date: ${formatDate(date)}`)).toBeTruthy(); // unchanged
  }

  // Shortcuts
  await press(screen.getByTestId('date-tomorrow'));
  expect(screen.getByLabelText(`Travel date: ${formatDate(addDays(today, 1))}`)).toBeTruthy();
  await press(screen.getByTestId('date-today'));
  expect(screen.getByLabelText(`Travel date: ${formatDate(today)}`)).toBeTruthy();
});

test('closing the date picker without choosing keeps the field empty', async () => {
  await openTripDetails();
  if (Platform.OS === 'android') {
    nativePicker.answer = null; // dismissed
    await press(screen.getByLabelText(/^Travel date:/));
  } else {
    await press(screen.getByLabelText(/^Travel date:/));
    await screen.findByTestId('date-picker');
    await press(screen.getByText('Cancel'));
  }
  expect(screen.getByLabelText('Travel date: not chosen')).toBeTruthy();
});

test('landing time: native time picker, shown in 12-hour Mumbai time', async () => {
  await openTripDetails();
  await pick('Expected landing time', 'time', new Date(2000, 0, 1, 18, 30));
  expect(screen.getByLabelText('Expected landing time: 6:30 pm')).toBeTruthy();
});

test('passengers: 1 to 6 with − and +', async () => {
  await openTripDetails();
  const value = () => screen.getByTestId('passengers-value');
  const less = () => screen.getByTestId('passengers-less');
  const more = () => screen.getByTestId('passengers-more');

  expect(value()).toHaveTextContent('1 person');
  expect(isDisabled(less())).toBe(true);
  for (let i = 0; i < 8; i++) await press(more()); // taps past the limit do nothing
  expect(value()).toHaveTextContent('6 people');
  expect(isDisabled(more())).toBe(true);
  await press(less());
  expect(value()).toHaveTextContent('5 people');
});

// ---- 6: incomplete and invalid forms ---------------------------------------

test('an incomplete form cannot be sent and says what is missing', async () => {
  await openTripDetails();
  expect(isDisabled(continueButton())).toBe(true);
  expect(screen.getByText('Still needed: terminal, destination, travel date, landing time.')).toBeTruthy();

  await press(continueButton());
  expect(tripPosts()).toHaveLength(0);

  await press(screen.getByTestId('terminal-T1'));
  await chooseDestination('Juhu');
  expect(screen.getByText('Still needed: travel date, landing time.')).toBeTruthy();
});

test('details the server rejects are shown on the field, and nothing is saved', async () => {
  const user = await openTripDetails();
  await fillValidTrip({ destination: 'A'.repeat(130) }); // the server allows 120 characters

  await press(continueButton());
  expect(await screen.findByText('Please check your trip details')).toBeTruthy();
  expect(screen.getAllByText('Destination is too long.').length).toBeGreaterThan(0);
  expect(screen).toHavePathname('/');
  expect(await serverTrips(user)).toEqual([]);

  // Fixing it clears the error and saves
  await typeInto(screen.getByTestId('destination-input'), 'Bandra West');
  expect(screen.queryByText('Destination is too long.')).toBeNull();
  await press(continueButton());
  expect(await screen.findByText('Trip saved')).toBeTruthy();
});

// ---- 7, 8, 11: creating the trip --------------------------------------------

test('a valid trip is saved with POST /trips and its real id opens the next screen', async () => {
  const user = await openTripDetails();
  const travelDate = IN_3_DAYS();
  await fillValidTrip({ destination: 'Andheri West', date: travelDate });
  await press(screen.getByTestId('passengers-more'));

  await press(continueButton());
  expect(await screen.findByText('Trip saved')).toBeTruthy();

  // Exactly what the backend expects, with the session's bearer token
  const [post] = tripPosts();
  expect(post.authorization).toBe(`Bearer ${user.token}`);
  const body = JSON.parse(post.data);
  expect(body).toEqual({
    pickupLocation: 'Chhatrapati Shivaji Maharaj International Airport, Mumbai',
    pickupTerminal: 'T2',
    destination: 'Andheri West',
    travelDate,
    expectedArrivalTime: '18:30',
    passengerCount: 2,
    luggageCount: 1,
    openToPooling: true,
    clientRequestId: expect.stringMatching(UUID),
  });

  // Stored on the server, owned by this user
  const trips = await serverTrips(user);
  expect(trips).toHaveLength(1);
  const [saved] = trips;
  expect(saved).toMatchObject({
    userId: user.user.id,
    status: 'awaiting_verification',
    pickupTerminal: 'T2',
    destination: 'Andheri West',
    travelDate,
    expectedArrivalTime: '18:30',
    passengerCount: 2,
  });
  // Arrival moment computed as Mumbai time (UTC+5:30)
  expect(saved.arrivalAt).toBe(new Date(`${travelDate}T18:30:00+05:30`).toISOString());

  // The id from the response is the one passed on - and the next screen loads it
  expect(screen).toHavePathname(`/trip/${saved.id}/verify`);
  expect(network.requests.some((r) => r.method === 'GET' && r.url === `/trips/${saved.id}`)).toBe(true);
  expect(screen.getByTestId('trip-route')).toHaveTextContent('Mumbai Airport (BOM) · T2 → Andheri West');
  expect(screen.getByText(/2 people · 1 bag/)).toBeTruthy();
});

test('a trip from another pickup point is saved without a terminal', async () => {
  const user = await openTripDetails();
  await press(screen.getByText('Not at the airport? Use another pickup point'));
  await typeInto(screen.getByTestId('pickup-input'), '  Hotel Sahara Star  ');
  await chooseDestination('Colaba');
  await pick('Travel date', 'date', isoToPickerDate(addDays(todayInMumbai(), 1)));
  await pick('Expected landing time', 'time', new Date(2000, 0, 1, 7, 5));
  await press(screen.getByTestId('passengers-more'));
  await press(screen.getByTestId('bags-less'));
  await act(async () => fireEvent(screen.getByLabelText('Open to sharing a cab'), 'valueChange', false));

  await press(continueButton());
  expect(await screen.findByText('Trip saved')).toBeTruthy();
  const body = JSON.parse(tripPosts()[0].data);
  expect(body).toMatchObject({
    pickupLocation: 'Hotel Sahara Star',
    pickupTerminal: null,
    expectedArrivalTime: '07:05',
    passengerCount: 2,
    luggageCount: 0,
    openToPooling: false,
  });
  const [saved] = await serverTrips(user);
  expect(saved).toMatchObject({ pickupLocation: 'Hotel Sahara Star', pickupTerminal: null, openToPooling: false });
  expect(screen.getByTestId('trip-route')).toHaveTextContent('Hotel Sahara Star → Colaba');
});

// Phase 7: going back to step 1 shows the same trip, filled in, and
// continuing again never creates a second trip
test('Back from verification shows the same trip filled in; continuing again creates no new trip', async () => {
  const user = await openTripDetails();
  await fillValidTrip({ destination: 'Powai' });
  await press(continueButton());
  expect(await screen.findByText('Trip saved')).toBeTruthy();
  const [trip] = await serverTrips(user);
  expect(screen).toHavePathname(`/trip/${trip.id}/verify`);

  // Back: this trip's planning form, with everything still there
  await press(screen.getByLabelText('Back'));
  await screen.findByTestId('destination-field'); // loaded (not just the title)
  expect(screen.getByText('Your trip details')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/details`);
  expect(screen.getByLabelText('Destination: Powai')).toBeTruthy();
  expect(screen.getByLabelText(`Travel date: ${formatDate(trip.travelDate)}`)).toBeTruthy();
  expect(screen.getByTestId('terminal-T2').props.accessibilityState.checked).toBe(true);

  // Continue unchanged: straight on, nothing sent
  network.requests.length = 0;
  expect(continueButton()).toHaveTextContent('Continue to flight verification');
  await press(continueButton());
  expect(await screen.findByTestId('trip-route')).toHaveTextContent(/→ Powai/);
  expect(network.requests.filter((r) => r.method !== 'GET')).toEqual([]);

  // Back, change the destination: saved to the SAME trip (PATCH), then on
  await press(screen.getByLabelText('Back'));
  await screen.findByText('Your trip details');
  await chooseDestination('Juhu');
  expect(continueButton()).toHaveTextContent('Save changes and continue');
  network.requests.length = 0;
  await press(continueButton());
  expect(await screen.findByTestId('trip-route')).toHaveTextContent(/→ Juhu/);
  const writes = network.requests.filter((r) => r.method !== 'GET');
  expect(writes.map((r) => [r.method, r.url])).toEqual([['PATCH', `/trips/${trip.id}`]]);
  expect(JSON.parse(writes[0].data)).toEqual({ destination: 'Juhu' });

  const after = await serverTrips(user);
  expect(after).toHaveLength(1); // still one trip
  expect(after[0]).toMatchObject({ id: trip.id, destination: 'Juhu' });
});

// ---- 9, 10: duplicates and network failures ---------------------------------

test('rapid repeated taps send one request and create one trip', async () => {
  const user = await openTripDetails();
  await fillValidTrip();

  // Three taps in a row while the first request is still on its way
  const release = holdTripRequest();
  const button = continueButton();
  await press(button);
  await press(button);
  await press(button);
  await release();
  expect(await screen.findByText('Trip saved')).toBeTruthy();
  expect(tripPosts()).toHaveLength(1);
  expect(await serverTrips(user)).toHaveLength(1);
});

test('the button shows progress and is disabled while saving', async () => {
  await openTripDetails();
  await fillValidTrip();
  const release = holdTripRequest();

  await press(continueButton());
  expect(screen.getByText('Saving your trip…')).toBeTruthy();
  expect(continueButton().props.accessibilityState).toEqual({ disabled: true, busy: true });
  await press(continueButton());

  await release();
  expect(await screen.findByText('Trip saved')).toBeTruthy();
  expect(tripPosts()).toHaveLength(1);
});

test('offline: nothing is saved, the message explains, and trying again works', async () => {
  const user = await openTripDetails();
  await fillValidTrip();

  network.mode = 'offline';
  await press(continueButton());
  expect(await screen.findByText('Your trip wasn’t confirmed')).toBeTruthy();
  expect(screen.getByText(/Can’t reach FlyPool/)).toBeTruthy();
  expect(screen).toHavePathname('/');
  expect(isDisabled(continueButton())).toBe(false); // can try again

  network.mode = 'online';
  expect(await serverTrips(user)).toEqual([]);
  await press(continueButton());
  expect(await screen.findByText('Trip saved')).toBeTruthy();
  expect(await serverTrips(user)).toHaveLength(1);
});

test('a lost response: retrying returns the trip already saved, not a duplicate', async () => {
  const user = await openTripDetails();
  await fillValidTrip();

  network.mode = 'lose-response'; // the server saves it; the answer never arrives
  await press(continueButton());
  expect(await screen.findByText('Your trip wasn’t confirmed')).toBeTruthy();
  expect(screen.getByText(/Tapping Continue again is safe/)).toBeTruthy();

  network.mode = 'online';
  const [saved] = await serverTrips(user);
  expect(saved).toBeTruthy(); // it was saved

  await press(continueButton());
  expect(await screen.findByText('Trip saved')).toBeTruthy();
  const [first, second] = tripPosts();
  expect(JSON.parse(second.data).clientRequestId).toBe(JSON.parse(first.data).clientRequestId);
  expect(await serverTrips(user)).toHaveLength(1);
  expect(screen).toHavePathname(`/trip/${saved.id}/verify`); // the trip saved the first time
});

test('changing a detail after a failure makes it a new trip (new request id)', async () => {
  const user = await openTripDetails();
  await fillValidTrip();

  network.mode = 'lose-response';
  await press(continueButton());
  expect(await screen.findByText('Your trip wasn’t confirmed')).toBeTruthy();
  network.mode = 'online';

  await press(screen.getByTestId('passengers-more'));
  await press(continueButton());
  expect(await screen.findByText('Trip saved')).toBeTruthy();
  const [first, second] = tripPosts();
  expect(JSON.parse(second.data).clientRequestId).not.toBe(JSON.parse(first.data).clientRequestId);
  expect(await serverTrips(user)).toHaveLength(2);
});
