import { Router } from 'express';
import {
  register,
  login,
  mobileRegister,
  mobileLogin,
  logout,
  getMe,
  deleteAccount,
} from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { registerSchema, loginSchema, deleteAccountSchema } from '../validators/auth.validators.js';

const router = Router();

// Website: login cookie
router.post('/register', authLimiter, validate(registerSchema), register);
router.post('/login', authLimiter, validate(loginSchema), login);

// App: bearer token in the response body (same rules and limits)
router.post('/mobile/register', authLimiter, validate(registerSchema), mobileRegister);
router.post('/mobile/login', authLimiter, validate(loginSchema), mobileLogin);

// Both
router.post('/logout', logout);
router.get('/me', requireAuth, getMe);
// The password check is rate limited like a login
router.delete('/me', authLimiter, requireAuth, validate(deleteAccountSchema), deleteAccount);

export default router;
