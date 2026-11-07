// /api/payments - the logged-in passenger's payments. (The provider webhook,
// POST /api/payments/webhook, is registered in app.js: it needs the raw body
// and is authenticated by its signature, not a login.)
import { Router } from 'express';
import { completeDemoPayment, listMyPayments } from '../controllers/payment.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { paymentLimiter } from '../middleware/rateLimiter.js';
import { demoResultSchema } from '../validators/payment.validators.js';

const router = Router();

router.use(requireAuth);

router.get('/', listMyPayments);
router.post('/:paymentId/demo-result', paymentLimiter, validate(demoResultSchema), completeDemoPayment);

export default router;
