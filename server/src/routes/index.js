// Collects every route file in one place. Everything here lives under /api.
// New features add one line below, e.g. router.use('/auth', authRoutes);
import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import tripRoutes from './trip.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/trips', tripRoutes);

export default router;
