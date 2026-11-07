// /api/notifications - the logged-in passenger's own notifications and push
// tokens. Every query is limited to req.userId (set by requireAuth).
import * as notificationService from '../services/notification.service.js';
import { notificationListQuerySchema } from '../validators/notification.validators.js';
import { AppError } from '../utils/AppError.js';

// GET /api/notifications?before=<ISO> - newest first, with the unread count
export async function listNotifications(req, res) {
  const query = notificationListQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError(400, 'VALIDATION_ERROR', query.error.issues[0].message);
  res.json({ success: true, data: await notificationService.listNotifications(req.userId, query.data) });
}

// PATCH /api/notifications/:notificationId/read
export async function markRead(req, res) {
  const notification = await notificationService.markRead(req.userId, req.params.notificationId);
  res.json({ success: true, data: { notification } });
}

// PATCH /api/notifications/read-all
export async function markAllRead(req, res) {
  res.json({ success: true, data: await notificationService.markAllRead(req.userId) });
}

// POST /api/notifications/device-token { token, platform }
export async function registerDeviceToken(req, res) {
  res.json({ success: true, data: await notificationService.registerDeviceToken(req.userId, req.body) });
}

// DELETE /api/notifications/device-token { token }
export async function removeDeviceToken(req, res) {
  res.json({ success: true, data: await notificationService.removeDeviceToken(req.userId, req.body.token) });
}
