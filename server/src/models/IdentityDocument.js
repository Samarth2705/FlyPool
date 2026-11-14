// The ID a passenger uploaded for a MANUAL identity check - kept only until
// someone has reviewed it (npm run identity:review), then deleted. A document
// nobody reviews is deleted automatically after 14 days (TTL index below).
//
// Never returned by any API and never shown to other passengers. Only the
// file itself is kept: no document number is typed in or extracted.
// Deleted with the account (account.service.js).
import mongoose from 'mongoose';

export const IDENTITY_DOCUMENT_TTL_SECONDS = 14 * 24 * 60 * 60;

const identityDocumentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  reference: { type: String, required: true, unique: true }, // = IdentityVerification.providerReference
  mimeType: { type: String, required: true },
  sizeBytes: { type: Number, required: true },
  data: { type: Buffer, required: true },
  createdAt: { type: Date, default: Date.now, expires: IDENTITY_DOCUMENT_TTL_SECONDS },
});

export const IdentityDocument = mongoose.model('IdentityDocument', identityDocumentSchema);
