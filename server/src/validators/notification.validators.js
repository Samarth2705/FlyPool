// Rules for the notification and chat routes.
import { z } from 'zod';

const isoDate = z.iso.datetime({ offset: true, error: 'Use an ISO date and time.' });

// GET /api/notifications?before=<ISO date>
export const notificationListQuerySchema = z.object({ before: isoDate.optional() });

// POST /api/notifications/device-token - an Expo push token for this phone
const expoPushToken = z
  .string({ error: 'Push token is required.' })
  .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/, 'Not an Expo push token.');

export const deviceTokenSchema = z
  .object({
    token: expoPushToken,
    platform: z.enum(['ios', 'android'], { error: 'Platform must be ios or android.' }),
  })
  .strict('This field cannot be set.');

// DELETE /api/notifications/device-token
export const deviceTokenRemoveSchema = z.object({ token: expoPushToken }).strict('This field cannot be set.');

// GET /api/pools/:poolId/messages?since=<ISO>|before=<ISO>
export const messageListQuerySchema = z.object({ since: isoDate.optional(), before: isoDate.optional() });

// POST /api/pools/:poolId/messages - the text is cleaned and length-checked
// again in services/chat.service.js
export const sendMessageSchema = z
  .object({
    text: z.string({ error: 'Type a message first.' }).max(4000, 'Messages can be up to 1000 characters.'),
    clientMessageId: z.uuid({ error: 'clientMessageId must be a UUID.' }),
  })
  .strict('This field cannot be set.');
