// Shared layout for the login and register pages (a layout route in App.jsx).
// Desktop: animation panel on the left (40%), form panel on the right (60%).
// Mobile: a short animation banner on top, the form right below it.
// The page inside (AuthPage) is rendered where <Outlet /> is.
import { Link, Outlet, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import AirportRideAnimation from './AirportRideAnimation';
import Logo from '../ui/Logo';

const HIGHLIGHTS = ['Same flight', 'Same direction', 'Split the fare'];

const TABS = [
  { to: '/login', label: 'Log in', mode: 'login' },
  { to: '/register', label: 'Register', mode: 'register' },
];

// "Log in | Register" switch. The white pill slides between the two tabs.
function ModeToggle({ mode }) {
  const location = useLocation();

  return (
    <div className="grid grid-cols-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-1" role="tablist" aria-label="Log in or register">
      {TABS.map((tab) => {
        const active = tab.mode === mode;
        return (
          <Link
            key={tab.mode}
            to={tab.to}
            // Keep the page the user was trying to reach before logging in
            state={location.state}
            replace
            role="tab"
            aria-selected={active}
            className={`relative rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
              active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {active && (
              <motion.span
                layoutId="auth-mode-pill"
                className="absolute inset-0 rounded-lg bg-white dark:bg-slate-700 shadow-sm"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export default function AuthLayout() {
  const { pathname } = useLocation();
  const mode = pathname === '/register' ? 'register' : 'login';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950 lg:flex-row">
      {/* Left: animation panel */}
      <aside className="relative overflow-hidden bg-linear-to-br from-slate-950 via-blue-950 to-sky-900 px-6 pt-6 pb-2 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-2/5 lg:flex-col lg:justify-center lg:px-12 lg:py-12">
        {/* Soft glows */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -bottom-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />

        <div className="relative">
          <h2 className="text-xl leading-tight font-bold tracking-tight sm:text-2xl lg:text-4xl">
            Your flight. Your people. <span className="text-sky-300">One shared ride.</span>
          </h2>
          <p className="mt-3 hidden max-w-md text-sky-100/75 lg:block">
            Find verified passengers from your flight heading your way, share a cab from the airport and split the
            fare.
          </p>
        </div>

        <AirportRideAnimation className="relative mx-auto mt-2 h-36 w-full max-w-xl sm:h-48 lg:mt-10 lg:h-auto" />

        <ul className="relative mt-8 hidden flex-wrap gap-2 lg:flex">
          {HIGHLIGHTS.map((item) => (
            <li key={item} className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm text-sky-100">
              {item}
            </li>
          ))}
        </ul>
      </aside>

      {/* Right: authentication panel */}
      <main className="flex flex-1 justify-center px-4 py-6 sm:px-8 sm:py-8 lg:w-3/5 lg:items-center lg:py-12">
        <div className="w-full max-w-lg">
          <div className="mb-5 sm:mb-8">
            <Logo />
            <p className="mt-3 hidden text-slate-500 dark:text-slate-400 sm:block">Airport cab pooling with passengers from your flight.</p>
          </div>

          <div className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl shadow-slate-200/60 dark:shadow-black/30 sm:p-8">
            <ModeToggle mode={mode} />
            <Outlet />
          </div>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Prototype: flight verification, fares and bookings are simulated.
          </p>
        </div>
      </main>
    </div>
  );
}
