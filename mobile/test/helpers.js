// Shared helpers for the app tests. Accounts are created through the real
// API (POST /auth/mobile/register) - there are no fake users.
import { renderRouter } from 'expo-router/testing-library';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { mobileRegister } from '../src/api/auth.api';
import { saveSession } from '../src/auth/sessionStorage';

let counter = 0;

export function newUserDetails() {
  counter += 1;
  const id = `${Date.now()}${counter}${Math.floor(Math.random() * 1000)}`;
  return {
    name: 'Asha Verma',
    email: `app${id}@example.com`,
    phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`,
    password: 'correct-horse-battery',
  };
}

// A real account, already logged in on this "phone" (session in SecureStore)
export async function signedInUser() {
  const details = newUserDetails();
  const session = await mobileRegister(details);
  await saveSession(session);
  return { ...details, ...session };
}

// The saved session, as the app stored it
export function storedSession() {
  const raw = SecureStore.__store.get('flypool.session');
  return raw ? JSON.parse(raw) : null;
}

// Render the real app (the app/ directory) at a URL.
// renderRouter switches Jest to fake timers; these tests talk to a real
// server, so real timers are restored - otherwise findBy*/waitFor would spend
// their whole timeout on fake time, before a real response could arrive.
export async function launchApp(initialUrl = '/') {
  const result = await renderRouter('./app', { initialUrl });
  jest.useRealTimers();
  return result;
}

export async function typeInto(element, text) {
  await act(async () => {
    fireEvent.changeText(element, text);
  });
}

export async function press(element) {
  await act(async () => {
    fireEvent.press(element);
  });
}

export { act, fireEvent, waitFor };

// ---- the destination picker (Trip Planning) ---------------------------------
// A listed area: open the picker, search, tap it ("Kharghar" -> "Kharghar, Navi Mumbai")
export async function chooseDestination(area) {
  const { screen } = require('expo-router/testing-library');
  const { regionOf } = require('../src/shared/mumbaiLocations');
  await press(screen.getByTestId('destination-field'));
  await typeInto(screen.getByTestId('destination-search'), area);
  await press(screen.getByLabelText(`${area}, ${regionOf(area)}`));
}

// "Others": pick it, then type the destination in the field that appears
export async function chooseOtherDestination(text) {
  const { screen } = require('expo-router/testing-library');
  await press(screen.getByTestId('destination-field'));
  await press(screen.getByTestId('destination-others'));
  await typeInto(screen.getByTestId('destination-input'), text);
}

// A listed area or, if not listed, typed under "Others"
export async function enterDestination(text) {
  const { listedDestination } = require('../src/shared/mumbaiLocations');
  if (listedDestination(text)) await chooseDestination(listedDestination(text));
  else await chooseOtherDestination(text);
}
