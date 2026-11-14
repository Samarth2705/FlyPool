// Phase 7: navigation bar, logo, account menu, My Trips, Profile, Settings
// and light / dark mode - through the real screens and a real FlyPool API
// (GET /trips, GET /auth/me, ...). Runs for iOS and Android.
//
// Every trip and account here is created by the server; nothing it returns
// is mocked. Only the phone's native modules are stand-ins (test/setup.js).
import { Alert, StyleSheet } from 'react-native';
import { screen } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import api from '../src/api/client';
import { darkColors, lightColors } from '../src/theme';
import { addDays, todayInMumbai } from '../src/shared/dates';
import { launchApp, press, signedInUser, storedSession, typeInto, waitFor } from './helpers';
import { ticketFor } from './tickets';

const network = globalThis.network;
const AIRPORT = 'Chhatrapati Shivaji Maharaj International Airport, Mumbai';
const EMPTY_TRIPS = 'You haven’t planned any trips yet. Start planning your first FlyPool ride!';
const auth = (user) => ({ headers: { Authorization: `Bearer ${user.token}` } });
const homeShown = () => screen.findByText('Where are you headed?');

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

async function verifyTrip(user, trip) {
  const body = {
    airline: 'IndiGo',
    flightNumber: '6E 2134',
    scheduledArrivalTime: trip.expectedArrivalTime,
    document: await ticketFor(user.token, trip),
  };
  return (await api.post(`/trips/${trip.id}/verification`, body, auth(user))).data.data.trip;
}

// A Switch's state: 'value' on iOS, 'on' on Android (the native components differ)
const switchOn = (testID) => { const p = screen.getByTestId(testID).props; return p.value ?? p.on; };
const background = (testID) => StyleSheet.flatten(screen.getByTestId(testID).props.style).backgroundColor;
// Every screen currently mounted (the stack keeps earlier ones underneath)
const screenBackgrounds = () =>
  [...new Set(screen.getAllByTestId('screen').map((el) => StyleSheet.flatten(el.props.style).backgroundColor))];

async function openMenu(user) {
  await press(screen.getByLabelText(`Account menu for ${user.name}`));
  return screen.getByTestId('profile-menu');
}

afterEach(() => jest.restoreAllMocks());

// ---- 1. logo -------------------------------------------------------------------

test('the logo opens Login/Register without logging out; Continue returns to the app', async () => {
  const user = await signedInUser();
  await launchApp('/');
  await homeShown();

  await press(screen.getByTestId('header-logo'));
  expect(await screen.findByTestId('signed-in-panel')).toHaveTextContent(new RegExp(`${user.name}.*${user.email}`));
  expect(screen).toHavePathname('/login');
  // Still logged in: on the phone and on the server
  expect(storedSession().token).toBe(user.token);
  expect((await api.get('/auth/me', auth(user))).status).toBe(200);
  expect(network.requests.some((r) => r.url === '/auth/logout')).toBe(false);

  // The same (only) register screen works the same way
  await press(screen.getByText('Create an account'));
  expect(await screen.findByTestId('signed-in-panel')).toBeTruthy();
  expect(screen).toHavePathname('/register');

  await press(screen.getByText('Continue to FlyPool'));
  expect(await homeShown()).toBeTruthy();
  expect(storedSession().token).toBe(user.token);
});

test('on Login, "Use a different account" logs out and shows the form; logging in again opens the app', async () => {
  const user = await signedInUser();
  await launchApp('/login');
  await screen.findByTestId('signed-in-panel');

  await press(screen.getByText('Use a different account'));
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(storedSession()).toBeNull();
  expect((await api.get('/auth/me', auth(user)).catch((e) => e)).status).toBe(401); // revoked on the server

  await typeInto(screen.getByLabelText('Email'), user.email);
  await typeInto(screen.getByLabelText('Password'), user.password);
  await press(screen.getByText('Log in'));
  expect(await homeShown()).toBeTruthy();
  expect(screen).toHavePathname('/');
  expect(storedSession().token).not.toBe(user.token); // a new session
});

// ---- 2, 3. navigation bar and account menu -------------------------------------

