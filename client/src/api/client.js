// One shared Axios instance for every API call.
// Pages never call axios directly - they use the files in this folder.
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  // Send the httpOnly auth cookie with every request
  withCredentials: true,
});

// Session ended (expired, logged out elsewhere, or revoked): AuthProvider
// registers a handler here that clears the login state and sends the
// passenger to the login page. Failed requests are NEVER retried - an
// action like confirming a ride must not be sent twice behind their back.
let onSessionEnded = null;
export function setSessionEndedHandler(handler) {
  onSessionEnded = handler;
}

// 401s that mean "you were logged in, but aren't any more". The auth
// routes themselves are left alone: a wrong password or "not logged in yet"
// on first load are normal answers there.
const SESSION_CODES = ['AUTH_REQUIRED', 'INVALID_TOKEN'];
const isAuthRoute = (url = '') => url.startsWith('/auth/');

// Turn every failed request into a simple { code, message } error,
// matching the server's error format.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const serverError = error.response?.data?.error;
    const failure = {
      status: error.response?.status,
      code: serverError?.code || 'NETWORK_ERROR',
      message: serverError?.message || 'Could not reach the server. Check your connection and try again.',
      details: serverError?.details,
    };
    if (failure.status === 401 && SESSION_CODES.includes(failure.code) && !isAuthRoute(error.config?.url)) {
      onSessionEnded?.(failure);
    }
    return Promise.reject(failure);
  },
);

export default api;
