// Auth API calls for the app. Server side: server/src/routes/auth.routes.js
// The app uses the /auth/mobile/* routes, which return a bearer token in the
// body instead of setting the website's cookie.
import api, { unwrap } from './client';

// { user, token, expiresAt }
export async function mobileLogin({ email, password }) {
  return unwrap(await api.post('/auth/mobile/login', { email, password }));
}

// details: { name, email, phone, password } -> { user, token, expiresAt }
export async function mobileRegister(details) {
  return unwrap(await api.post('/auth/mobile/register', details));
}

// The logged-in user (validates the current token)
export async function getMe() {
  return unwrap(await api.get('/auth/me')).user;
}

// Revokes the current token on the server
export async function logout() {
  await api.post('/auth/logout');
}
