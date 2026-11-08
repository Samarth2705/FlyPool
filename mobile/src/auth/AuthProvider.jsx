// Keeps track of who is logged in, for the whole app.
// Wrap the app in <AuthProvider>, then read the values with useAuth().
//
// The session is a 30-day bearer token from POST /auth/mobile/login, kept in
// SecureStore (sessionStorage.js) and attached to every request by the API
// client. The server is the judge of whether it is still valid:
//   - on launch: a saved token is checked with GET /auth/me
//   - any request answered "session ended" (401) logs the app out
//   - when the app comes back to the foreground (at most once a minute) the
//     session is checked again, so a token revoked or expired while the app
//     was in the background is noticed
// Failed requests are never retried here.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AuthContext } from './authContext';
import { clearSession, loadSession, saveSession } from './sessionStorage';
import { getMe, logout, mobileLogin, mobileRegister } from '../api/auth.api';
import { setAuthTokenProvider, setUnauthorizedHandler } from '../api/client';
import { unregisterPush } from '../notifications/push';
import { clearTripDraft } from '../state/tripDraft';
import { clearAllRideDrafts } from '../state/rideDrafts';

const RECHECK_AFTER_MS = 60 * 1000;

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [notice, setNotice] = useState(null);

  // Read by the API client and by event listeners, so kept in refs too
  const tokenRef = useRef(null);
  const statusRef = useRef('loading');
  const lastCheckRef = useRef(0);

  const changeStatus = useCallback((next) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // Forget the session here and on the device. reason: 'expired' or null
  const endSession = useCallback(
    async (reason = null) => {
      tokenRef.current = null;
      setUser(null);
      setNotice(reason);
      changeStatus('signedOut');
      await clearSession();
    },
    [changeStatus],
  );

  // Start using a session returned by login / register
  const startSession = useCallback(
    async ({ user: nextUser, token, expiresAt }) => {
      tokenRef.current = token;
      // If the device can't store it, the user stays logged in until the app closes
      await saveSession({ token, expiresAt });
      lastCheckRef.current = Date.now();
      setUser(nextUser);
      setNotice(null);
      changeStatus('signedIn');
    },
    [changeStatus],
  );

  // Launch: is there a saved session (loadSession), and does the server still accept it?
  const resume = useCallback(async (saved) => {
    if (!saved?.token) {
      setNotice(saved?.expired ? 'expired' : null);
      changeStatus('signedOut');
      return;
    }
    tokenRef.current = saved.token;
    try {
      const me = await getMe();
      lastCheckRef.current = Date.now();
      setUser(me);
      changeStatus('signedIn');
    } catch (error) {
      if (error.status === 401) {
        await endSession('expired');
      } else {
        // Offline or server trouble: keep the session and let them try again
        changeStatus('unreachable');
      }
    }
  }, [changeStatus, endSession]);

  // Wire the API client to this session (once)
  useEffect(() => {
    setAuthTokenProvider(() => tokenRef.current);
    setUnauthorizedHandler(() => {
      // Only a session that was in use can "end"; the launch check handles its own 401
      if (statusRef.current === 'signedIn') endSession('expired');
    });
    return () => {
      setAuthTokenProvider(null);
      setUnauthorizedHandler(null);
    };
  }, [endSession]);

  useEffect(() => {
    loadSession().then(resume);
  }, [resume]);

  // Back in the foreground: check the session again, at most once a minute
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || statusRef.current !== 'signedIn') return;
      if (Date.now() - lastCheckRef.current < RECHECK_AFTER_MS) return;
      lastCheckRef.current = Date.now();
      // A 401 is handled by the unauthorized handler; network errors are ignored
      getMe().then(setUser, () => {});
    });
    return () => subscription.remove();
  }, []);

  const signIn = useCallback(async (credentials) => startSession(await mobileLogin(credentials)), [startSession]);
  const signUp = useCallback(async (details) => startSession(await mobileRegister(details)), [startSession]);

  // Log out: the server revokes the token; locally it is always cleared,
  // even if the request fails (e.g. offline)
  const signOut = useCallback(async () => {
    // First stop push notifications to this phone (needs the session)
    await unregisterPush();
    try {
      await logout();
    } catch {
      // The token still expires on its own on the server
    }
    // Logged out on purpose: forget unsaved forms (kept when a session merely expires)
    clearTripDraft();
    clearAllRideDrafts();
    await endSession(null);
  }, [endSession]);

  // "Try again" after the server couldn't be reached at launch
  const retry = useCallback(() => {
    changeStatus('loading');
    return loadSession().then(resume);
  }, [changeStatus, resume]);

  const value = useMemo(
    () => ({ status, user, notice, signIn, signUp, signOut, retry }),
    [status, user, notice, signIn, signUp, signOut, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
