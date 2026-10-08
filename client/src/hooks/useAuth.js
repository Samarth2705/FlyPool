// Any component can call useAuth() to get:
//   user      - the logged-in user, or null
//   loading   - true while the session is checked on first load
//   setUser   - update the user after login / register
//   signOut() - log out
import { useContext } from 'react';
import { AuthContext } from '../context/authContext';

export function useAuth() {
  return useContext(AuthContext);
}
