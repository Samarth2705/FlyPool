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

// Flight verification carries a boarding pass / e-ticket (max 5 MB, sent as
// base64), so only that route accepts large bodies - and only from a
// logged-in, rate-limited user, checked BEFORE the body is read. It must come
// before the general parser: once a body is parsed, that parser skips it.
app.post('/api/trips/:tripId/verification', requireAuth, verificationLimiter, express.json({ limit: '8mb' }));

// Everything else: small JSON bodies only
app.use(express.json({ limit: '10kb' }));

// All API routes live under /api (see routes/index.js)
app.use('/api', apiRoutes);

// 404 + error handling (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
