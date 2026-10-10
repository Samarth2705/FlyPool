// Loads variables from server/.env and checks that the required ones exist.
// Every other file imports `env` from here instead of reading process.env directly.
// In production, unsafe settings stop the server instead of running insecurely.
import dotenv from 'dotenv';

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

// FLIGHT_VERIFICATION_MODE: "demo" (consistency checks only, clearly
// labelled) or "off". Production defaults to "off" so demo results can't be
// mistaken for real verification - set "demo" there only on purpose.
const flightVerificationMode = (process.env.FLIGHT_VERIFICATION_MODE || (isProduction ? 'off' : 'demo')).toLowerCase();

if (isProduction) {
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
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  cookieSecure,
  cookieSameSite,
  trustProxy: readTrustProxy(process.env.TRUST_PROXY),
  flightVerificationMode,
  // How long a flight-verification service may take before we give up
  verificationTimeoutMs: Number(process.env.VERIFICATION_TIMEOUT_MS) || 10000,
  // One line per request (method, path, status, time) - never bodies or cookies
  logRequests: process.env.LOG_REQUESTS ? process.env.LOG_REQUESTS === 'true' : process.env.NODE_ENV !== 'test',
};
