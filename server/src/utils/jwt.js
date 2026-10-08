// Creating and checking JSON Web Tokens.
// The token only stores the user's id (`sub` = "subject"), nothing private.
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// Returns the decoded payload, or throws if the token is invalid or expired.
export function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}
