// The JWT is stored in an httpOnly cookie, so JavaScript in the browser
// can never read it (protects against token theft through XSS).
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const AUTH_COOKIE_NAME = 'token';

const cookieOptions = {
  httpOnly: true, // not readable from JavaScript
  secure: env.cookieSecure, // only sent over HTTPS when true
  // "lax" (default): not sent with cross-site form posts (CSRF protection).
  // "none" only when the API and the app are on different sites (needs HTTPS).
  sameSite: env.cookieSameSite,
  path: '/',
};

export function setAuthCookie(res, token) {
  // The cookie expires at the same moment as the token inside it.
  const { exp } = jwt.decode(token);
  res.cookie(AUTH_COOKIE_NAME, token, { ...cookieOptions, expires: new Date(exp * 1000) });
}

export function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, cookieOptions);
}
