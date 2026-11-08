// Group chat of a shared ride. Server side: server/src/routes/pool.routes.js
// Only passengers with a confirmed booking in that shared ride get access -
// anyone else gets 404 CHAT_NOT_FOUND (checked by the server every time).
import api, { unwrap } from './client';

// { conversation: { poolId, vehicleType, members: [{ userId, name, isYou, area, partySize }] },
//   messages: [{ id, text, createdAt, clientMessageId?, sender: { name, isYou } }],
//   hasOlder, serverTime }
//   since: ISO time - messages from (a little before) then, for polling
//   before: ISO time - an older page
export async function getMessages(poolId, { since, before } = {}) {
  const params = since ? { since } : before ? { before } : undefined;
  return unwrap(await api.get(`/pools/${poolId}/messages`, { params }));
}

// clientMessageId: a random UUID per message - sending it again (retry)
// returns the message already saved instead of a duplicate.
export async function sendMessage(poolId, { text, clientMessageId }) {
  return unwrap(await api.post(`/pools/${poolId}/messages`, { text, clientMessageId })).message;
}
