// Builds the Express app (middleware + routes) without starting it.
// Keeping this separate from server.js lets tests import the app directly.
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { env } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security headers
app.use(helmet());

// Only our React app may call the API. `credentials: true` allows the
// auth cookie to be sent.
app.use(cors({ origin: env.clientOrigin, credentials: true }));

// Parse JSON bodies (with a size limit) and cookies
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Routes
app.use('/api/health', healthRoutes);

// 404 + error handling (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
