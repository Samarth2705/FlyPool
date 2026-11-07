import { Router } from 'express';
import mongoose from 'mongoose';
import {
  listNotifications,
  markRead,
  markAllRead,
  registerDeviceToken,
  removeDeviceToken,
} from '../controllers/notification.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { deviceTokenLimiter } from '../middleware/rateLimiter.js';
import { AppError } from '../utils/AppError.js';
import { deviceTokenSchema, deviceTokenRemoveSchema } from '../validators/notification.validators.js';

const router = Router();

// Only the logged-in passenger's own notifications
router.use(requireAuth);

router.param('notificationId', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return next(new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.'));
  next();
});

router.get('/', listNotifications);
router.patch('/read-all', markAllRead); // before /:notificationId
router.patch('/:notificationId/read', markRead);

// This phone's push token (registered after login, removed on logout)
router.post('/device-token', deviceTokenLimiter, validate(deviceTokenSchema), registerDeviceToken);
router.delete('/device-token', deviceTokenLimiter, validate(deviceTokenRemoveSchema), removeDeviceToken);

export default router;
