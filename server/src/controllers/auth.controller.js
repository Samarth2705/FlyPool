// Handles the /api/auth requests: reads the request, calls the auth
// service, sets or clears the login cookie and sends the response.
// Express 5 passes thrown errors to the error handler automatically.
//
// Website: /register and /login set an httpOnly cookie.
// App:     /mobile/register and /mobile/login return a bearer token instead
//          (no cookie): { user, token, expiresAt }.
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service.js';
import * as accountService from '../services/account.service.js';
import * as sessionService from '../services/session.service.js';
import { signToken } from '../utils/jwt.js';
import { setAuthCookie, clearAuthCookie } from '../utils/authCookie.js';
import { readSessionToken, verifySessionToken } from '../utils/sessionToken.js';
import { AppError } from '../utils/AppError.js';

// POST /api/auth/register - create an account and log in straight away
export async function register(req, res) {
  const user = await authService.registerUser(req.body);
  setAuthCookie(res, signToken(user.id));
  res.status(201).json({ success: true, data: { user } });
}

// POST /api/auth/login
export async function login(req, res) {
  const user = await authService.loginUser(req.body);
  setAuthCookie(res, signToken(user.id));
  res.json({ success: true, data: { user } });
}

// The app's session: a mobile token and when it expires (ISO date)
function mobileSession(user) {
  const token = signToken(user.id, { mobile: true });
  const { exp } = jwt.decode(token);
  return { user, token, expiresAt: new Date(exp * 1000).toISOString() };
}

// POST /api/auth/mobile/register - same rules as /register
export async function mobileRegister(req, res) {
  const user = await authService.registerUser(req.body);
  res.status(201).json({ success: true, data: mobileSession(user) });
}

// POST /api/auth/mobile/login - same checks as /login
export async function mobileLogin(req, res) {
  const user = await authService.loginUser(req.body);
  res.json({ success: true, data: mobileSession(user) });
}

// POST /api/auth/logout - ends the session on the server too: the token is
// recorded as revoked, so a copy of it can't be used afterwards. Works for
// the website's cookie and the app's bearer token.
export async function logout(req, res) {
  const session = readSessionToken(req);
  // Clear the cookie first, so the browser is logged out even if revoking fails
  clearAuthCookie(res);

  if (session?.token) {
    let payload = null;
    try {
      payload = verifySessionToken(session);
    } catch {
      // Already expired or invalid: nothing left to revoke
    }
    if (payload) await sessionService.revokeToken(session.token, payload.exp);
  }
  res.json({ success: true, data: null });
}

// GET /api/auth/me - who is logged in? (requireAuth has set req.userId)
export async function getMe(req, res) {
  const user = await authService.getUserById(req.userId);

  // Valid token, but the account no longer exists
  if (!user) {
    clearAuthCookie(res);
    throw new AppError(401, 'AUTH_REQUIRED', 'Please log in to continue.');
  }

  res.json({ success: true, data: { user } });
}

// DELETE /api/auth/me - delete the account (password required again).
// See services/account.service.js for what is deleted and what is kept.
export async function deleteAccount(req, res) {
  await accountService.deleteAccount(req.userId, req.body.password);
  // The account is gone, so every token is already refused; revoke this one too
  await sessionService.revokeToken(req.auth.token, req.auth.payload.exp);
  clearAuthCookie(res);
  res.json({ success: true, data: null });
}
