import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

// Central error handler. Every error in the app ends up here and is sent
// back in the same shape:
//   { success: false, error: { code, message, details? } }
//
// Express 5 automatically forwards errors thrown inside async route
// handlers to this function, so controllers don't need try/catch.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Something went wrong. Please try again.';
  let details;

  if (err instanceof AppError) {
    ({ statusCode, code, message, details } = err);
  } else if (err.type === 'entity.parse.failed') {
    // Invalid JSON in the request body
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON.';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large.';
  } else {
    // Unexpected bug: log the full error on the server only.
    console.error(err);
  }

  const body = { success: false, error: { code, message } };
  if (details) body.error.details = details;
  if (!env.isProduction && statusCode === 500) body.error.stack = err.stack;

  res.status(statusCode).json(body);
}
