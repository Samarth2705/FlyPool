// Rules for the payment routes. Amounts are never accepted from the app.
import { z } from 'zod';

// POST /api/trips/:tripId/payment - nothing to send (the server works out the amount)
export const startPaymentSchema = z.object({}).strict('This field cannot be set.');

// POST /api/payments/:paymentId/demo-result - DEMO MODE ONLY
export const demoResultSchema = z
  .object({
    outcome: z.enum(['success', 'failure', 'cancelled'], { error: 'Outcome must be success, failure or cancelled.' }),
  })
  .strict('This field cannot be set.');
