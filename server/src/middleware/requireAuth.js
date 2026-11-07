// Protects routes that need a logged-in user.
// Usage: router.get('/me', requireAuth, controller)
//
// Accepts the website's auth cookie or the app's "Authorization: Bearer"
// token (see utils/sessionToken.js). If the token is valid, hasn't been
// logged out, and its account still exists, the user's id is put on
// req.userId and the request continues. Otherwise a 401 error is sent - and
// a bad cookie is deleted, so the browser stops sending it.
//
// Expiry is enforced here on the server (jwt.verify checks `exp`), whatever
// the browser or app thinks.
import { AppError } from '../utils/AppError.js';
import { clearAuthCookie } from '../utils/authCookie.js';
import { readSessionToken, verifySessionToken } from '../utils/sessionToken.js';
import { isTokenRevoked } from '../services/session.service.js';
import { ensureDBConnection } from '../config/db.js';
import { User } from '../models/User.js';

const sessionEnded = () => new AppError(401, 'INVALID_TOKEN', 'Your session has expired. Please log in again.');

export async function requireAuth(req, res, next) {
  const session = readSessionToken(req);

  if (!session) {
    return next(new AppError(401, 'AUTH_REQUIRED', 'Please log in to continue.'));
  }

  const reject = () => {
    if (session.source === 'cookie') clearAuthCookie(res);
    next(sessionEnded());
  };

  let payload;
  try {
    payload = verifySessionToken(session);
  } catch {
    return reject();
  }

  // Logged out earlier, or account deleted? This needs the database, which
  // may not be connected yet on a serverless cold start (this middleware can
  // run before requireDatabase - see the upload route in app.js).
  try {
    await ensureDBConnection();
  } catch {
    return next(new AppError(503, 'DATABASE_UNAVAILABLE', 'The database is temporarily unavailable. Please try again shortly.'));
  }
  const [revoked, accountExists] = await Promise.all([isTokenRevoked(session.token), User.exists({ _id: payload.sub })]);
  if (revoked || !accountExists) return reject();

  req.userId = payload.sub;
  req.auth = { ...session, payload }; // the session in use: for logout and account deletion
  next();
}
