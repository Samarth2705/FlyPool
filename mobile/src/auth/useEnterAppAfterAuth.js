// Login and register stay reachable while logged in (the header logo opens
// them), so they move on to the app themselves after a successful login or
// sign-up - once the new session is in place, not before:
//   const expectLogin = useEnterAppAfterAuth();
//   expectLogin(true); await signIn(...);   // on failure: expectLogin(false)
import { useCallback, useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAuth } from './authContext';

export function useEnterAppAfterAuth() {
  const { status } = useAuth();
  const expecting = useRef(false);

  useEffect(() => {
    if (expecting.current && status === 'signedIn') {
      expecting.current = false;
      router.replace('/');
    }
  }, [status]);

  return useCallback((on) => {
    expecting.current = on;
  }, []);
}
