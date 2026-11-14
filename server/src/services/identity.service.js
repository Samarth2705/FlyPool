// Identity verification.
//
// MANUAL (IDENTITY_PROVIDER=manual, the default) - a simple demo check:
//   1. The passenger picks the document type, agrees, and uploads a photo or
//      PDF of it: POST /api/identity/submit -> status "pending".
//   2. Someone looks at it by hand: `npm run identity:review` (scripts/
//      reviewIdentity.js) -> "verified" or "rejected". The uploaded file is
//      deleted as soon as it is reviewed (and after 14 days if it never is).
//   3. Rejected -> the passenger may upload again.
//   This is a manual demo check: nothing is confirmed with any authority, and
//   the apps say so. The file is never shown to other passengers or sent back
//   by the API; nothing is read off it.
//
// EXTERNAL PROVIDER (kept for later) - once a provider is configured:
//   1. The passenger chooses a method and gives explicit consent in the app.
//   2. POST /api/identity/start asks the provider for a verification session
//      and returns the provider's own URL; the passenger completes it THERE
//      (documents and Aadhaar OTP never pass through FlyPool).
//   3. The provider reports the outcome to POST /api/identity/webhook, signed
//      with IDENTITY_WEBHOOK_SECRET (HMAC-SHA256 of the raw body).
//   4. Only then is the passenger "verified". Rejected -> they may try again.
//
// IDENTITY_PROVIDER=off: starting is refused with a clear 503 and nobody is
// ever shown as verified.
// "sandbox" is a stand-in used by the automated tests ONLY - config/env.js
// refuses it outside NODE_ENV=test - so the flow can be tested end to end.
//
// To connect a real provider: registerIdentityProvider(name, { createSession })
// and set IDENTITY_PROVIDER=name. createSession({ method, subject }) must return
// { reference, url } - subject is an opaque per-user id, not a name or email.
import crypto from 'node:crypto';
import { IdentityVerification, IDENTITY_METHODS } from '../models/IdentityVerification.js';
import { IdentityDocument, IDENTITY_DOCUMENT_TTL_SECONDS } from '../models/IdentityDocument.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { inspectDocument } from './flightVerification.service.js';

export const CONSENT_VERSION = '2026-11-identity-v1';
const PENDING_EXPIRES_MS = 24 * 60 * 60 * 1000; // an unfinished session can be restarted after a day
// A manual check waits for review; once its file has expired unreviewed, the passenger may upload again
const MANUAL_PENDING_EXPIRES_MS = IDENTITY_DOCUMENT_TTL_SECONDS * 1000;

const isManual = () => env.identityProvider === 'manual';

const providers = {
  // A person reviews the uploaded ID (npm run identity:review) - see the top of this file
  manual: { label: 'Manual check (demo)', methods: IDENTITY_METHODS, manual: true },
  // Test stand-in: makes a session reference; the tests send the outcome as a signed webhook
  sandbox: {
    label: 'Test provider (automated tests only)',
    methods: IDENTITY_METHODS,
    // Like a real provider, it returns its hosted page's URL (here on a domain that can't resolve)
    createSession: async () => {
      const reference = `sandbox_${crypto.randomUUID()}`;
      return { reference, url: `https://identity-sandbox.invalid/session/${reference}` };
    },
  },
};

export function registerIdentityProvider(name, provider) {
  providers[name] = provider;
}

const configuredProvider = () => (env.identityProvider !== 'off' ? (providers[env.identityProvider] ?? null) : null);

// An opaque id the provider can use to recognise a returning passenger without
// learning anything about them (no name, email or phone is sent)
const subjectFor = (userId) => crypto.createHmac('sha256', env.jwtSecret).update(`identity:${userId}`).digest('hex').slice(0, 32);

