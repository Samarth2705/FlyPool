// Protects routes that need a logged-in user.
// Usage: router.get('/me', requireAuth, controller)
//
// If the auth cookie holds a valid token, the user's id is put on
// req.userId and the request continues. Otherwise a 401 error is sent.
import { AppError } from '../utils/AppError.js';
import { verifyToken } from '../utils/jwt.js';
import { AUTH_COOKIE_NAME } from '../utils/authCookie.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return next(new AppError(401, 'AUTH_REQUIRED', 'Please log in to continue.'));
  }

  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'Your session has expired. Please log in again.'));
  }
}
