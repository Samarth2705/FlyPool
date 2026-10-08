import { AppError } from '../utils/AppError.js';

// Runs when no route matched the request.
export function notFound(req, res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}
