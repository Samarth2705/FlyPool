// Landing page. Also shows whether the API and database are reachable,
// which helps while setting the project up.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import PageContainer from '../components/layout/PageContainer';
import { getHealth } from '../api/health.api';

function StatusRow({ label, ok, text }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-slate-600">{label}</span>
      <span className={`font-medium ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>{text}</span>
    </div>
  );
}

export default function HomePage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth).catch(setError);
  }, []);

  return (
    <PageContainer title="FlyPool" subtitle="Share a cab with passengers from your flight.">
      <div className="divide-y divide-slate-100 border-y border-slate-100">
        {!health && !error && <p className="py-2 text-slate-400">Checking server…</p>}
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

      <Link
        to="/trip/new"
        className="mt-6 block rounded-lg bg-sky-600 px-4 py-2.5 text-center font-medium text-white hover:bg-sky-700"
      >
        Get started
      </Link>
    </PageContainer>
  );
}
