// Auth business logic: creating users and checking passwords.
// Knows nothing about HTTP requests or cookies - that's the controller's job.
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

// How much work bcrypt does per hash. Higher = slower to crack, slower to log in.
const SALT_ROUNDS = 10;

// Compared against when the email doesn't exist, so a wrong email takes as
// long as a wrong password and attackers can't tell which emails are
// registered by timing the response.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

export async function registerUser({ name, email, phone, password }) {
  if (await User.exists({ email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  }
  if (await User.exists({ phone })) {
    throw new AppError(409, 'PHONE_TAKEN', 'An account with this mobile number already exists.');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  return User.create({ name, email, phone, password: hashedPassword });
}

export async function loginUser({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  const passwordMatches = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);

  // Same message for "no such email" and "wrong password", on purpose
  if (!user || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  return user;
}

export async function getUserById(userId) {
  return User.findById(userId);
}
