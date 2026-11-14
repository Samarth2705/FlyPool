// Shown on the login page once someone is logged in: works out the right
// page (see utils/landing.js) and navigates there exactly once.
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import LoadingState from './ui/LoadingState';
import { resolveLandingPath } from '../utils/landing';

export default function PostLoginRedirect({ from }) {
  const [path, setPath] = useState(null);

  useEffect(() => {
    let cancelled = false;
    resolveLandingPath(from).then((p) => !cancelled && setPath(p));
    return () => {
      cancelled = true;
    };
  }, [from]);

  if (!path) return <LoadingState label="Finding your trip…" />;
  return <Navigate to={path} replace />;
}
