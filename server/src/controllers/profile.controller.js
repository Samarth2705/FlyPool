// /api/profile - the logged-in passenger's own traveller profile
// /api/identity - their own identity verification status (never anyone else's)
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { ownProfile, updateProfile } from '../services/profile.service.js';
import { getIdentityStatus, handleIdentityWebhook, startIdentityVerification } from '../services/identity.service.js';

async function profileOf(userId) {
  const user = await User.findById(userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'Account not found.');
  return ownProfile(user, await getIdentityStatus(userId));
}

// GET /api/profile
export async function getProfile(req, res) {
  res.json({ success: true, data: { profile: await profileOf(req.userId) } });
}

// PATCH /api/profile
export async function patchProfile(req, res) {
  await updateProfile(req.userId, req.body);
  res.json({ success: true, data: { profile: await profileOf(req.userId) } });
}

// GET /api/identity
export async function getIdentity(req, res) {
  res.json({ success: true, data: { identity: await getIdentityStatus(req.userId) } });
}

// POST /api/identity/start { method, consent: true }
export async function startIdentity(req, res) {
  const identity = await startIdentityVerification(req.userId, req.body);
  res.status(identity.status === 'pending' ? 202 : 200).json({ success: true, data: { identity } });
}

// POST /api/identity/webhook - the KYC provider's result (raw body, signed)
export async function identityWebhook(req, res) {
  const result = await handleIdentityWebhook(req.body, req.get('x-identity-signature'));
  res.json({ success: true, data: result });
}
