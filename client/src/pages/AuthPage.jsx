// Page 1: Login / Register form. `mode` is "login" or "register".
// Shown inside AuthLayout (animation panel + form panel), also on "/".
// After a successful login the user is sent to the page they originally
// wanted (saved by ProtectedRoute), or to the trip details page.
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { motion } from 'framer-motion';
import TextField from '../components/ui/TextField';
import PasswordField from '../components/ui/PasswordField';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { fadeInUp } from '../animations/variants';
import { useAuth } from '../hooks/useAuth';
import { login, register } from '../api/auth.api';

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

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { user, loading, setUser } = useAuth();
  const location = useLocation();

  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  // Already logged in (or just logged in) -> leave this page
  if (user) return <Navigate to={location.state?.from || '/trip/new'} replace />;

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
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const loggedInUser = isLogin
        ? await login({ email: values.email, password: values.password })
        : await register(values);
      setUser(loggedInUser); // triggers the <Navigate> above
    } catch (error) {
      if (error.code === 'VALIDATION_ERROR' && error.details) {
        // Show each server message under its own field
        setFieldErrors(Object.fromEntries(error.details.map((d) => [d.field, d.message])));
      } else {
        setFormError(error.message);
      }
      setSubmitting(false);
    }
  }

  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="mt-6 sm:mt-7">
      <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
        {isLogin ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="mt-1 text-slate-500">
        {isLogin ? 'Log in to find your ride from the airport.' : 'It takes less than a minute.'}
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
            <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 fill-current" aria-hidden="true">
              <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a1 1 0 0 1 1 1v3.5a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1Zm0 8.5a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2Z" />
            </svg>
            {formError}
          </p>
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
          value={values.password}
          onChange={handleChange}
          error={fieldErrors.password}
        />

        <Button type="submit" loading={submitting} loadingText={isLogin ? 'Logging in…' : 'Creating account…'} className="mt-2">
          {isLogin ? 'Log in' : 'Create account'}
        </Button>
      </form>
    </motion.div>
  );
}
