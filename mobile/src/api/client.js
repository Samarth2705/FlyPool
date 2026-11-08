// One shared Axios instance for every API call.
// Screens never call axios directly - they use the *.api.js files here.
//
// Configuration: the backend URL comes from EXPO_PUBLIC_API_URL (see
// .env.example). It is inlined into the app when it is bundled, so it must
// never hold a secret - it's just an address.
//
// Errors: every failure becomes a plain object, matching the server's
// { success: false, error: { code, message, details } } format:
//   { status, code, message, details }
// so screens can show `message` and branch on `code`.
//
// Retries: none. A failed request is reported, never re-sent behind the
// passenger's back - repeating a write like "confirm ride" could book twice.
// Screens offer a "Try again" button instead.
import { create } from 'axios';

// Trailing slashes removed, so "…/api/" and "…/api" both work
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || null;

export const TIMEOUTS = {
  default: 20_000, // serverless cold starts on mobile data can take a while
  upload: 60_000, // boarding pass / e-ticket upload (up to ~4 MB)
};

const api = create({
  baseURL: API_URL ?? undefined,
  timeout: TIMEOUTS.default,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  // The app authenticates with a bearer token, never with cookies
  withCredentials: false,
});

// ---- authentication hooks (wired up in the authentication phase) ----------
// getToken: returns the current session token (or null). Called before every
// request, so a token saved after login is picked up straight away.
let getToken = null;
export function setAuthTokenProvider(provider) {
  getToken = provider;
}

// Called when a request comes back "your session has ended" (401), so the
// app can clear the session and show the login screen.
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use(async (config) => {
  if (!API_URL) {
    throw Object.assign(new Error('API not configured'), { isConfigError: true });
  }
  const token = getToken ? await getToken() : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Turn any failure into { status, code, message, details }
export function toApiError(error) {
  if (error?.isConfigError) {
    return {
      status: null,
      code: 'CONFIG_ERROR',
      message: 'The app isn’t configured with a server address (EXPO_PUBLIC_API_URL).',
    };
  }
  const response = error?.response;
  if (!response) {
    const timedOut = error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT';
    return {
      status: null,
      code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
      message: timedOut
        ? 'The server is taking too long to respond. Please try again.'
        : 'Can’t reach FlyPool. Check your internet connection and try again.',
    };
  }
  const serverError = response.data?.error;
  return {
    status: response.status,
    // A response that isn't FlyPool's JSON (e.g. a hosting error page)
    code: serverError?.code || (response.status >= 500 ? 'SERVER_ERROR' : 'UNEXPECTED_RESPONSE'),
    message: serverError?.message || 'Something went wrong on our side. Please try again.',
    details: serverError?.details,
  };
}

const SESSION_CODES = ['AUTH_REQUIRED', 'INVALID_TOKEN'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const failure = toApiError(error);
    if (failure.status === 401 && SESSION_CODES.includes(failure.code)) onUnauthorized?.(failure);
    return Promise.reject(failure);
  },
);

// The `data` part of a successful { success: true, data } response
export const unwrap = (response) => response.data.data;

export default api;
