// Shared layout for the login and register pages (a layout route in App.jsx).
// Desktop: dark brand panel with the animation on the left, form on the right.
// Mobile: a compact brand band on top, the form right below it.
// The page inside (AuthPage) is rendered where <Outlet /> is.
//
// The animation (and the animation library it needs) loads separately, after
// the form: the form is usable straight away, and the animation's box has a
// fixed size so nothing moves when it appears.
import { lazy, Suspense } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import Logo from '../ui/Logo';

const AirportRideAnimation = lazy(() => import('./AirportRideAnimation'));
import { ShieldIcon, PlaneIcon, UsersIcon } from '../ui/icons';

const HIGHLIGHTS = [
  { Icon: PlaneIcon, title: 'Matched by flight', text: 'Passengers landing within the same window as you.' },
  { Icon: ShieldIcon, title: 'Verified travellers', text: 'Everyone adds a boarding pass or e-ticket first.' },
  { Icon: UsersIcon, title: 'One cab, split fare', text: 'See the estimated cost per person before you choose.' },
];

const MODES = [
  { to: '/login', label: 'Log in', mode: 'login' },
  { to: '/register', label: 'Create account', mode: 'register' },
];

// "Log in | Create account" switch. The white pill slides between the two.
function ModeSwitch({ mode }) {
  const location = useLocation();

  return (
    <nav aria-label="Log in or create an account" className="relative grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
      <span
        aria-hidden="true"
        className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-white shadow-sm transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-slate-700 ${
          mode === 'register' ? 'translate-x-full' : ''
        }`}
      />
      {MODES.map((item) => {
        const active = item.mode === mode;
        return (
          <Link
            key={item.mode}
            to={item.to}
            // Keep the page the user was trying to reach before logging in
            state={location.state}
            replace
            aria-current={active ? 'page' : undefined}
            className={`relative rounded-md py-2.5 text-center text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none ${
              active
                ? 'text-slate-900 dark:text-white'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function AuthLayout() {
  const { pathname } = useLocation();
  const mode = pathname === '/register' ? 'register' : 'login';

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row dark:bg-slate-950">
      {/* Brand panel */}
      <aside className="relative bg-brand-950 px-4 pt-5 pb-3 text-white sm:px-8 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[42%] lg:flex-col lg:justify-between lg:px-12 lg:py-10">
        <Logo onDark size="sm" />

        <div className="mt-4 lg:mt-0">
          <h2 className="text-lg leading-snug font-semibold tracking-tight sm:text-xl lg:text-4xl lg:leading-tight lg:font-bold">
            Landed in Mumbai? <span className="text-taxi">Share the cab home.</span>
          </h2>
          <p className="mt-3 hidden max-w-md text-brand-100/80 lg:block">
            FlyPool matches you with verified passengers arriving around the same time and heading your way.
          </p>
          <div className="mx-auto mt-2 h-28 w-full max-w-lg sm:h-40 lg:mt-8 lg:aspect-[3/2] lg:h-auto">
            <Suspense fallback={null}>
              <AirportRideAnimation className="h-full w-full" />
            </Suspense>
          </div>
        </div>

        <ul className="hidden space-y-4 border-t border-white/10 pt-6 lg:block">
          {HIGHLIGHTS.map(({ Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/10 text-taxi">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-sm text-brand-100/75">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 justify-center px-4 py-6 sm:px-8 sm:py-10 lg:items-center">
        <div className="w-full max-w-md">
          <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <ModeSwitch mode={mode} />
            <Outlet />
          </div>

          <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
            Pilot service: flight checks use demo verification, and fares are estimates. Nothing is booked or charged.
          </p>
        </div>
      </main>
    </div>
  );
}
