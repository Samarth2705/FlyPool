// Login sessions: ending one on logout, and checking whether a token was ended.
// A session is the signed JWT in the auth cookie (see utils/jwt.js and
// utils/authCookie.js); it expires on its own after JWT_EXPIRES_IN.
import crypto from 'node:crypto';
import { RevokedToken } from '../models/RevokedToken.js';

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// End a session before it expires. `exp` is the token's expiry (seconds since
// 1970); the entry is deleted automatically after that moment.
export async function revokeToken(token, exp) {
  await RevokedToken.updateOne(
    { tokenHash: hashToken(token) },
    { $setOnInsert: { expiresAt: new Date(exp * 1000) } },
    { upsert: true },
  );
}

export async function isTokenRevoked(token) {
  return Boolean(await RevokedToken.exists({ tokenHash: hashToken(token) }));
}
