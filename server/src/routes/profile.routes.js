// /api/profile and /api/identity - the logged-in passenger's own data only.
// (The provider webhook, POST /api/identity/webhook, is registered in app.js:
// it needs the raw body and is authenticated by its signature, not a login.)
import { Router } from 'express';
import { getIdentity, getProfile, patchProfile, startIdentity } from '../controllers/profile.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { tripWriteLimiter, verificationLimiter } from '../middleware/rateLimiter.js';
import { identityStartSchema, profileUpdateSchema } from '../validators/profile.validators.js';

export const profileRoutes = Router();
profileRoutes.use(requireAuth);
profileRoutes.get('/', getProfile);
profileRoutes.patch('/', tripWriteLimiter, validate(profileUpdateSchema), patchProfile);

export const identityRoutes = Router();
identityRoutes.use(requireAuth);
identityRoutes.get('/', getIdentity);
identityRoutes.post('/start', verificationLimiter, validate(identityStartSchema), startIdentity);
