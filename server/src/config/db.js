import mongoose from 'mongoose';
import { env } from './env.js';

// How long to wait before trying again when the first connection fails.
const RETRY_DELAY_MS = 10000;

// Replaces "user:password@" in any mongodb:// text with "***:***@",
// so a connection string can never leak into the logs.
export function hideCredentials(text) {
  return String(text).replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]+@/g, '$1***:***@');
}

// A beginner-friendly hint for the most common connection problems.
function connectionHint(err) {
  if (/auth/i.test(err.message)) {
    return 'The username or password in MONGODB_URI (server/.env) is wrong. Check Atlas -> Database Access.';
  }
  if (err.message.includes('ENOTFOUND')) {
    return 'The cluster address in MONGODB_URI (server/.env) does not exist. Copy the exact string from Atlas -> Connect -> Drivers.';
  }
  return 'Check your internet connection and Atlas -> Network Access (IP allow list).';
}

const connection = mongoose.connection;

// Once connected, Mongoose reconnects by itself if the database drops out.
// These listeners just log what is happening.
function watchConnection() {
  connection.on('disconnected', () => console.warn('MongoDB disconnected - waiting for it to come back...'));
  connection.on('reconnected', () => console.log('MongoDB reconnected'));
  connection.on('error', (err) => console.error('MongoDB error:', hideCredentials(err.message)));
}

let opening = null; // the connection attempt in progress, shared by everyone waiting
let watching = false;

// Opens the connection if it isn't open yet. Callers that arrive while an
// attempt is running share it. Rejects if MongoDB can't be reached.
// Used at startup (connectDB below) and per request on serverless hosts
// such as Vercel, where server.js never runs (middleware/requireDatabase.js).
export function ensureDBConnection() {
  if (connection.readyState === 1) return Promise.resolve();
  if (!opening) {
    // Give up after 10 seconds instead of hanging if Atlas can't be reached
    opening = mongoose
      .connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 })
      .then(() => {
        console.log(`MongoDB connected: ${connection.host}/${connection.name}`);
        if (!watching) {
          watchConnection();
          watching = true;
        }
      })
      .finally(() => {
        opening = null;
      });
  }
  return opening;
}

export { connectionHint };

// Connects to MongoDB at server startup. If the first attempt fails (e.g.
// Atlas is unreachable), it keeps retrying in the background instead of
// crashing the server. Meanwhile the API stays up and /api/health reports
// "disconnected".
export async function connectDB() {
  try {
    await ensureDBConnection();
  } catch (err) {
    console.error(`Could not connect to MongoDB: ${hideCredentials(err.message)}`);
    console.error(connectionHint(err));
    console.error(`Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
    setTimeout(connectDB, RETRY_DELAY_MS);
  }
}

// Used by the health check route.
export function isDBConnected() {
  return connection.readyState === 1;
}
