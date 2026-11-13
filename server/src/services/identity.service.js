// Identity verification through an authorised KYC provider.
//
// How it works (once a provider is configured - IDENTITY_PROVIDER):
//   1. The passenger chooses a method and gives explicit consent in the app.
//   2. POST /api/identity/start asks the provider for a verification session
//      and returns the provider's own URL; the passenger completes it THERE
//      (documents and Aadhaar OTP never pass through FlyPool).
//   3. The provider reports the outcome to POST /api/identity/webhook, signed
//      with IDENTITY_WEBHOOK_SECRET (HMAC-SHA256 of the raw body).
//   4. Only then is the passenger "verified". Rejected -> they may try again.
//
// No provider configured (the default): starting is refused with a clear 503
// and nobody is ever shown as verified. There is no "demo" identity check.
// "sandbox" is a stand-in used by the automated tests ONLY - config/env.js
// refuses it outside NODE_ENV=test - so the flow can be tested end to end.
//
// To connect a real provider: registerIdentityProvider(name, { createSession })
// and set IDENTITY_PROVIDER=name. createSession({ method, subject }) must return
// { reference, url } - subject is an opaque per-user id, not a name or email.
import crypto from 'node:crypto';
import { IdentityVerification, IDENTITY_METHODS } from '../models/IdentityVerification.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

export const CONSENT_VERSION = '2026-11-identity-v1';
const PENDING_EXPIRES_MS = 24 * 60 * 60 * 1000; // an unfinished session can be restarted after a day

const providers = {
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
    methods: provider ? (provider.methods ?? IDENTITY_METHODS) : [],
    consentVersion: CONSENT_VERSION,
  };
  if (!record) return { ...base, status: 'not_started', canStart: Boolean(provider) };
  const stale = record.status === 'pending' && Date.now() - record.startedAt.getTime() > PENDING_EXPIRES_MS;
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
