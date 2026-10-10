// Entry point: start the API, then connect to MongoDB.
// The server stays up even if the database is temporarily unavailable -
// connectDB() keeps retrying, and /api/health shows the database status.
import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';

const server = app.listen(env.port, () => {
  console.log(`FlyPool API running at http://localhost:${env.port}/api (${env.nodeEnv})`);
  console.log(`Flight verification mode: ${env.flightVerificationMode}`);
});

connectDB();

// Graceful shutdown (e.g. a deploy or Ctrl+C): stop taking requests, let
// running ones finish, then close the database connection.
function shutdown(signal) {
  console.log(`${signal} received - shutting down...`);
  server.close(async () => {
    await mongoose.disconnect().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref(); // don't hang forever
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Log crashes instead of failing silently
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});
