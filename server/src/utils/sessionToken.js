// Finding and checking the session token on a request.
//
//   website  ->  httpOnly cookie "token" (a web token)
//   app      ->  "Authorization: Bearer <token>" (a mobile token)
//
// Each kind is only accepted from its own channel: a mobile token placed in
// the cookie, or a web token sent as a bearer token, is rejected. So a
// 30-day app token can never become a website session, and the website's
// cookie protections can't be sidestepped with a header.
import { AUTH_COOKIE_NAME } from './authCookie.js';
import { isMobileToken, verifyToken } from './jwt.js';

// { token, source: 'bearer' | 'cookie' }, or null when no session was sent.
// A malformed Authorization header comes back as an empty bearer token, so
// it is rejected as invalid rather than silently ignored.
export function readSessionToken(req) {
  const header = req.get('authorization');
  if (header !== undefined) {
    const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
    return { token: match?.[1] ?? '', source: 'bearer' };
  }
  const cookie = req.cookies?.[AUTH_COOKIE_NAME];
  return cookie ? { token: cookie, source: 'cookie' } : null;
}

// The token's payload. Throws if it is invalid, expired, or came in on the
// wrong channel for its kind.
export function verifySessionToken({ token, source }) {
  const payload = verifyToken(token);
  if (isMobileToken(payload) !== (source === 'bearer')) {
    throw new Error('Session token used on the wrong channel');
  }
  return payload;
}
