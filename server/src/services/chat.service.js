// Group chat for a shared ride (pool):
//   GET  /api/pools/:poolId/messages   the conversation + messages
//   POST /api/pools/:poolId/messages   send one
//
// Who may use it - checked on the server for EVERY request, from the
// database (nothing the app sends about membership is trusted):
//   the caller has a trip that is in this shared ride, is not cancelled, and
//   has a CONFIRMED booking for it. Anyone else gets 404 CHAT_NOT_FOUND - the
//   same answer as a shared ride that doesn't exist, so ids can't be probed.
// Solo rides have no shared ride, so no chat.
//
// Members are shown by first name and last initial only ("Asha V.") - no
// phone numbers, emails or full names. Message text is plain text: trimmed,
// control characters removed, 1-1000 characters. The app shows it as text,
// never as HTML.
//
// Updates are fetched by polling (the API runs on serverless functions,
// which can't keep WebSocket connections open): `since` returns messages
// from a moment slightly before that time, and the app drops ones it
// already has, so no message is missed or shown twice.
import mongoose from 'mongoose';
import { ChatMessage, MAX_MESSAGE_LENGTH } from '../models/ChatMessage.js';
import { Pool } from '../models/Pool.js';
import { Trip } from '../models/Trip.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

const PAGE_SIZE = 50;
const SINCE_OVERLAP_MS = 5000; // clocks of different servers can differ slightly

const notFound = () => new AppError(404, 'CHAT_NOT_FOUND', 'This chat isn’t available.');

// "Asha Verma" -> "Asha V."
export function displayName(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Traveller';
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts.at(-1)[0].toUpperCase()}.`;
}

// Plain text only: no control characters (except new lines), trimmed
export function cleanText(text) {
  // eslint-disable-next-line no-control-regex
  return String(text ?? '').replace(/[\u0000-\u0009\u000B-\u001F\u007F\u200B-\u200F\u2028-\u202E\u2060-\u2064\uFEFF]/g, '').trim();
}

// The conversation if this user may use it, else 404
async function conversationFor(poolId, userId) {
  if (!mongoose.isValidObjectId(poolId)) throw notFound();
  const myTrip = await Trip.findOne({
    userId,
    poolId,
    status: { $ne: 'cancelled' },
    'booking.status': 'confirmed',
  });
  if (!myTrip) throw notFound();
  const pool = await Pool.findById(poolId);
  if (!pool || pool.status === 'cancelled' || !pool.members.some((m) => String(m.tripId) === String(myTrip._id))) {
    throw notFound();
  }

  // The chat's members: passengers in this shared ride with a confirmed booking
  const memberTripIds = pool.members.map((m) => m.tripId);
  const bookedTrips = await Trip.find({ _id: { $in: memberTripIds }, poolId, 'booking.status': 'confirmed' }).select('userId destination passengerCount');
  const users = await User.find({ _id: { $in: bookedTrips.map((t) => t.userId) } }).select('name');
  const nameOf = new Map(users.map((u) => [String(u._id), displayName(u.name)]));
  const areaOf = new Map(pool.members.map((m) => [String(m.tripId), m.destinationArea]));

  return {
    pool,
    members: bookedTrips.map((t) => ({
      userId: String(t.userId),
      name: nameOf.get(String(t.userId)) ?? 'Traveller',
      isYou: String(t.userId) === String(userId),
      area: areaOf.get(String(t._id)) ?? null,
      partySize: t.passengerCount,
    })),
  };
}

async function publicMessages(messages, userId) {
  const senderIds = [...new Set(messages.map((m) => String(m.senderId)))];
  const users = senderIds.length ? await User.find({ _id: { $in: senderIds } }).select('name') : [];
  const nameOf = new Map(users.map((u) => [String(u._id), displayName(u.name)]));
  return messages.map((m) => ({
    id: String(m._id),
    text: m.text,
    createdAt: m.createdAt.toISOString(),
    clientMessageId: String(m.senderId) === String(userId) ? m.clientMessageId : undefined,
    sender: {
      name: nameOf.get(String(m.senderId)) ?? 'Former passenger',
      isYou: String(m.senderId) === String(userId),
    },
  }));
}

// The latest page, older pages (`before`), or new ones since a moment (`since`)
export async function listMessages(poolId, userId, { since, before } = {}) {
  const { pool, members } = await conversationFor(poolId, userId);
  let messages;
  let hasOlder = false;
  if (since) {
    const from = new Date(new Date(since).getTime() - SINCE_OVERLAP_MS);
    messages = await ChatMessage.find({ poolId, createdAt: { $gte: from } }).sort({ createdAt: 1, _id: 1 }).limit(200);
  } else {
    const filter = { poolId, ...(before ? { createdAt: { $lt: new Date(before) } } : {}) };
    const newestFirst = await ChatMessage.find(filter).sort({ createdAt: -1, _id: -1 }).limit(PAGE_SIZE + 1);
    hasOlder = newestFirst.length > PAGE_SIZE;
    messages = newestFirst.slice(0, PAGE_SIZE).reverse();
  }
  return {
    conversation: {
      poolId: String(pool._id),
      vehicleType: pool.vehicleType,
      members,
    },
    messages: await publicMessages(messages, userId),
    hasOlder,
    serverTime: new Date().toISOString(),
  };
}

// Returns { message, created } - the same clientMessageId again returns the
// message already saved (created: false)
export async function sendMessage(poolId, userId, { text, clientMessageId }) {
  await conversationFor(poolId, userId);
  const clean = cleanText(text);
  if (!clean) throw new AppError(400, 'VALIDATION_ERROR', 'Type a message first.', [{ field: 'text', message: 'Type a message first.' }]);
  if (clean.length > MAX_MESSAGE_LENGTH) {
    throw new AppError(400, 'VALIDATION_ERROR', `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.`, [
      { field: 'text', message: `Messages can be up to ${MAX_MESSAGE_LENGTH} characters.` },
    ]);
  }

  let saved;
  let created = true;
  try {
    saved = await ChatMessage.create({ poolId, senderId: userId, text: clean, clientMessageId });
  } catch (error) {
    if (error.code !== 11000) throw error;
    saved = await ChatMessage.findOne({ poolId, senderId: userId, clientMessageId });
    created = false;
  }
  const [message] = await publicMessages([saved], userId);
  return { message, created };
}
