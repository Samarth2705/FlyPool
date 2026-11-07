// Builds the Express app (middleware + routes) without starting it.
// Keeping this separate from server.js lets tests import the app directly.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/requireAuth.js';
import { verificationLimiter } from './middleware/rateLimiter.js';
import { requestLogger } from './middleware/requestLogger.js';
import { requireDatabase } from './middleware/requireDatabase.js';
import { paymentWebhook } from './controllers/payment.controller.js';

const app = express();

// Behind a proxy / load balancer, trust it for the client IP (rate limits)
app.set('trust proxy', env.trustProxy);

// Security headers
app.use(helmet());

// Only our React app may call the API. `credentials: true` allows the
// auth cookie to be sent.
app.use(cors({ origin: env.clientOrigin, credentials: true }));

if (env.logRequests) app.use(requestLogger);

app.use(cookieParser());

// Flight verification carries a boarding pass / e-ticket (max 3 MB, sent as
// base64), so only that route accepts large bodies - and only from a
// logged-in, rate-limited user, checked BEFORE the body is read. It must come
// before the general parser: once a body is parsed, that parser skips it.
app.post('/api/trips/:tripId/verification', requireAuth, verificationLimiter, express.json({ limit: '5mb' }));

// Payment provider webhooks: the signature is over the exact bytes sent, so
// this route reads the raw body (before the JSON parser). No login - the
// signature authenticates it (services/payment.service.js).
app.post('/api/payments/webhook', express.raw({ type: '*/*', limit: '100kb' }), requireDatabase, paymentWebhook);

// Everything else: small JSON bodies only
app.use(express.json({ limit: '10kb' }));

// API responses hold personal data and change often: never let the browser
// or a proxy cache them (e.g. so Back after logout can't show a cached page).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// All API routes live under /api (see routes/index.js). They need MongoDB, so
// make sure it is connected first (matters on serverless hosts like Vercel).
app.use('/api', requireDatabase, apiRoutes);

// 404 + error handling (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
