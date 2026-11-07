import mongoose from 'mongoose';

// A login token that was logged out before it expired. requireAuth rejects
// any token listed here, so logging out ends the session on the server too,
// not just in the browser.
//
// Only a SHA-256 hash of the token is stored - never the token itself - so
// this collection can't be used to log in as anyone.
// The TTL index deletes each entry once the token would have expired anyway,
// so the collection stays small on its own.
const revokedTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 },
});

export const RevokedToken = mongoose.model('RevokedToken', revokedTokenSchema);
