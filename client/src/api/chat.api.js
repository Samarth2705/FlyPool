// Group chat of a shared taxi. Server side: server/src/routes/pool.routes.js
// and services/chat.service.js. Only passengers with a CONFIRMED booking in
// that shared ride get access - anyone else (another taxi's passenger, a
// cancelled or departed passenger, a made-up id) gets 404 CHAT_NOT_FOUND.
// The server checks this on every request; nothing here is trusted.
import api from './client';

// { conversation: { poolId, vehicleType, members: [{ userId, name, isYou, area, partySize }] },
//   messages: [{ id, text, createdAt, clientMessageId?, sender: { name, isYou } }],
//   hasOlder, serverTime }
//   since:  ISO time - messages from (a little before) then, for polling
//   before: ISO time - an older page
export async function getMessages(poolId, { since, before, signal } = {}) {
  const params = since ? { since } : before ? { before } : undefined;
  const res = await api.get(`/pools/${poolId}/messages`, { params, signal });
  return res.data.data;
}

// clientMessageId: a random UUID made once per message. Sending it again
// (double click, retry after a lost answer) returns the message already
// saved - never a duplicate. Returns the saved message.
export async function sendMessage(poolId, { text, clientMessageId }) {
  const res = await api.post(`/pools/${poolId}/messages`, { text, clientMessageId });
  return res.data.data.message;
}