// What the account holder sees about their own verification
function statusView(record) {
  const provider = configuredProvider();
  const base = {
    available: Boolean(provider),
    // true: a person reviews an uploaded ID (demo) - the apps upload a file (POST /submit)
    manual: Boolean(provider?.manual),
    methods: provider ? (provider.methods ?? IDENTITY_METHODS) : [],
    consentVersion: CONSENT_VERSION,
  };
  if (!record) return { ...base, status: 'not_started', canStart: Boolean(provider) };
  const pendingFor = record.provider === 'manual' ? MANUAL_PENDING_EXPIRES_MS : PENDING_EXPIRES_MS;
  const stale = record.status === 'pending' && Date.now() - record.startedAt.getTime() > pendingFor;
  return {
    ...base,
    status: record.status,
    method: record.method,
    startedAt: record.startedAt,
    verifiedAt: record.verifiedAt ?? null,
    rejectedReason: record.status === 'rejected' ? (record.rejectedReason ?? 'not_verified') : null,
    attempts: record.attempts,
    // Retry after a rejection, or when a session was never finished
    canStart: Boolean(provider) && (record.status === 'rejected' || stale),
  };
}

export async function getIdentityStatus(userId) {
  return statusView(await IdentityVerification.findOne({ userId }));
}

// Users (of these ids) with a genuinely verified identity
export async function verifiedUserIds(userIds) {
  if (userIds.length === 0) return new Set();
  const rows = await IdentityVerification.find({ userId: { $in: userIds }, status: 'verified' }).select('userId');
  return new Set(rows.map((r) => String(r.userId)));
}

// POST /api/identity/start { method, consent: true }
export async function startIdentityVerification(userId, { method, consent }) {
  const provider = configuredProvider();
  if (!provider) {
    throw new AppError(
      503,
      'IDENTITY_UNAVAILABLE',
      'Identity verification isn’t available in FlyPool yet. No documents are collected - nothing to do for now.',
    );
  }
  if (consent !== true) {
    throw new AppError(400, 'CONSENT_REQUIRED', 'Please read and agree to how your identity is checked before continuing.');
  }
  if (!(provider.methods ?? IDENTITY_METHODS).includes(method)) {
    throw new AppError(400, 'METHOD_UNAVAILABLE', 'That document type can’t be used for verification right now.');
  }
  if (provider.manual) {
    throw new AppError(400, 'DOCUMENT_REQUIRED', 'Upload a photo or PDF of your ID to request a check.');
  }

  const existing = await IdentityVerification.findOne({ userId });
  const view = statusView(existing);
  if (existing?.status === 'verified') throw new AppError(409, 'ALREADY_VERIFIED', 'Your identity is already verified.');
  if (existing?.status === 'pending' && !view.canStart) return { ...view, url: null }; // still in progress

  let session;
  try {
    session = await provider.createSession({ method, subject: subjectFor(userId) });
  } catch (err) {
    console.error(`[identity] provider session failed: ${err.message}`);
    throw new AppError(503, 'IDENTITY_PROVIDER_ERROR', 'We couldn’t start identity verification right now. Please try again later.');
  }

  const now = new Date();
  const record = await IdentityVerification.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'pending',
        method,
        provider: env.identityProvider,
        providerReference: session.reference,
        consent: { givenAt: now, version: CONSENT_VERSION },
        startedAt: now,
        attempts: (existing?.attempts ?? 0) + 1,
      },
      $unset: { verifiedAt: 1, rejectedReason: 1, rejectedAt: 1 },
    },
    { upsert: true, new: true },
  );
  return { ...statusView(record), url: session.url ?? null };
}

const REASON = /^[a-z_]{2,40}$/;

