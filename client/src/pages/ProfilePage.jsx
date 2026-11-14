// My Profile: the logged-in user's account details (from useAuth, read-only),
// what other passengers see about them (date of birth -> age, gender and
// whether to show it), and their identity check (manual demo check).
import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import { LinkButton } from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import DetailList from '../components/ui/DetailList';
import LoadingState from '../components/ui/LoadingState';
import ErrorState from '../components/ui/ErrorState';
import TravellerDetailsCard from '../components/profile/TravellerDetailsCard';
import IdentityCard from '../components/profile/IdentityCard';
import { SettingsIcon, TicketIcon } from '../components/ui/icons';
import { useAuth } from '../hooks/useAuth';
import { getProfile } from '../api/profile.api';
import { initialsOf, formatPhone } from '../utils/format';

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);
  const memberSince = user.createdAt
    ? new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(user.createdAt))
    : null;

  const load = useCallback(
    () =>
      getProfile()
        .then((p) => {
          setError(null);
          setProfile(p);
        })
        .catch(setError),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppLayout title="My Profile">
      <div className="mx-auto max-w-2xl">
        <PageHeader title="My Profile" description="Your FlyPool account details." />

        <Card padding="lg" className="mt-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-slate-900 dark:text-white">{user.name}</p>
              {memberSince && <p className="text-sm text-slate-600 dark:text-slate-400">Member since {memberSince}</p>}
            </div>
          </div>

          <DetailList
            className="mt-6 border-t border-slate-100 dark:border-slate-800 [&_dd]:break-all"
            rows={[
              ['Full name', user.name],
              ['Email', user.email],
              ['Mobile number', user.phone ? formatPhone(user.phone) : 'Not added'],
            ]}
          />

          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">Editing your account details isn&apos;t available yet.</p>
        </Card>

        <div className="mt-6 space-y-6">
          {!profile && !error && <LoadingState label="Loading your profile…" />}
          {error && <ErrorState error={error} title="We couldn’t load your profile" onRetry={load} />}
          {profile && (
            <>
              <TravellerDetailsCard profile={profile} onSaved={setProfile} />
              <IdentityCard identity={profile.identity} onChanged={(identity) => setProfile((p) => ({ ...p, identity }))} />
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton to="/trips" variant="secondary" size="sm">
            <TicketIcon className="h-4 w-4" />
            My Trips
          </LinkButton>
          <LinkButton to="/settings" variant="secondary" size="sm">
            <SettingsIcon className="h-4 w-4" />
            Settings
          </LinkButton>
        </div>
      </div>
    </AppLayout>
  );
}
