// Loads variables from server/.env and checks that the required ones exist.
// Every other file imports `env` from here instead of reading process.env directly.
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const required = ['MONGODB_URI', 'JWT_SECRET', 'CLIENT_ORIGIN'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(', ')}`);
  console.error('Copy server/.env.example to server/.env and fill in the values.');
  process.exit(1);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  clientOrigin: process.env.CLIENT_ORIGIN,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
};
