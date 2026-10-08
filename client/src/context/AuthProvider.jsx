// Keeps track of who is logged in, for the whole app.
// Wrap the app in <AuthProvider>, then read the values with useAuth()
// (see hooks/useAuth.js).
import { useEffect, useState } from 'react';
import { AuthContext } from './authContext';
import { getMe, logout } from '../api/auth.api';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, ask the server if the auth cookie is still valid.
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function signOut() {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
