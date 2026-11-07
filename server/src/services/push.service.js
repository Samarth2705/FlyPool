// Push notifications to the passenger's phones through Expo's push service
// (https://exp.host/--/api/v2/push/send). Off unless EXPO_PUSH_ENABLED=true.
//
// - Sent only to the devices registered by the intended user.
// - Best effort: a failed push never fails the action that caused it (the
//   in-app notification is already saved), and it waits at most a few
//   seconds (serverless hosts stop work after the response).
// - Tokens Expo reports as "DeviceNotRegistered" (app removed, token
//   expired) are deleted.
// - The message contains only the notification's title, text and ids -
//   never login tokens or contact details.
// Delivery receipts (a second Expo API call, minutes later) are not checked.
import { env } from '../config/env.js';
import { DeviceToken } from '../models/DeviceToken.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const TIMEOUT_MS = 4000;

// The HTTP call, replaceable in tests: (messages) => Promise<tickets[]>
async function expoTransport(messages) {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(env.expoAccessToken ? { Authorization: `Bearer ${env.expoAccessToken}` } : {}),
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Expo push HTTP ${res.status}`);
  return (await res.json()).data ?? [];
}

let transport = expoTransport;
let enabledOverride = null;

// Tests: use a fake transport (and turn sending on) - null restores Expo
export function setPushTransport(fn, { enabled = true } = {}) {
  transport = fn ?? expoTransport;
  enabledOverride = fn ? enabled : null;
}

const pushEnabled = () => (enabledOverride ?? env.expoPushEnabled);

// One notification to each phone of one user. data: small, non-secret ids.
export async function sendPush(userId, { title, body, data }) {
  if (!pushEnabled()) return { sent: 0 };
  const devices = await DeviceToken.find({ userId }).select('token');
  if (devices.length === 0) return { sent: 0 };

  const messages = devices.map((d) => ({ to: d.token, title, body, data, sound: 'default' }));
  try {
    const tickets = await transport(messages);
    const invalid = tickets
      .map((ticket, i) => (ticket?.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? messages[i].to : null))
      .filter(Boolean);
    if (invalid.length) await DeviceToken.deleteMany({ token: { $in: invalid } });
    return { sent: messages.length - invalid.length, removed: invalid.length };
  } catch (error) {
    // Never log the tokens or the message text
    console.warn(`[push] sending failed: ${error.message}`);
    return { sent: 0, failed: true };
  }
}
