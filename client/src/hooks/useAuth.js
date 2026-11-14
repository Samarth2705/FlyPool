// Any component can call useAuth() to get:
//   user      - the logged-in user, or null
//   loading   - true while the session is checked on first load
//   signedOut - true after a deliberate logout (here or in another tab)
//   notice    - why the login page is shown: 'expired', 'signed-out-elsewhere' or null
//   setUser   - update the user after login / register
//   signOut() - log out (ends the session on the server; never throws)
import { useContext } from 'react';
import { AuthContext } from '../context/authContext';

export function useAuth() {
  return useContext(AuthContext);
}
