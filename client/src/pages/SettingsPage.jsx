// Settings: appearance (works now), account details (read-only), and
// notification / security sections that say honestly what isn't built yet.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import AppLayout from '../components/layout/AppLayout';
import ThemePicker from '../components/ui/ThemePicker';
import { SunIcon, UserIcon, BellIcon, ShieldIcon } from '../components/ui/icons';
import { useAuth } from '../hooks/useAuth';
import { formatPhone } from '../utils/format';

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900 dark:text-white">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const notice = 'rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400';

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <AppLayout title="Settings">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">Settings</h1>
        <p className="mt-1 text-slate-500 dark:text-slate-400">Manage how FlyPool looks and works for you.</p>

        <div className="mt-6 space-y-5">
          <Section icon={SunIcon} title="Appearance" description="Saved on this device. System follows your device setting.">
            <ThemePicker />
          </Section>

          <Section icon={UserIcon} title="Account details">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Name</dt>
                <dd className="truncate font-medium text-slate-900 dark:text-slate-100">{user.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Email</dt>
                <dd className="truncate font-medium text-slate-900 dark:text-slate-100">{user.email}</dd>
              </div>
              {user.phone && (
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">Mobile</dt>
                  <dd className="font-medium text-slate-900 dark:text-slate-100">{formatPhone(user.phone)}</dd>
                </div>
              )}
            </dl>
            <Link to="/profile" className="mt-4 inline-block text-sm font-medium text-sky-700 hover:underline dark:text-sky-400">
              View profile →
            </Link>
          </Section>

          <Section icon={BellIcon} title="Notifications" description="Trip updates and ride-match alerts.">
            <p className={notice}>Notification settings aren&apos;t available yet - FlyPool doesn&apos;t send notifications so far.</p>
          </Section>

          <Section icon={ShieldIcon} title="Privacy & security">
            <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li>• Your password is stored only as a secure hash, never as plain text.</li>
              <li>• Your login is kept in a secure cookie that page scripts can&apos;t read, and it expires automatically.</li>
              <li>• Other passengers can&apos;t see your trips.</li>
            </ul>
            <p className={`mt-4 ${notice}`}>Changing your password isn&apos;t available yet.</p>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="mt-4 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:ring-4 focus-visible:ring-rose-100 focus-visible:outline-none disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:focus-visible:ring-rose-900"
            >
              {loggingOut ? 'Logging out…' : 'Log out'}
            </button>
          </Section>
        </div>
      </div>
    </AppLayout>
  );
}
