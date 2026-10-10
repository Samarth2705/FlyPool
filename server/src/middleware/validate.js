// Checks req.body against a Zod schema before the controller runs.
// Usage: router.post('/register', validate(registerSchema), register)
//
// Valid   -> req.body is replaced with the cleaned data, request continues.
// Invalid -> 400 VALIDATION_ERROR with a message for each bad field.
import { AppError } from '../utils/AppError.js';

export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid.', details));
    }

    req.body = result.data;
    next();
  };
}
