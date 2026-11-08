// Quick checks for the login and register forms, using the same rules and
// messages as the server (server/src/validators/auth.validators.js) and the
// website. The server checks again; these only give instant feedback.
// "Confirm password" is the only app-only rule.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "98765 43210", "+91 98765-43210", "09876543210" -> "9876543210"
export function phoneDigits(phone) {
  return phone.replace(/[\s-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, '');
}

// Returns { field: message } - empty when valid
export function validateLogin({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Email is required.';
  else if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Password is required.';
  return errors;
}

export function validateRegister({ name, email, phone, password, confirmPassword }) {
  const errors = {};
  const trimmedName = name.trim();
  if (!trimmedName) errors.name = 'Name is required.';
  else if (trimmedName.length < 2) errors.name = 'Name must be at least 2 characters.';
  else if (trimmedName.length > 50) errors.name = 'Name must be at most 50 characters.';

  if (!email.trim()) errors.email = 'Email is required.';
  else if (!EMAIL.test(email.trim())) errors.email = 'Enter a valid email address.';

  if (!phone.trim()) errors.phone = 'Mobile number is required.';
  else if (!/^[6-9]\d{9}$/.test(phoneDigits(phone))) errors.phone = 'Enter a valid 10-digit mobile number.';

  if (!password) errors.password = 'Password is required.';
  else if (password.length < 8) errors.password = 'Password must be at least 8 characters.';
  else if (password.length > 72) errors.password = 'Password must be at most 72 characters.';

  if (!confirmPassword) errors.confirmPassword = 'Please confirm your password.';
  else if (confirmPassword !== password) errors.confirmPassword = 'Passwords don’t match.';

  return errors;
}

// Server VALIDATION_ERROR details -> { field: message }
export function fieldErrorsFrom(error) {
  if (error?.code !== 'VALIDATION_ERROR' || !Array.isArray(error.details)) return null;
  return Object.fromEntries(error.details.map((d) => [d.field.split('.')[0], d.message]));
}
