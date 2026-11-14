// Layout for the logged-in pages: navbar (logo, main links, account menu),
// the booking step indicator, then the page content.
//
// Usage: <AppLayout title="Verify flight" step={2} trip={{ id, status }}>...</AppLayout>
//   title - used for the browser tab ("Verify flight · FlyPool")
//   step  - booking step to highlight (1-4). Leave out on account pages.
//   trip  - { id, status } of the trip on this page, so the steps can link to it
import { useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import Logo from '../ui/Logo';
import AccountMenu from './AccountMenu';
import StepIndicator from './StepIndicator';
import { PlusIcon, TicketIcon } from '../ui/icons';

const navLink = (active) =>
  `inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none sm:px-3 dark:focus-visible:ring-brand-800 ${
    active
      ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
  }`;

export default function AppLayout({ title, step, trip, children }) {
  const { pathname } = useLocation();
  const inBookingFlow = pathname.startsWith('/trip/');

  useEffect(() => {
    document.title = title ? `${title} · FlyPool` : 'FlyPool';
  }, [title]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-white px-4 py-2 font-semibold text-brand-700 shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-4 focus:ring-brand-200 focus:outline-none"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          {/* The logo goes to My Trips: the place to resume or start a ride */}
          <Link
            to="/trips"
            aria-label="FlyPool home: My Trips"
            className="shrink-0 rounded-md focus-visible:ring-4 focus-visible:ring-brand-200 focus-visible:outline-none dark:focus-visible:ring-brand-800"
          >
            <Logo size="sm" />
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
              {/* Highlighted on every booking step, not just /trip/new */}
              <Link to="/trip/new" className={navLink(inBookingFlow)} aria-current={inBookingFlow ? 'page' : undefined}>
                <PlusIcon className="h-4 w-4" />
                <span className="sm:hidden">New ride</span>
                <span className="hidden sm:inline">Plan a ride</span>
              </Link>
              <NavLink to="/trips" className={({ isActive }) => navLink(isActive)}>
                <TicketIcon className="h-4 w-4" />
                <span className="sm:hidden">Trips</span>
                <span className="hidden sm:inline">My Trips</span>
              </NavLink>
            </nav>
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block dark:bg-slate-700" aria-hidden="true" />
            <AccountMenu />
          </div>
        </div>
        {step && (
          <div className="border-t border-slate-100 dark:border-slate-800">
            <div className="mx-auto max-w-6xl px-4 py-2.5 sm:px-6 sm:py-3">
              <StepIndicator currentStep={step} trip={trip} />
            </div>
          </div>
        )}
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 pt-6 pb-28 focus:outline-none motion-safe:animate-fade-up sm:px-6 sm:pt-10 sm:pb-16"
      >
        {children}
      </main>
    </div>
  );
}
