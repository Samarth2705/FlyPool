// Keeps track of who is logged in, for the whole app.
// Wrap the app in <AuthProvider>, then read the values with useAuth()
// (see hooks/useAuth.js).
import { useEffect, useState } from 'react';
import { AuthContext } from './authContext';
import { getMe, logout } from '../api/auth.api';

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  // True after the user logs out on purpose. ProtectedRoute then sends them
  // to the login page WITHOUT remembering the page they were on, so the next
  // person to log in doesn't land on it.
  const [signedOut, setSignedOut] = useState(false);

  // On first load, ask the server if the auth cookie is still valid.
  useEffect(() => {
    getMe()
      .then(setUserState)
      .catch(() => setUserState(null))
      .finally(() => setLoading(false));
  }, []);

  function setUser(nextUser) {
    if (nextUser) setSignedOut(false);
    setUserState(nextUser);
  }

  async function signOut() {
    setSignedOut(true);
    try {
      await logout();
    } finally {
      setUserState(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signedOut, setUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
