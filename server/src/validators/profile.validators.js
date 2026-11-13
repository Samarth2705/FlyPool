// Rules for the traveller profile (PATCH /api/profile) and identity
// verification (POST /api/identity/start). Unknown fields are refused.
import { z } from 'zod';
import { IDENTITY_METHODS } from '../models/IdentityVerification.js';
import { ageFrom } from '../services/profile.service.js';

export const MIN_AGE = 18; // shared cabs with strangers: adults only
export const MAX_AGE = 100;

const realDate = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};

export const profileUpdateSchema = z
  .object({
    name: z.string({ error: 'Name is required.' }).trim().min(2, 'Name must be at least 2 characters.').max(50, 'Name must be at most 50 characters.'),
    // Only the account holder sees it; others see the age worked out from it
    dateOfBirth: z
      .string({ error: 'Choose your date of birth.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date of birth.')
      .refine(realDate, 'Choose a valid date of birth.')
      .refine((iso) => ageFrom(iso) >= MIN_AGE, `You must be at least ${MIN_AGE} to use FlyPool.`)
      .refine((iso) => ageFrom(iso) <= MAX_AGE, 'Choose a valid date of birth.')
      .nullable(),
    // Optional, and only shown to others if profileSharing.showGender is on
    gender: z.enum(['female', 'male', 'non_binary'], { error: 'Choose female, male, non-binary or leave it empty.' }).nullable(),
    profileSharing: z
      .object({
        shareProfile: z.boolean({ error: 'Choose whether to share your profile.' }),
        showGender: z.boolean({ error: 'Choose whether to show your gender.' }),
      })
      .partial()
      .strict('This field cannot be set.'),
  })
  .partial()
  .strict('This field cannot be set.');

export const identityStartSchema = z
  .object({
    method: z.enum(IDENTITY_METHODS, { error: 'Choose a document type.' }),
    // Explicit consent: must be exactly true
    consent: z.literal(true, { error: 'Please agree to how your identity is checked before continuing.' }),
  })
  .strict('This field cannot be set.');
