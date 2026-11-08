// Notification API calls. Server side: server/src/routes/notification.routes.js
// All of them are about the logged-in passenger only (bearer token).
import api, { unwrap } from './client';

// Newest first, 30 at a time: { notifications, unreadCount, nextBefore }
// notification: { id, type, title, message, tripId, poolId,
//                 bookingReference, read, readAt, createdAt }
export async function listNotifications({ before } = {}) {
  return unwrap(await api.get('/notifications', { params: before ? { before } : undefined }));
}

export async function markNotificationRead(id) {
  return unwrap(await api.patch(`/notifications/${id}/read`)).notification;
}

// -> { updated }
export async function markAllNotificationsRead() {
  return unwrap(await api.patch('/notifications/read-all'));
}

// This phone's Expo push token (one record per token on the server)
export async function registerDeviceToken(token, platform) {
  return unwrap(await api.post('/notifications/device-token', { token, platform }));
}

// Called while logging out: short timeout, so an offline phone isn't held up
export async function removeDeviceToken(token) {
  return unwrap(await api.delete('/notifications/device-token', { data: { token }, timeout: 5000 }));
}
