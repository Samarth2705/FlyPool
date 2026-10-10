// Development page at /status (not linked from the app): shows whether the
// API and database are reachable, and who is logged in.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import PageContainer from '../components/layout/PageContainer';
import { getHealth } from '../api/health.api';
import { useAuth } from '../hooks/useAuth';

function StatusRow({ label, ok, text }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className={`font-medium ${ok ? 'text-emerald-600' : 'text-rose-600 dark:text-rose-400'}`}>{text}</span>
    </div>
  );
}

// Shows who is logged in, with a log out button - or links to log in / register.
function AccountStatus() {
  const { user, loading, signOut } = useAuth();

  if (loading) return null;

  if (user) {
    return (
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-slate-600 dark:text-slate-300">
          Logged in as <span className="font-medium text-slate-900 dark:text-white">{user.name}</span>
        </span>
        <button onClick={signOut} className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
          Log out
        </button>
      </div>
    );
  }

  return (
    <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
      <Link to="/login" className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
        Log in
      </Link>
      {' or '}
      <Link to="/register" className="font-medium text-sky-600 dark:text-sky-400 hover:underline">
        create an account
      </Link>
    </p>
  );
}

export default function StatusPage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(setError);
  }, []);

  return (
    <PageContainer title="System status" subtitle="Development check for the API, database and login.">
      <div className="divide-y divide-slate-100 dark:divide-slate-800 border-y border-slate-100 dark:border-slate-800">
        {!health && !error && <p className="py-2 text-slate-400 dark:text-slate-500">Checking server…</p>}
        {error && <StatusRow label="API" ok={false} text={error.message} />}
        {health && (
          <>
            <StatusRow label="API" ok text="Online" />
            <StatusRow
              label="Database"
              ok={health.database === 'connected'}
              text={health.database === 'connected' ? 'Connected' : 'Disconnected'}
            />
          </>
        )}
      </div>


      <AccountStatus />
    </PageContainer>
  );
}
