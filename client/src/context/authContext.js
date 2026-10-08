// The React context object for auth. The value is provided by
// <AuthProvider> and read with the useAuth() hook.
import { createContext } from 'react';

export const AuthContext = createContext(null);
