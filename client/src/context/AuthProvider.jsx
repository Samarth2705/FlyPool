// Keeps track of who is logged in, for the whole app.
// Wrap the app in <AuthProvider>, then read the values with useAuth()
// (see hooks/useAuth.js).
//
// The session itself is the httpOnly cookie, which the server checks on
// every request (and expires / revokes on its own). This provider mirrors it:
//   - on load it asks the server who is logged in (GET /auth/me)
//   - if any request later says the session has ended, it clears the user
//     and ProtectedRoute sends them to the login page with a message
//   - logins and logouts are shared with the app's other open tabs
//   - when a tab comes back into view after a while, it re-checks the session
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { AuthContext } from './authContext';
import { getMe, logout } from '../api/auth.api';
import { setSessionEndedHandler } from '../api/client';
import { onAuthEvent, postAuthEvent } from './authSync';

// Re-check the session when a tab becomes visible, at most this often
const RECHECK_AFTER_MS = 60 * 1000;

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  // True after the user logs out on purpose (here or in another tab).
  // ProtectedRoute then sends them to the login page WITHOUT remembering the
  // page they were on, so the next person to log in doesn't land on it.
  const [signedOut, setSignedOut] = useState(false);
  // Why the login page is shown: 'expired' | 'signed-out-elsewhere' | null
  const [notice, setNotice] = useState(null);

  // The current user, for event handlers that outlive a render. Updated
  // together with `user` everywhere below.
  const userRef = useRef(null);
  const lastCheckRef = useRef(0);

  // The server says the session is over: forget the user, keep the page
  // they were on (so they can return to it after logging in again).
  const endSession = useCallback(() => {
    if (!userRef.current) return; // already handled (e.g. several requests failed at once)
    userRef.current = null;
    setUserState(null);
    setSignedOut(false);
    setNotice('expired');
  }, []);

  // Another tab logged in as someone else: switch to that account and leave
  // the previous user's page, which this account may not be allowed to see.
  const adoptAccount = useCallback(
    (nextUser) => {
      const previous = userRef.current;
      userRef.current = nextUser;
      setUserState(nextUser);
      setSignedOut(false);
      setNotice(null);
      if (previous && previous.id !== nextUser.id) navigate('/trips', { replace: true });
    },
    [navigate],
  );

  // On first load, ask the server if the auth cookie is still valid.
  useEffect(() => {
    getMe()
      .then((me) => {
        userRef.current = me;
        setUserState(me);
      })
      .catch((error) => {
        setUserState(null);
        // A cookie was sent but the server rejected it (expired or logged out)
        if (error.code === 'INVALID_TOKEN') setNotice('expired');
      })
      .finally(() => {
        lastCheckRef.current = Date.now();
        setLoading(false);
      });
  }, []);

  // Any API request that comes back "session ended" lands here
  useEffect(() => {
    setSessionEndedHandler(endSession);
    return () => setSessionEndedHandler(null);
  }, [endSession]);

  // Keep tabs in step
  useEffect(
    () =>
      onAuthEvent((event) => {
        if (event?.type === 'logout' && userRef.current) {
          userRef.current = null;
          setUserState(null);
          setSignedOut(true);
          setNotice('signed-out-elsewhere');
        } else if (event?.type === 'login' && event.userId !== userRef.current?.id) {
          getMe().then(adoptAccount, () => {});
        }
      }),
    [adoptAccount],
  );

  // A tab left in the background may have outlived its session, or another
  // account may have logged in meanwhile: check again when it's looked at.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible' || !userRef.current) return;
      if (Date.now() - lastCheckRef.current < RECHECK_AFTER_MS) return;
      lastCheckRef.current = Date.now();
      getMe().then(
        (me) => me.id !== userRef.current?.id && adoptAccount(me),
        (error) => error.status === 401 && endSession(),
      );
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [adoptAccount, endSession]);

  // After login / register
  function setUser(nextUser) {
    if (nextUser) {
      setSignedOut(false);
      setNotice(null);
      postAuthEvent({ type: 'login', userId: nextUser.id });
    }
    userRef.current = nextUser;
    lastCheckRef.current = Date.now();
    setUserState(nextUser);
  }

  // Log out: the server revokes the session and clears the cookie. Never
  // fails from the caller's point of view - the user is logged out here
  // even if the network is down.
  async function signOut() {
    setSignedOut(true);
    setNotice(null);
    try {
      await logout();
    } catch {
      // Still log out locally; the server session expires on its own
    } finally {
      userRef.current = null;
      setUserState(null);
      postAuthEvent({ type: 'logout' });
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signedOut, notice, setUser, signOut }}>{children}</AuthContext.Provider>
  );
}
