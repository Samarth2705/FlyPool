// Loads variables from server/.env and checks that the required ones exist.
// Every other file imports `env` from here instead of reading process.env directly.
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

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};
