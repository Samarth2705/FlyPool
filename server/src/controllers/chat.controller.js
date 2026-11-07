// /api/pools/:poolId/messages - a shared ride's group chat (members with a
// confirmed booking only - checked in services/chat.service.js)
import * as chatService from '../services/chat.service.js';
import { messageListQuerySchema } from '../validators/notification.validators.js';
import { AppError } from '../utils/AppError.js';

// GET /api/pools/:poolId/messages?since=<ISO>|before=<ISO>
export async function listMessages(req, res) {
  const query = messageListQuerySchema.safeParse(req.query);
  if (!query.success) throw new AppError(400, 'VALIDATION_ERROR', query.error.issues[0].message);
  res.json({ success: true, data: await chatService.listMessages(req.params.poolId, req.userId, query.data) });
}

// POST /api/pools/:poolId/messages { text, clientMessageId }
// 201 new message, 200 the same message sent again (no duplicate)
export async function sendMessage(req, res) {
  const { message, created } = await chatService.sendMessage(req.params.poolId, req.userId, req.body);
  res.status(created ? 201 : 200).json({ success: true, data: { message, created } });
}
