// An "expected" error that we throw on purpose, e.g. "trip not found".
// The error handler turns it into a clean JSON response.
//
// Usage: throw new AppError(404, 'TRIP_NOT_FOUND', 'Trip not found');
export class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
