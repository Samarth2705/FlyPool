// Wraps pages that need a logged-in user.
// Not logged in -> sent to /login. If they opened the page directly (e.g. a
// bookmark), it is remembered as `from` so they can return after logging in.
// After an explicit log out nothing is remembered.
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import Spinner from './ui/Spinner';

export default function ProtectedRoute() {
  const { user, loading, signedOut } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner fullScreen />;

  if (!user) {
    return <Navigate to="/login" replace state={signedOut ? undefined : { from: location.pathname }} />;
  }

  return <Outlet />;
}
