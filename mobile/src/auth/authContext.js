// The auth context object and the useAuth() hook. The value is provided by
// <AuthProvider> (AuthProvider.jsx):
//   status   'loading' | 'signedIn' | 'signedOut' | 'unreachable'
//   user     the logged-in user, or null
//   notice   why the login screen is shown: 'expired' or null
//   signIn({ email, password }), signUp(details), signOut(), retry()
import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}
