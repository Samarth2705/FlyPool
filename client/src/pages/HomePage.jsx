// Temporary landing page for phase 1: shows whether the API and database
// are reachable. It will be replaced by the real pages in later phases.
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
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
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm"
      >
        <h1 className="text-3xl font-bold text-slate-900">FlyPool</h1>
        <p className="mt-1 text-slate-500">Share a cab with passengers from your flight.</p>

        <div className="mt-6 divide-y divide-slate-100 border-t border-slate-100">
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
      </motion.div>
    </main>
  );
}
