// Page 1: Login / Register form. `mode` is "login" or "register".
// Shown inside AuthLayout (animation panel + form panel), also on "/".
// After a successful login the user is sent to the page they originally
// wanted (saved by ProtectedRoute), or to the trip details page.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import TextField from '../components/ui/TextField';
import PasswordField from '../components/ui/PasswordField';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import LoadingState from '../components/ui/LoadingState';
import PostLoginRedirect from '../components/PostLoginRedirect';
import { useAuth } from '../hooks/useAuth';
import { login, register } from '../api/auth.api';
import { prefetchLandingPages } from './loaders';

// Order used to move keyboard focus to the first field with an error
const FIELD_ORDER = ['name', 'email', 'phone', 'password'];

function focusFirstError(errors) {
  const first = FIELD_ORDER.find((field) => errors[field]);
  if (first) requestAnimationFrame(() => document.getElementById(first)?.focus());
}

// Quick checks before calling the server, using the same rules and messages
// as server/src/validators/auth.validators.js. The server still checks again.
function validateForm(values, isLogin) {
  const errors = {};
  const email = values.email.trim();
  const phoneDigits = values.phone.replace(/[\s-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');

  const name = values.name.trim();
  if (!isLogin && !name) errors.name = 'Name is required.';
  else if (!isLogin && name.length < 2) errors.name = 'Name must be at least 2 characters.';

  if (!email) errors.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';

  if (!isLogin && !values.phone.trim()) errors.phone = 'Mobile number is required.';
  else if (!isLogin && !/^[6-9]\d{9}$/.test(phoneDigits)) errors.phone = 'Enter a valid 10-digit mobile number.';

  if (!values.password) errors.password = 'Password is required.';
  else if (!isLogin && values.password.length < 8) errors.password = 'Password must be at least 8 characters.';

  return errors;
}

// Why the passenger is on the login page, when it isn't their own choice
function SessionNotice({ notice, returning }) {
  const back = returning ? ' You’ll return to where you were.' : '';
  if (notice === 'expired') {
    return (
      <Alert tone="warning" title="Your session has ended" className="mt-5">
        For your security, please log in again.{back}
      </Alert>
    );
  }
  if (notice === 'signed-out-elsewhere') {
    return (
      <Alert tone="neutral" className="mt-5">
        You logged out of FlyPool in another tab.
      </Alert>
    );
  }
  if (returning) {
    return (
      <Alert tone="info" className="mt-5">
        Log in to continue.{back}
      </Alert>
    );
  }
  return null;
}

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { user, loading, notice, setUser } = useAuth();
  const location = useLocation();

  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = `${isLogin ? 'Log in' : 'Create account'} · FlyPool`;
  }, [isLogin]);

  // While they type, fetch the code of the page they'll most likely see next
  useEffect(() => {
    prefetchLandingPages();
  }, []);


  // Already logged in (or just logged in) -> go to the right page:
  // the in-progress trip, or Trip Details (see utils/landing.js)
  if (user) return <PostLoginRedirect from={location.state?.from} />;

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError('');

    const errors = validateForm(values, isLogin);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      focusFirstError(errors);
      return;
    }

    setSubmitting(true);
    try {
      const loggedInUser = isLogin
        ? await login({ email: values.email, password: values.password })
        : await register(values);
      setUser(loggedInUser); // triggers <PostLoginRedirect> above
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR' && error.details) {
        // Show each server message under its own field
        const serverErrors = Object.fromEntries(error.details.map((d) => [d.field, d.message]));
        setFieldErrors(serverErrors);
        focusFirstError(serverErrors);
      } else {
        setFormError(error.message);
      }
      setSubmitting(false);
    }
  }

  return (
    // While the session is checked on first load, the form keeps its space
    // (hidden and inert) under the spinner, so nothing jumps when it appears.
    <div className="relative mt-6 sm:mt-7">
      {loading && <LoadingState label="Checking your session…" className="absolute inset-0 py-0" />}
      <div inert={loading} className={loading ? 'invisible' : 'motion-safe:animate-fade-up'}>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
          {isLogin ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          {isLogin
            ? 'Log in to pick up your trip where you left off.'
            : 'Takes under a minute. You’ll add your flight on the next screens.'}
        </p>

        {isLogin && <SessionNotice notice={notice} returning={Boolean(location.state?.from)} />}

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          {formError && (
            <Alert tone="error" title={isLogin ? 'Couldn’t log you in' : 'Couldn’t create your account'}>
              {formError}
            </Alert>
          )}

          {!isLogin && (
            <TextField
              label="Full name"
              name="name"
              autoComplete="name"
              placeholder="Priya Sharma"
              value={values.name}
              onChange={handleChange}
              error={fieldErrors.name}
            />
          )}
          <TextField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={values.email}
            onChange={handleChange}
            error={fieldErrors.email}
          />
          {!isLogin && (
            <TextField
              label="Mobile number"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              prefix="+91"
              placeholder="98765 43210"
              hint="Indian mobile number, 10 digits."
              value={values.phone}
              onChange={handleChange}
              error={fieldErrors.phone}
            />
          )}
          <PasswordField
            label="Password"
            name="password"
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
            hint={isLogin ? undefined : 'At least 8 characters.'}
            value={values.password}
            onChange={handleChange}
            error={fieldErrors.password}
          />

          <Button type="submit" loading={submitting} loadingText={isLogin ? 'Logging in…' : 'Creating account…'} className="mt-2">
            {isLogin ? 'Log in' : 'Create account'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400">
          {isLogin ? 'New to FlyPool? ' : 'Already have an account? '}
          <Link
            to={isLogin ? '/register' : '/login'}
            state={location.state}
            replace
            className="rounded font-semibold text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:outline-none dark:text-brand-300"
          >
            {isLogin ? 'Create an account' : 'Log in'}
          </Link>
        </p>
      </div>
    </div>
  );
}
