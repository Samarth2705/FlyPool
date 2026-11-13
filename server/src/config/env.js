// Loads variables from server/.env and checks that the required ones exist.
// Every other file imports `env` from here instead of reading process.env directly.
// In production, unsafe settings stop the server instead of running insecurely.
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { databaseMismatch, databaseNameFromUri } from './databaseName.js';

dotenv.config({ quiet: true });

function fail(message) {
  console.error(`\n[config] ${message}`);
  console.error('[config] Edit server/.env (copy it from server/.env.example if it does not exist).\n');
  process.exit(1);
}

const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((name) => !process.env[name]);
if (missing.length > 0) {
  fail(`Missing required environment variables: ${missing.join(', ')}`);
}

// Production and Vercel Preview deployments use different databases
// (config/databaseName.js): a preview pointing at production data - or the
// reverse - stops here, before any connection is opened.
const databaseName = databaseNameFromUri(process.env.MONGODB_URI);
if (!databaseName) {
  fail('MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string.');
}
const databaseProblem = databaseMismatch(process.env.VERCEL_ENV, databaseName);
if (databaseProblem) fail(databaseProblem);

if (process.env.JWT_SECRET.length < 32) {
  fail('JWT_SECRET is too short. Use at least 32 random characters.');
}

const isProduction = process.env.NODE_ENV === 'production';

// TRUST_PROXY: how many proxies (load balancer, PaaS router) sit in front of
// the API, so rate limits see the real client IP. "false" = none.
function readTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  const hops = Number(value);
  if (!Number.isInteger(hops) || hops < 0) fail('TRUST_PROXY must be false, true or a number of proxies (e.g. 1).');
  return hops;
}

const cookieSameSite = (process.env.COOKIE_SAME_SITE || 'lax').toLowerCase();
if (!['lax', 'strict', 'none'].includes(cookieSameSite)) {
  fail('COOKIE_SAME_SITE must be lax, strict or none.');
}
const cookieSecure = process.env.COOKIE_SECURE === 'true';
if (cookieSameSite === 'none' && !cookieSecure) {
  fail('COOKIE_SAME_SITE=none needs COOKIE_SECURE=true (browsers reject it otherwise).');
}

// JWT_EXPIRES_IN / JWT_MOBILE_EXPIRES_IN: how long a login lasts, e.g. "7d"
// or "12h". Checked here, with the same rules jsonwebtoken uses, so a bad
// value stops the server with a clear message instead of every login failing
// with "expiresIn should be a number of seconds or string...". Surrounding
// spaces (easy to paste into a dashboard) are ignored.
function readDuration(name, fallback) {
  const value = process.env[name]?.trim() || fallback;
  try {
    jwt.sign({}, 'duration-check', { expiresIn: value });
  } catch {
    fail(`${name} must be a timespan such as 7d, 12h or 30m (no quotes).`);
  }
  return value;
}

// FLIGHT_VERIFICATION_MODE: "demo" (consistency checks only, clearly
// labelled) or "off". Production defaults to "off" so demo results can't be
// mistaken for real verification - set "demo" there only on purpose.
const flightVerificationMode = (process.env.FLIGHT_VERIFICATION_MODE || (isProduction ? 'off' : 'demo')).toLowerCase();

// PAYMENT_MODE: "demo" (simulated payments, clearly labelled - no money
// moves) or "off". No real payment provider is connected yet, so nothing
// else is accepted. Production defaults to "off".
const paymentMode = (process.env.PAYMENT_MODE || (isProduction ? 'off' : 'demo')).toLowerCase();
if (!['demo', 'off'].includes(paymentMode)) {
  fail('PAYMENT_MODE must be "demo" or "off" - no real payment provider is connected yet.');
}

// Identity verification provider (services/identity.service.js). Default: off -
// no provider is connected, and nobody can be shown as identity-verified.
// "sandbox" is the automated tests' stand-in and is refused everywhere else.
const identityProvider = (process.env.IDENTITY_PROVIDER || 'off').trim().toLowerCase();
if (identityProvider === 'sandbox' && process.env.NODE_ENV !== 'test') {
  fail('IDENTITY_PROVIDER=sandbox is only for automated tests (NODE_ENV=test). Use off, or a real KYC provider.');
}

if (isProduction) {
  if (paymentMode === 'demo') {
    console.warn('[config] WARNING: PAYMENT_MODE=demo in production - payments are simulated, no money is collected.');
  }
  if (!process.env.CLIENT_ORIGIN) fail('CLIENT_ORIGIN is required in production (the URL of the React app).');
  if (!cookieSecure) fail('COOKIE_SECURE=true is required in production (serve the site over HTTPS).');
  if (flightVerificationMode === 'demo') {
    console.warn('[config] WARNING: FLIGHT_VERIFICATION_MODE=demo in production - flights are NOT checked with any airline.');
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction,
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  databaseName, // e.g. "flypool" - safe to log (no credentials)
  vercelEnv: process.env.VERCEL_ENV || null, // "production" / "preview" on Vercel
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: readDuration('JWT_EXPIRES_IN', '1d'), // website login cookie
  jwtMobileExpiresIn: readDuration('JWT_MOBILE_EXPIRES_IN', '30d'), // mobile app bearer token
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  cookieSecure,
  cookieSameSite,
  trustProxy: readTrustProxy(process.env.TRUST_PROXY),
  flightVerificationMode,
  // Push notifications through Expo's push service (off unless set to "true").
  // EXPO_ACCESS_TOKEN is only needed if "enhanced push security" is turned on
  // for the Expo project. See services/push.service.js.
  expoPushEnabled: process.env.EXPO_PUSH_ENABLED === 'true',
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || null,
  // Payments (services/payment.service.js)
  paymentMode,
  identityProvider,
  identityWebhookSecret: process.env.IDENTITY_WEBHOOK_SECRET || null,
  // Signs payment provider webhooks (HMAC-SHA256 of the raw body, header
  // X-Razorpay-Signature). Without it the webhook endpoint refuses events.
  paymentWebhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || null,
  // How long a flight-verification service may take before we give up
  verificationTimeoutMs: Number(process.env.VERIFICATION_TIMEOUT_MS) || 10000,
  // Reading an uploaded ticket (decode, barcode, OCR / PDF text)
  documentReadTimeoutMs: Number(process.env.DOCUMENT_READ_TIMEOUT_MS) || 20000,
  // One line per request (method, path, status, time) - never bodies or cookies
  logRequests: process.env.LOG_REQUESTS ? process.env.LOG_REQUESTS === 'true' : process.env.NODE_ENV !== 'test',
};
