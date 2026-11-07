import { Router } from 'express';
import { listMessages, sendMessage } from '../controllers/chat.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { chatMessageLimiter } from '../middleware/rateLimiter.js';
import { sendMessageSchema } from '../validators/notification.validators.js';

const router = Router();

// Group chat of a shared ride. Membership (a confirmed booking in this
// shared ride) is checked by the service for every request.
router.use(requireAuth);

router.get('/:poolId/messages', listMessages);
router.post('/:poolId/messages', chatMessageLimiter, validate(sendMessageSchema), sendMessage);

export default router;
