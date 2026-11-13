// A passenger's identity verification - the RESULT only.
//
// FlyPool never receives identity documents: the passenger shows their
// passport / Aadhaar / licence to an authorised KYC provider in the provider's
// own flow, and the provider tells FlyPool the outcome (signed webhook). So
// this collection holds no images, no document numbers, no Aadhaar number, no
// date of birth from the document - only:
//   status, the method chosen, the provider's name and its opaque reference,
//   when the passenger consented, and when the result came.
// Readable by the account holder only (GET /api/identity); other passengers
// see "verified" / "not verified" through a shared profile, nothing else.
// Deleted with the account (account.service.js).
import mongoose from 'mongoose';

export const IDENTITY_STATUSES = ['pending', 'verified', 'rejected'];
export const IDENTITY_METHODS = ['passport', 'aadhaar', 'driving_licence', 'voter_id'];

const identityVerificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    status: { type: String, enum: IDENTITY_STATUSES, required: true },
    method: { type: String, enum: IDENTITY_METHODS, required: true },
    provider: { type: String, required: true }, // which KYC provider ran the check
    providerReference: { type: String, required: true }, // the provider's session id (opaque)
    consent: {
      givenAt: { type: Date, required: true },
      version: { type: String, required: true }, // the consent text the passenger agreed to
    },
    attempts: { type: Number, default: 1 },
    startedAt: { type: Date, required: true },
    verifiedAt: Date,
    // Why it was rejected, as a short code from the provider (e.g. "document_unreadable") - no document details
    rejectedReason: String,
    rejectedAt: Date,
  },
  { timestamps: true },
);

identityVerificationSchema.index({ providerReference: 1 }, { unique: true });

export const IdentityVerification = mongoose.model('IdentityVerification', identityVerificationSchema);
