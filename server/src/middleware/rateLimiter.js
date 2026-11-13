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

// Group chat: per account - enough for a conversation, not for a flood
export const chatMessageLimiter = limiter({
  windowMinutes: 1,
  limit: 30,
  perUser: true,
  message: 'You’re sending messages too quickly. Please wait a moment.',
});

// Push token changes (login / logout on a phone)
export const deviceTokenLimiter = limiter({
  windowMinutes: 15,
  limit: 20,
  perUser: true,
  message: 'Too many changes in a short time. Please wait a few minutes and try again.',
});

// Starting / completing payments: per account
export const paymentLimiter = limiter({
  windowMinutes: 15,
  limit: 30,
  perUser: true,
  message: 'Too many payment attempts in a short time. Please wait a few minutes and try again.',
});

// Live ride checks: the app polls about every 4 s per open screen (~15 a minute)
export const liveLimiter = limiter({
  windowMinutes: 1,
  limit: 120,
  perUser: true,
  message: 'Too many updates requested. Please wait a moment.',
});
