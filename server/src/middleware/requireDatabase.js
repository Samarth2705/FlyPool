// Makes sure MongoDB is connected before an API request uses it.
//
// On a normal Node server (npm start / npm run dev) server.js connects at
// startup, so this finds the connection open and does nothing. On serverless
// hosts such as Vercel, server.js never runs: the first request opens the
// connection here and later requests reuse it.
import { ensureDBConnection, hideCredentials, connectionHint } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

export async function requireDatabase(req, res, next) {
  try {
    await ensureDBConnection();
    next();
  } catch (err) {
    console.error(`Could not connect to MongoDB: ${hideCredentials(err.message)}`);
    console.error(connectionHint(err));
    // The health check still answers (it reports "database": "disconnected")
    if (req.path === '/health') return next();
    next(new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is temporarily unavailable. Please try again shortly.'));
  }
}