// POST /api/identity/webhook - the provider's result. Body (JSON, raw bytes signed):
//   { reference, status: "verified" | "rejected", reason? }
// Anything else in the body (names, document fields) is ignored and never stored.
export async function handleIdentityWebhook(rawBody, signature) {
  const secret = env.identityWebhookSecret;
  if (!secret) throw new AppError(503, 'WEBHOOKS_NOT_CONFIGURED', 'Identity webhooks are not configured.');
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = String(signature ?? '');
  if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    throw new AppError(401, 'INVALID_SIGNATURE', 'Invalid signature.');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (typeof event?.reference !== 'string' || !['verified', 'rejected'].includes(event.status)) {
    throw new AppError(400, 'INVALID_EVENT', 'Unknown identity event.');
  }

  // Only a pending session changes, and only once (repeats change nothing)
  const update =
    event.status === 'verified'
      ? { $set: { status: 'verified', verifiedAt: new Date() } }
      : { $set: { status: 'rejected', rejectedAt: new Date(), rejectedReason: REASON.test(event.reason ?? '') ? event.reason : 'not_verified' } };
  const updated = await IdentityVerification.findOneAndUpdate({ providerReference: event.reference, status: 'pending' }, update, { new: true });
  return { applied: Boolean(updated) };
}

// ---- manual (demo) identity check -----------------------------------------------

// POST /api/identity/submit { method, consent: true, document: { mimeType, dataBase64 } }
// The ID goes to the review queue (status "pending"). Refused when checks are
// off, already verified, or already waiting for review.
export async function submitIdentityProof(userId, { method, consent, document }) {
  if (!isManual()) {
    throw new AppError(503, 'IDENTITY_UNAVAILABLE', 'Identity verification isn’t available in FlyPool right now.');
  }
  if (consent !== true) {
    throw new AppError(400, 'CONSENT_REQUIRED', 'Please read and agree to how your identity is checked before continuing.');
  }
  if (!IDENTITY_METHODS.includes(method)) {
    throw new AppError(400, 'METHOD_UNAVAILABLE', 'That document type can’t be used for verification right now.');
  }
  const existing = await IdentityVerification.findOne({ userId });
  if (existing?.status === 'verified') throw new AppError(409, 'ALREADY_VERIFIED', 'Your identity is already verified.');
  if (existing?.status === 'pending' && !statusView(existing).canStart) {
    throw new AppError(409, 'ALREADY_SUBMITTED', 'Your ID is already waiting for review.');
  }

  const { facts, bytes } = inspectDocument(document); // 400 unless a real JPG/PNG/WebP/PDF of at most 3 MB
  const reference = `manual_${crypto.randomUUID()}`;
  const now = new Date();
  await IdentityDocument.findOneAndUpdate(
    { userId },
    { $set: { reference, mimeType: document.mimeType, sizeBytes: facts.sizeBytes, data: bytes, createdAt: now } },
    { upsert: true },
  );
  const record = await IdentityVerification.findOneAndUpdate(
    { userId },
    {
      $set: {
        status: 'pending',
        method,
        provider: 'manual',
        providerReference: reference,
        consent: { givenAt: now, version: CONSENT_VERSION },
        startedAt: now,
        attempts: (existing?.attempts ?? 0) + 1,
      },
      $unset: { verifiedAt: 1, rejectedReason: 1, rejectedAt: 1 },
    },
    { upsert: true, new: true },
  );
  return statusView(record);
}

// For the review script only (never an API): IDs waiting for a manual check
export async function pendingManualChecks() {
  return IdentityVerification.find({ provider: 'manual', status: 'pending' }).sort({ startedAt: 1 });
}

// For the review script only: the uploaded file of a pending check (or null)
export async function manualCheckDocument(reference) {
  return IdentityDocument.findOne({ reference });
}

// For the review script only: decide a pending manual check. The uploaded file
// is deleted either way. Returns { applied } (false if it wasn't pending).
export async function reviewManualCheck(reference, decision, reason = 'not_verified') {
  if (!['verified', 'rejected'].includes(decision)) throw new Error('decision must be "verified" or "rejected"');
  const update =
    decision === 'verified'
      ? { $set: { status: 'verified', verifiedAt: new Date() } }
      : { $set: { status: 'rejected', rejectedAt: new Date(), rejectedReason: REASON.test(reason) ? reason : 'not_verified' } };
  const updated = await IdentityVerification.findOneAndUpdate({ providerReference: reference, provider: 'manual', status: 'pending' }, update, {
    new: true,
  });
  await IdentityDocument.deleteOne({ reference });
  return { applied: Boolean(updated) };
}