test('account menu: initials, every item works, tapping outside closes it', async () => {
  const user = await signedInUser();
  await createTrip(user, { destination: 'Juhu' });
  await launchApp('/');
  await homeShown();

  // Initials in the profile picture ("Asha Verma" -> "AV")
  expect(screen.getByLabelText(`Account menu for ${user.name}`)).toHaveTextContent('AV');

  const menu = await openMenu(user);
  expect(menu).toHaveTextContent(/My Trips.*Profile.*Dark mode.*Settings.*Log out/);
  expect(menu).toHaveTextContent(new RegExp(`${user.name}.*${user.email}`));
  // Tapping outside the sheet (the backdrop - hidden from screen readers
  // while the sheet is open; they close it with the usual escape gesture)
  await press(screen.getByTestId('menu-backdrop', { includeHiddenElements: true }));
  await waitFor(() => expect(screen.queryByTestId('profile-menu')).toBeNull());

  await openMenu(user);
  await press(screen.getByTestId('menu-trips'));
  expect(await screen.findByText('Juhu')).toBeTruthy();
  expect(screen).toHavePathname('/trips');
  expect(screen.getByTestId('header-title')).toHaveTextContent('My Trips');

  await openMenu(user);
  await press(screen.getByTestId('menu-profile'));
  expect(await screen.findByTestId('profile-email')).toHaveTextContent(user.email);
  expect(screen).toHavePathname('/profile');

  await openMenu(user);
  await press(screen.getByTestId('menu-settings'));
  expect(await screen.findByText('Appearance')).toBeTruthy();
  expect(screen).toHavePathname('/settings');
});

test('the trip steps show the current step, open finished ones and lock later ones', async () => {
  const user = await signedInUser();
  const trip = await createTrip(user);
  await launchApp(`/trip/${trip.id}/verify`);
  await screen.findByTestId('trip-route');

  const step = (n) => screen.getByTestId(`step-${n}`);
  expect(step(2).props.accessibilityState).toEqual({ selected: true, disabled: false });
  expect(step(2).props.accessibilityLabel).toBe('Step 2 of 5: Flight Verification, current step');
  expect(step(3).props.accessibilityState.disabled).toBe(true); // not verified yet
  expect(step(1).props.accessibilityState.disabled).toBe(false);

  await press(step(3)); // locked: nothing happens
  expect(screen).toHavePathname(`/trip/${trip.id}/verify`);

  await press(step(1));
  await screen.findByTestId('destination-field'); // the form, filled in (not just the loading title)
  expect(screen.getByText('Your trip details')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/details`);
  expect(screen.getByLabelText('Destination: Powai')).toBeTruthy();
  expect(step(1).props.accessibilityState.selected).toBe(true);

  await press(step(2));
  expect(await screen.findByTestId('trip-route')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/verify`);
});

