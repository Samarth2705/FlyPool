import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

// True when a query failed because MongoDB could not be reached, e.g. a
// query waited for a connection that never came ("buffering timed out").
function isDatabaseUnavailable(err) {
  return (
    ['MongoServerSelectionError', 'MongooseServerSelectionError', 'MongoNetworkError'].includes(err.name) ||
    (err.name === 'MongooseError' && /buffering timed out/.test(err.message))
  );
}

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
  } else if (err.name === 'ValidationError') {
    // Mongoose schema validation failed, e.g. a required field is missing
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Some fields are invalid.';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    // e.g. /api/trips/abc where "abc" is not a valid MongoDB id
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid value for ${err.path}.`;
  } else if (err.code === 11000) {
    // Unique index violated, e.g. an email that is already registered
    statusCode = 409;
    code = 'DUPLICATE_VALUE';
    const field = Object.keys(err.keyValue || {})[0];
    message = field ? `That ${field} is already in use.` : 'That value is already in use.';
  } else if (isDatabaseUnavailable(err)) {
    // MongoDB is down or unreachable right now
    statusCode = 503;
    code = 'DATABASE_UNAVAILABLE';
    message = 'The database is temporarily unavailable. Please try again shortly.';
    console.error('Database unavailable:', err.message);
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
