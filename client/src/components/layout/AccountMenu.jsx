// Round avatar with the user's initials. Clicking it opens the account menu:
// My Profile, My Trips, Settings, Appearance (light / dark / system), Log out.
//
// Keyboard: Enter/Space or ↓ opens it, ↑/↓/Home/End move between items,
// Esc closes it and returns focus to the avatar. Clicking outside closes it.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import { THEME_CHOICES } from '../ui/themeChoices';
import { UserIcon, TicketIcon, SettingsIcon, LogoutIcon } from '../ui/icons';
import { initialsOf } from '../../utils/format';

const LINKS = [
  { to: '/profile', label: 'My Profile', Icon: UserIcon },
  { to: '/trips', label: 'My Trips', Icon: TicketIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
];

const itemClass =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none active:bg-slate-200 disabled:opacity-60 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800 dark:active:bg-slate-700';

export default function AccountMenu() {
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const menuItems = () => [...(menuRef.current?.querySelectorAll('[role^="menuitem"]') ?? [])];

  function close({ returnFocus = false } = {}) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }

  // When the menu opens, move focus to the first item.
  // While open, close it on a click outside.
  useEffect(() => {
    if (!open) return;
    menuItems()[0]?.focus();
    const onClickOutside = (event) => !wrapperRef.current?.contains(event.target) && setOpen(false);
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!user) return null;

  function handleMenuKeyDown(event) {
    const items = menuItems();
    const index = items.indexOf(document.activeElement);
    const moveTo = (i) => {
      event.preventDefault();
      items[(i + items.length) % items.length]?.focus();
    };

    if (event.key === 'ArrowDown') moveTo(index + 1);
    else if (event.key === 'ArrowUp') moveTo(index - 1);
    else if (event.key === 'Home') moveTo(0);
    else if (event.key === 'End') moveTo(items.length - 1);
    else if (event.key === 'Escape') {
      event.preventDefault();
      close({ returnFocus: true });
    } else if (event.key === 'Tab') close();
  }

  async function handleLogout() {
    setLoggingOut(true);
    await signOut(); // existing logout: the server clears the login cookie
    setOpen(false);
    navigate('/login', { replace: true });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => event.key === 'ArrowDown' && (event.preventDefault(), setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="account-menu"
        aria-label={`Account menu for ${user.name}`}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700 transition hover:bg-sky-200 focus-visible:ring-4 focus-visible:ring-sky-200 focus-visible:outline-none active:bg-sky-300 dark:bg-sky-900/60 dark:text-sky-200 dark:hover:bg-sky-900 dark:focus-visible:ring-sky-800"
      >
        {initialsOf(user.name)}
      </button>

      {open && (
        <div
          ref={menuRef}
          id="account-menu"
          role="menu"
          aria-label="Account"
          onKeyDown={handleMenuKeyDown}
          className="absolute right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-200/70 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/40"
        >
          {/* Who is logged in (from the existing auth state) */}
          <div className="flex items-center gap-3 px-3 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-sm font-semibold text-white">
              {initialsOf(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900 dark:text-white">{user.name}</p>
              <p className="truncate text-sm text-slate-500 dark:text-slate-400">{user.email}</p>
            </div>
          </div>
          <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />

          {LINKS.map(({ to, label, Icon }) => (
            <Link
              key={to}
              to={to}
              role="menuitem"
              tabIndex={-1}
              onClick={() => close()}
              className={`${itemClass} text-slate-700 dark:text-slate-200`}
            >
              <Icon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              {label}
            </Link>
          ))}

          <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />

          <div role="group" aria-labelledby="appearance-label" className="px-3 py-2">
            <p id="appearance-label" className="text-xs font-semibold tracking-wider text-slate-400 uppercase dark:text-slate-500">
              Appearance
            </p>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              {THEME_CHOICES.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === value}
                  tabIndex={-1}
                  onClick={() => setTheme(value)}
                  className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:outline-none ${
                    theme === value
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />

          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={handleLogout}
            disabled={loggingOut}
            className={`${itemClass} text-rose-600 dark:text-rose-400`}
          >
            <LogoutIcon className="h-5 w-5" />
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  );
}