test('a verified trip: all steps open; its details are shown locked, as the server requires', async () => {
  const user = await signedInUser();
  const trip = await verifyTrip(user, await createTrip(user, { destination: 'Bandra West' }));
  await launchApp(`/trip/${trip.id}/matches`);
  await screen.findByText('Flight verified successfully.');
  expect(screen.getByTestId('step-3').props.accessibilityState.selected).toBe(true);

  await press(screen.getByTestId('step-1'));
  expect(await screen.findByText('These details are locked')).toBeTruthy();
  expect(screen.queryByTestId('continue')).toBeNull(); // no editable form
  expect(screen.getByTestId('verified-flight')).toHaveTextContent(/Drop areaBandra West/);

  await press(screen.getByText('See compatible travellers'));
  expect(await screen.findByText('Find Travellers')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${trip.id}/matches`);
});

// ---- 4. My Trips ---------------------------------------------------------------

test('My Trips lists the user’s real trips, current and previous, with status and verification', async () => {
  // Someone else's trip never shows
  const other = await signedInUser();
  await createTrip(other, { destination: 'Thane' });

  const user = await signedInUser(); // this phone's passenger
  const verified = await verifyTrip(user, await createTrip(user, { destination: 'Andheri East' }));
  const pending = await createTrip(user, { destination: 'Juhu', travelDate: addDays(todayInMumbai(), 5) });
  const cancelled = await createTrip(user, { destination: 'Colaba', travelDate: addDays(todayInMumbai(), 7) });
  await api.patch(`/trips/${cancelled.id}`, { status: 'cancelled' }, auth(user));
  // Landed earlier today -> a previous trip
  await createTrip(user, { destination: 'Worli', travelDate: todayInMumbai(), expectedArrivalTime: '00:00' });
  await launchApp('/trips');
  expect(await screen.findByTestId('trips-upcoming')).toBeTruthy();
  expect(network.requests.filter((r) => r.method === 'GET' && r.url === '/trips').map((r) => r.authorization)).toEqual([
    `Bearer ${user.token}`,
    `Bearer ${user.token}`,
  ]);

  // Phase 11 sections: upcoming (not booked), past, cancelled
  const upcoming = screen.getByTestId('trips-upcoming');
  expect(upcoming).toHaveTextContent(/Upcoming trips2/);
  expect(upcoming).toHaveTextContent(/Flight verified.*Andheri East.*6E 2134.*Verification: Verified \(demo check\)/);
  expect(upcoming).toHaveTextContent(/Needs verification.*Juhu.*Not added yet.*Verification: Not verified yet/);
  expect(screen.getByTestId('trips-cancelled')).toHaveTextContent(/Cancelled1.*Cancelled.*Colaba/);
  expect(screen.getByTestId('trips-past')).toHaveTextContent(/Past trips1.*Worli/);
  expect(screen.queryByTestId('trips-booked')).toBeNull(); // nothing booked
  expect(screen.queryByText('Thane')).toBeNull();

  // Tapping a trip opens its details, from where the workflow continues
  await press(screen.getByLabelText(new RegExp('^Trip to Juhu')));
  await screen.findByTestId('destination-field');
  expect(screen).toHavePathname(`/trip/${pending.id}/details`);
  expect(screen.getByLabelText('Destination: Juhu')).toBeTruthy();

  await press(screen.getByLabelText('Back'));
  await press(await screen.findByLabelText(new RegExp('^Trip to Andheri East')));
  expect(await screen.findByText('These details are locked')).toBeTruthy();
  expect(screen).toHavePathname(`/trip/${verified.id}/details`);

  // Nothing was created by any of this
  expect((await api.get('/trips', auth(user))).data.data.trips).toHaveLength(4);
});

test('My Trips: empty state with a way to plan; a failed load offers Try again (no automatic retry)', async () => {
  const user = await signedInUser();
  await launchApp('/');
  await homeShown();

  // The next trip list request fails like a dropped connection
  let failTrips = true;
  const adapter = api.defaults.adapter;
  jest.spyOn(api.defaults, 'adapter').mockImplementation(async (config) => {
    if (config.url === '/trips' && failTrips) {
      throw Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK', config, isAxiosError: true });
    }
    return adapter(config);
  });
  await openMenu(user);
  await press(screen.getByTestId('menu-trips'));
  expect(await screen.findByText('We couldn’t load your trips')).toBeTruthy();
  expect(screen.getByText('Can’t reach FlyPool. Check your internet connection and try again.')).toBeTruthy();

  failTrips = false;
  await press(screen.getByTestId('trips-retry'));
  expect(await screen.findByText(EMPTY_TRIPS)).toBeTruthy();
  expect(screen.queryByText('We couldn’t load your trips')).toBeNull();

  await press(screen.getByText('Plan a trip'));
  expect(await homeShown()).toBeTruthy();
  expect(screen).toHavePathname('/');
});

// ---- 5. light / dark mode ------------------------------------------------------

test('dark mode from the menu applies at once, on every screen, and is saved on the phone', async () => {
  const user = await signedInUser();
  const trip = await createTrip(user);
  await launchApp(`/trip/${trip.id}/verify`);
  await screen.findByTestId('trip-route');
  expect(screenBackgrounds()).toEqual([lightColors.background]);

  await openMenu(user);
  expect(switchOn('menu-theme-switch')).toBe(false);
  await press(screen.getByTestId('menu-theme-switch'));
  await waitFor(() => expect(screenBackgrounds()).toEqual([darkColors.background]));
  expect(background('app-header')).toBe(darkColors.surface);
  expect(switchOn('menu-theme-switch')).toBe(true);
  expect(SecureStore.__store.get('flypool.theme')).toBe('dark'); // what the next launch reads
  await press(screen.getByTestId('menu-backdrop', { includeHiddenElements: true }));

  // Every other screen, reached the normal way, is dark too
  const visit = async (open, ready) => {
    await open();
    await ready();
    expect(screenBackgrounds()).toEqual([darkColors.background]);
  };
  await visit(() => press(screen.getByTestId('step-1')), () => screen.findByTestId('destination-field'));
  await visit(async () => press((await openMenu(user)) && screen.getByTestId('menu-trips')), () => screen.findByTestId('trips-upcoming'));
  await visit(async () => press((await openMenu(user)) && screen.getByTestId('menu-profile')), () => screen.findByTestId('profile-email'));
  await visit(async () => press((await openMenu(user)) && screen.getByTestId('menu-settings')), () => screen.findByText('Appearance'));
  expect(screen.getByTestId('theme-dark').props.accessibilityState.checked).toBe(true);
  await visit(() => press(screen.getAllByTestId('header-logo').at(-1)), () => screen.findByTestId('signed-in-panel'));
});

test('after a restart the saved theme is used from the very first frame', async () => {
  const user = await signedInUser();
  const trip = await verifyTrip(user, await createTrip(user));
  SecureStore.__store.set('flypool.theme', 'dark'); // saved by an earlier run of the app

  // Record what is on screen whenever the app reads storage at launch
  const seen = [];
  const original = SecureStore.getItemAsync.getMockImplementation();
  SecureStore.getItemAsync.mockImplementation(async (key, options) => {
    let shown = 'only the launch view';
    try {
      if (screen.queryAllByTestId('screen').length) shown = screenBackgrounds().join();
    } catch {
      // nothing rendered yet
    }
    seen.push(shown);
    return original(key, options);
  });
  try {
    await launchApp(`/trip/${trip.id}/matches`);
    await screen.findByText('Flight verified successfully.');
  } finally {
    SecureStore.getItemAsync.mockImplementation(original);
  }
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.filter((b) => b !== 'only the launch view' && b !== darkColors.background)).toEqual([]);
  expect(screenBackgrounds()).toEqual([darkColors.background]);
  expect(background('app-header')).toBe(darkColors.surface);
});

test('Settings: System / Light / Dark switch the theme at once and are saved', async () => {
  const user = await signedInUser();
  await launchApp('/settings');
  await screen.findByText('Appearance');
  expect(screen.getByTestId('theme-system').props.accessibilityState.checked).toBe(true); // the default
  expect(screen.getByTestId('theme-note')).toHaveTextContent('Follows your phone’s setting (now light).');

  await press(screen.getByTestId('theme-dark'));
  expect(screenBackgrounds()).toEqual([darkColors.background]);
  expect(SecureStore.__store.get('flypool.theme')).toBe('dark');
  expect(screen.getByTestId('theme-note')).toHaveTextContent('Always dark. Saved on this phone.');

  await press(screen.getByTestId('theme-light'));
  expect(screenBackgrounds()).toEqual([lightColors.background]);
  expect(SecureStore.__store.get('flypool.theme')).toBe('light');

  await press(screen.getByTestId('theme-system'));
  expect(SecureStore.__store.get('flypool.theme')).toBe('system');
  expect(storedSession().token).toBe(user.token); // the theme never touches the session
});

// ---- 6, 7. Profile and Settings ------------------------------------------------

test('Profile shows the server’s details for this user; account details are read only', async () => {
  const user = await signedInUser();
  await launchApp('/profile');
  expect(await screen.findByTestId('profile-name')).toHaveTextContent(user.name);
  expect(screen.getByTestId('profile-email')).toHaveTextContent(user.email);
  expect(screen.getByTestId('profile-phone')).toHaveTextContent(`+91 ${user.phone.slice(0, 5)} ${user.phone.slice(5)}`);
  expect(network.requests.filter((r) => r.url === '/auth/me').at(-1).authorization).toBe(`Bearer ${user.token}`);
  expect(network.requests.filter((r) => r.url === '/profile').at(-1).authorization).toBe(`Bearer ${user.token}`);
  // Email and phone can't be edited (and are never shown to others); the traveller profile can (test/profiles.test.js)
  expect(screen.getByText('Never shown to other passengers.')).toBeTruthy();
  expect(screen.getByTestId('profile-name-input').props.value).toBe(user.name);
});

test('Settings: profile link, app information and logout (then logging in again)', async () => {
  const user = await signedInUser();
  await launchApp('/settings');
  await screen.findByText('Appearance');
  expect(screen.getByText('App version')).toBeTruthy();
  expect(screen.getByText('1.0.0')).toBeTruthy();

  await press(screen.getByLabelText('Open your profile'));
  expect(await screen.findByTestId('profile-email')).toBeTruthy();
  await press(screen.getByLabelText('Back'));
  await screen.findByText('Appearance');

  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    expect(title).toBe('Log out of FlyPool?');
    buttons.find((b) => b.style === 'destructive').onPress();
  });
  await press(screen.getByTestId('settings-logout'));
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(storedSession()).toBeNull();
  expect(network.requests.find((r) => r.url === '/auth/logout').authorization).toBe(`Bearer ${user.token}`);

  await typeInto(screen.getByLabelText('Email'), user.email);
  await typeInto(screen.getByLabelText('Password'), user.password);
  await press(screen.getByText('Log in'));
  expect(await homeShown()).toBeTruthy();
});
