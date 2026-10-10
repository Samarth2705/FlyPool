// Handles the /api/auth requests: reads the request, calls the auth
// service, sets or clears the login cookie and sends the response.
// Express 5 passes thrown errors to the error handler automatically.
import * as authService from '../services/auth.service.js';
import { signToken } from '../utils/jwt.js';
import { setAuthCookie, clearAuthCookie } from '../utils/authCookie.js';
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

// POST /api/auth/logout
export function logout(req, res) {
  clearAuthCookie(res);
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
