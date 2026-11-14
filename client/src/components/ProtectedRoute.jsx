// Wraps pages that need a logged-in user.
// Not logged in -> sent to /login. If they opened the page directly (e.g. a
// bookmark) or their session ended while on it, it is remembered as `from`
// so they can return after logging in. After an explicit log out (here or in
// another tab) nothing is remembered.
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth';
import { prefetchBookingPages } from '../pages/loaders';
import Spinner from './ui/Spinner';

export default function ProtectedRoute() {
  const { user, loading, signedOut } = useAuth();
  const location = useLocation();
  const loggedIn = Boolean(user);

  // Logged in: fetch the rest of the booking journey's code in idle time
  useEffect(() => {
    if (loggedIn) prefetchBookingPages();
  }, [loggedIn]);

  if (loading) return <Spinner fullScreen />;

  if (!user) {
    return <Navigate to="/login" replace state={signedOut ? undefined : { from: location.pathname }} />;
  }

  return <Outlet />;
}
