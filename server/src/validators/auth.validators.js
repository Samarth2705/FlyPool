// Rules for the data sent to the auth routes.
// Zod checks the request body and also cleans it (trims spaces,
// lowercases the email) before it reaches the controller.
import { z } from 'zod';

const email = z
  .string({ error: 'Email is required.' })
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.'));

// Indian mobile number. Accepts "98765 43210", "+91 98765-43210" or
// "09876543210" and always stores it as "+919876543210".
const phone = z
  .string({ error: 'Mobile number is required.' })
  .transform((value) => value.replace(/[\s-]/g, '').replace(/^(\+?91|0)(?=\d{10}$)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number.'))
  .transform((digits) => `+91${digits}`);

export const registerSchema = z.object({
  name: z
    .string({ error: 'Name is required.' })
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(50, 'Name must be at most 50 characters.'),
  email,
  phone,
  password: z
    .string({ error: 'Password is required.' })
    .min(8, 'Password must be at least 8 characters.')
    // bcrypt only uses the first 72 bytes of a password
    .max(72, 'Password must be at most 72 characters.'),
});

export const loginSchema = z.object({
  email,
  password: z.string({ error: 'Password is required.' }).min(1, 'Password is required.'),
});
