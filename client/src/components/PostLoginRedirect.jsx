// Shown on the login page once someone is logged in: works out the right
// page (see utils/landing.js) and navigates there exactly once.
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import Spinner from './ui/Spinner';
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

  if (!path) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  return <Navigate to={path} replace />;
}
