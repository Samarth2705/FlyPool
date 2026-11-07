// Creating and checking JSON Web Tokens.
// The token only stores the user's id (`sub` = "subject"), nothing private.
//
// Two kinds of session token:
//   web     the website's login cookie. No `typ` claim (unchanged from before
//           mobile existed), lifetime JWT_EXPIRES_IN (default 1 day).
//   mobile  the app's bearer token: `typ: 'mobile'`, lifetime
//           JWT_MOBILE_EXPIRES_IN (default 30 days).
// Each kind is only accepted from its own channel (see utils/sessionToken.js).
//
// Every token gets a random id (`jti`), so two logins in the same second
// still produce different tokens - logging out one device must never log
// out another (revocation works per token, see services/session.service.js).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// Pinned, so a token signed any other way (e.g. "none") is never accepted
const ALGORITHM = 'HS256';

export const MOBILE_TOKEN_TYPE = 'mobile';

export function signToken(userId, { mobile = false } = {}) {
  const payload = mobile ? { sub: String(userId), typ: MOBILE_TOKEN_TYPE } : { sub: String(userId) };
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: mobile ? env.jwtMobileExpiresIn : env.jwtExpiresIn,
    algorithm: ALGORITHM,
    jwtid: crypto.randomUUID(),
  });
}

// Returns the decoded payload, or throws if the token is invalid or expired.
export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret, { algorithms: [ALGORITHM] });
}

export const isMobileToken = (payload) => payload?.typ === MOBILE_TOKEN_TYPE;
