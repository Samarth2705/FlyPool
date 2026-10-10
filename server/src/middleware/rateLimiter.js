// Limits how often one IP address can try to log in or register,
// which slows down password-guessing attacks.
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20, // requests per IP in that window
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many attempts. Please wait a few minutes and try again.'));
  },
});
