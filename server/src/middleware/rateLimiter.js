// Rate limits: slow down password guessing and stop one account (or script)
// from flooding the API.
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

function limiter({ windowMinutes, limit, message, perUser = false }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Logged-in routes count per account (requireAuth runs first), others per IP
    keyGenerator: perUser ? (req) => (req.userId ? `user:${req.userId}` : ipKeyGenerator(req.ip)) : undefined,
    handler: (req, res, next) => next(new AppError(429, 'TOO_MANY_REQUESTS', message)),
  });
}

// Login and register: per IP
export const authLimiter = limiter({
  windowMinutes: 15,
  limit: 20,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

// Flight verification (accepts up to 3 MB uploads): per account
export const verificationLimiter = limiter({
  windowMinutes: 15,
  limit: 10,
  perUser: true,
  message: 'Too many verification attempts. Please wait a few minutes and try again.',
});

// Creating / changing trips and rides: per account
export const tripWriteLimiter = limiter({
  windowMinutes: 15,
  limit: 60,
  perUser: true,
  message: 'Too many changes in a short time. Please wait a few minutes and try again.',
});
