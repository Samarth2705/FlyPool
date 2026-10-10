// Layout for the logged-in pages: navbar (logo, page title, account menu),
// the booking step indicator, then the page content.
//
// Usage: <AppLayout title="Plan Your Ride" step={2}>...</AppLayout>
//   step     - booking step to highlight (1-5). Leave out on account pages.
//   trip     - { id, status } of the trip on this page, so the steps can link to it
//   backdrop - optional decoration drawn behind the content (never clickable)
import { Link, useNavigate } from 'react-router';
import Logo from '../ui/Logo';
import AccountMenu from './AccountMenu';
import StepIndicator from './StepIndicator';
import { useAuth } from '../../hooks/useAuth';

export default function AppLayout({ title, step, trip, backdrop, children }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  // Clicking the logo logs out and opens the Login page (Page 1).
  // Logging out first is needed: the Login page sends logged-in users
  // straight back to Trip Details.
  async function handleLogoClick(event) {
    event.preventDefault();
    await signOut();
    navigate('/login');
  }

  return (
    // `isolate` keeps the backdrop behind the content but above the page colour
    <div className="relative isolate min-h-screen bg-slate-50 dark:bg-slate-950">
      {backdrop}

      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              to="/login"
              onClick={handleLogoClick}
              aria-label="FlyPool: log out and go to the login page"
              className="rounded-lg focus-visible:ring-4 focus-visible:ring-sky-100 focus-visible:outline-none"
            >
              <Logo size="sm" />
            </Link>
            <span className="hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-700" aria-hidden="true" />
            <p className="hidden truncate font-medium text-slate-600 sm:block dark:text-slate-300">{title}</p>
          </div>
          <AccountMenu />
        </div>
        {step && (
          <div className="mx-auto max-w-6xl border-t border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
            <StepIndicator currentStep={step} trip={trip} />
          </div>
        )}
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
