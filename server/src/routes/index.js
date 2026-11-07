// Collects every route file in one place. Everything here lives under /api.
// New features add one line below, e.g. router.use('/auth', authRoutes);
import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import tripRoutes from './trip.routes.js';
import notificationRoutes from './notification.routes.js';
import poolRoutes from './pool.routes.js';
import paymentRoutes from './payment.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/trips', tripRoutes);
router.use('/notifications', notificationRoutes);
router.use('/pools', poolRoutes); // shared-ride group chat
router.use('/payments', paymentRoutes);

export default router;
