// Auth API calls. The server sets / clears the httpOnly cookie itself,
// so the frontend never sees or stores the token.
// (The server routes are built in phase 2.)
import api from './client';

export async function getMe() {
  const res = await api.get('/auth/me');
  return res.data.data.user;
}

export async function login(credentials) {
  const res = await api.post('/auth/login', credentials);
  return res.data.data.user;
}

export async function register(details) {
  const res = await api.post('/auth/register', details);
  return res.data.data.user;
}

export async function logout() {
  await api.post('/auth/logout');
}
