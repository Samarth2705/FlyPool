// Small helpers for the group chat (pages/GroupChatPage.jsx, chat/useChatUnread.js).

// A random UUID v4 for each message sent (the server's duplicate guard).
// crypto.randomUUID only exists on secure pages (https / localhost), so fall
// back to getRandomValues elsewhere (e.g. a dev server opened over the LAN).
export function newMessageId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// When this passenger last saw a chat - per account and shared ride, kept in
// this browser only (it just drives the "new messages" dot; the server never
// relies on it). Storage can be missing or blocked: then everything still
// works, the dot is just less precise.
const key = (userId, poolId) => `flypool.chat.lastRead.${userId}.${poolId}`;

export function lastReadAt(userId, poolId) {
  try {
    return localStorage.getItem(key(userId, poolId));
  } catch {
    return null;
  }
}

export function markRead(userId, poolId, iso) {
  if (!userId || !poolId || !iso) return;
  try {
    const previous = localStorage.getItem(key(userId, poolId));
    if (!previous || previous < iso) localStorage.setItem(key(userId, poolId), iso);
  } catch {
    // storage unavailable - nothing to remember
  }
}

// Messages from OTHER passengers newer than the last time this one looked
export function unreadCount(messages, since) {
  return messages.filter((m) => !m.sender?.isYou && (!since || m.createdAt > since)).length;
}

// Server order: time, then id
export const byTime = (a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1);

// "4:05 pm" today, "14 Jan, 4:05 pm" on other days (India time, as the rest of FlyPool)
export function messageTime(iso, now = new Date()) {
  const date = new Date(iso);
  const day = (d) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'short', timeZone: 'Asia/Kolkata' }).format(d);
  const sameDay = day(date) === day(now);
  return new Intl.DateTimeFormat('en-IN', {
    ...(sameDay ? {} : { day: 'numeric', month: 'short' }),
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }).format(date);
}
