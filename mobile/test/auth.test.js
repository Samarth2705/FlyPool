// Phase 3: authentication and sessions, through the real screens and a real
// FlyPool API. Runs for iOS and Android (see "projects" in package.json).
import { Alert, AppState } from 'react-native';
import { screen } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import api from '../src/api/client';
import { saveSession } from '../src/auth/sessionStorage';
import { launchApp, newUserDetails, press, signedInUser, storedSession, typeInto, waitFor } from './helpers';
import pkg from '../package.json';

const network = globalThis.network;
const tripDetailsShown = () => screen.findByText('Where are you headed?');

// Calls the API with a specific token, outside the app (like another device)
async function callWithToken(token, method, url) {
  return api.request({ method, url, headers: { Authorization: `Bearer ${token}` } }).then(
    (res) => res.status,
    (error) => error.status,
  );
}

afterEach(() => jest.restoreAllMocks());

test('a new user can register; the session is saved in SecureStore', async () => {
  const user = newUserDetails();
  await launchApp('/');
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(screen).toHavePathname('/login'); // not logged in -> login

  await press(screen.getByText('Create an account'));
  expect(await screen.findByText('Create your account')).toBeTruthy();

  // Client-side checks (same rules as the server), including confirm password
  await typeInto(screen.getByLabelText('Full name'), user.name);
  await typeInto(screen.getByLabelText('Email'), user.email);
  await typeInto(screen.getByLabelText('Mobile number'), '12345');
  await typeInto(screen.getByLabelText('Password'), user.password);
  await typeInto(screen.getByLabelText('Confirm password'), 'something-else');
  await press(screen.getByText('Create account'));
  expect(screen.getByText('Enter a valid 10-digit mobile number.')).toBeTruthy();
  expect(screen.getByText('Passwords don’t match.')).toBeTruthy();
  expect(network.requests.filter((r) => r.url.includes('register'))).toHaveLength(0); // not sent

  // The field shows "+91" already; typing it again must not send it twice
  await typeInto(screen.getByLabelText('Mobile number'), `+91 ${user.phone.slice(0, 5)} ${user.phone.slice(5)}`);
  await typeInto(screen.getByLabelText('Confirm password'), user.password);
  await press(screen.getByText('Create account'));

  expect(await tripDetailsShown()).toBeTruthy();
  const register = network.requests.find((r) => r.url === '/auth/mobile/register');
  expect(JSON.parse(register.data)).toEqual({ name: user.name, email: user.email, phone: user.phone, password: user.password });
  const me = await api.get('/auth/me', { headers: { Authorization: `Bearer ${storedSession().token}` } });
  expect(me.data.data.user.phone).toBe(`+91${user.phone}`); // +91 stored once, by the server

  // Stored in SecureStore (Keychain / Keystore), this device only - never the password
  const saved = storedSession();
  expect(saved.token).toMatch(/^ey/);
  expect(new Date(saved.expiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('flypool.session', expect.any(String), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  expect(SecureStore.__store.get('flypool.session')).not.toContain(user.password);
});

test('the app has no AsyncStorage or other plain-text storage installed', () => {
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  expect(deps.filter((d) => /async-storage|mmkv|sqlite/i.test(d))).toEqual([]);
});

test('login with wrong credentials shows the server message; correct ones log in', async () => {
  const user = await signedInUser();
  SecureStore.__store.clear(); // logged out on this phone

  await launchApp('/login');
  await typeInto(screen.getByLabelText('Email'), user.email);
  await typeInto(screen.getByLabelText('Password'), 'wrong-password');
  await press(screen.getByText('Log in'));
  expect(await screen.findByText('Email or password is incorrect.')).toBeTruthy();
  expect(storedSession()).toBeNull();

  await typeInto(screen.getByLabelText('Password'), user.password);
  await press(screen.getByText('Log in'));
  expect(await tripDetailsShown()).toBeTruthy();
  expect(storedSession().token).not.toBe(user.token); // a new session for this login
});

test('restarting the app while logged in goes straight in (token checked with /auth/me)', async () => {
  const user = await signedInUser();
  await launchApp('/');
  expect(await tripDetailsShown()).toBeTruthy();
  const me = network.requests.find((r) => r.url === '/auth/me');
  expect(me.authorization).toBe(`Bearer ${user.token}`);
});

test('authenticated requests carry the bearer token', async () => {
  const user = await signedInUser();
  await launchApp('/');
  await tripDetailsShown();
  const sent = network.requests.filter((r) => r.url !== '/auth/mobile/register');
  expect(sent.length).toBeGreaterThan(0);
  expect(sent.every((r) => r.authorization === `Bearer ${user.token}`)).toBe(true);
});

test('an invalid saved token is cleared and the user sees "session ended"', async () => {
  await saveSession({ token: 'not-a-real-token', expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
  await launchApp('/');
  expect(await screen.findByText('Your session has ended')).toBeTruthy();
  expect(screen).toHavePathname('/login');
  await waitFor(() => expect(storedSession()).toBeNull());
});

test('a locally expired session is removed without even asking the server', async () => {
  await saveSession({ token: 'eyJ.old.token', expiresAt: new Date(Date.now() - 1000).toISOString() });
  await launchApp('/');
  expect(await screen.findByText('Your session has ended')).toBeTruthy();
  expect(network.requests).toHaveLength(0);
  expect(storedSession()).toBeNull();
});

test('a session revoked elsewhere is noticed when the app returns to the foreground', async () => {
  const appStateSpy = jest.spyOn(AppState, 'addEventListener');
  const user = await signedInUser();
  await launchApp('/');
  await tripDetailsShown();

  // Revoke this token on the server (as a logout from another place would)
  expect(await callWithToken(user.token, 'POST', '/auth/logout')).toBe(200);

  // Back in the foreground more than a minute later -> GET /auth/me -> 401
  const onChange = appStateSpy.mock.calls.find(([event]) => event === 'change')[1];
  jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2 * 60 * 1000);
  network.requests.length = 0;
  onChange('active');
  expect(await screen.findByText('Your session has ended')).toBeTruthy();
  expect(network.requests.map((r) => r.url)).toEqual(['/auth/me']);
  await waitFor(() => expect(storedSession()).toBeNull());
});

test('foreground checks happen at most once a minute', async () => {
  const appStateSpy = jest.spyOn(AppState, 'addEventListener');
  await signedInUser();
  await launchApp('/');
  await tripDetailsShown();
  const onChange = appStateSpy.mock.calls.find(([event]) => event === 'change')[1];
  network.requests.length = 0;
  onChange('active');
  onChange('active');
  expect(network.requests).toHaveLength(0); // just checked at launch
});

test('logout revokes the token on the server, clears it locally, and returns to login', async () => {
  const user = await signedInUser();
  await launchApp('/');
  await tripDetailsShown();

  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    buttons.find((b) => b.style === 'destructive').onPress();
  });
  await press(screen.getByLabelText(`Account menu for ${user.name}`));
  expect(screen.getByText(user.email)).toBeTruthy();
  await press(screen.getByText('Log out'));

  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(storedSession()).toBeNull();
  expect(network.requests.find((r) => r.url === '/auth/logout').authorization).toBe(`Bearer ${user.token}`);
  expect(await callWithToken(user.token, 'GET', '/auth/me')).toBe(401); // dead on the server too
  expect(screen.queryByText('Your session has ended')).toBeNull(); // a normal logout, no warning

  // Logging in again works
  await typeInto(screen.getByLabelText('Email'), user.email);
  await typeInto(screen.getByLabelText('Password'), user.password);
  await press(screen.getByText('Log in'));
  expect(await tripDetailsShown()).toBeTruthy();
});

test('logout still clears the local session when the network is down', async () => {
  const user = await signedInUser();
  await launchApp('/');
  await tripDetailsShown();
  jest.spyOn(Alert, 'alert').mockImplementation((t, m, buttons) => buttons.find((b) => b.style === 'destructive').onPress());

  network.mode = 'offline';
  await press(screen.getByLabelText(`Account menu for ${user.name}`));
  await press(screen.getByText('Log out'));
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(storedSession()).toBeNull();
});

test('offline at launch with a saved session: keeps it and offers Try again', async () => {
  const user = await signedInUser();
  network.mode = 'offline';
  await launchApp('/');
  expect(await screen.findByText('Can’t reach FlyPool')).toBeTruthy();
  expect(storedSession().token).toBe(user.token); // not logged out for being offline

  network.mode = 'online';
  await press(screen.getByText('Try again'));
  expect(await tripDetailsShown()).toBeTruthy();
});

test('logged-out users cannot open logged-in screens', async () => {
  await launchApp('/trip/000000000000000000000000/verify');
  expect(await screen.findByText('Welcome back')).toBeTruthy();
  expect(screen).toHavePathname('/login');
});
