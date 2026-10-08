// Collects every route file in one place. Everything here lives under /api.
// New features add one line below, e.g. router.use('/auth', authRoutes);
import { Router } from 'express';
import healthRoutes from './health.routes.js';

const router = Router();

router.use('/health', healthRoutes);

export default router;
