// My Profile: the logged-in user's account details, read from the existing
// auth state (useAuth). Read-only - the API has no "update profile" route yet.
import { Link } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import { useAuth } from '../hooks/useAuth';
import { initialsOf, formatPhone } from '../utils/format';

const card = 'rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900';

export default function ProfilePage() {
  const { user } = useAuth();
  const memberSince = user.createdAt
    ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(user.createdAt))
    : null;

  const rows = [
    ['Full name', user.name],
    ['Email', user.email],
    ['Mobile number', user.phone ? formatPhone(user.phone) : 'Not added'],
  ];

  return (
    <AppLayout title="My Profile">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">My Profile</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Your FlyPool account details.</p>

        <section className={`mt-6 ${card}`}>
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sky-600 text-xl font-semibold text-white">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-slate-900 dark:text-white">{user.name}</p>
              {memberSince && <p className="text-sm text-slate-500 dark:text-slate-400">Member since {memberSince}</p>}
            </div>
          </div>

          <dl className="mt-6 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {rows.map(([label, value]) => (
              <div key={label} className="flex flex-col gap-0.5 py-3.5 sm:flex-row sm:justify-between sm:gap-4">
                <dt className="text-sm text-slate-500 dark:text-slate-400">{label}</dt>
                <dd className="font-medium break-all text-slate-900 sm:text-right dark:text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            Editing your details isn&apos;t available yet.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
          <Link to="/trips" className="text-sky-700 hover:underline dark:text-sky-400">
            My Trips →
          </Link>
          <Link to="/settings" className="text-sky-700 hover:underline dark:text-sky-400">
            Settings →
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
