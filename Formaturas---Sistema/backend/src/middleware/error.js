import { ZodError } from 'zod';
import { logger } from '../config/logger.js';

export class AppError extends Error {
  constructor(code, message, status = 500, detail = undefined) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export function notFound(_req, res) {
  res.status(404).json({ error: 'not_found' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'validation_error', issues: err.flatten() });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message, detail: err.detail });
  }
  logger.error({ err }, 'unhandled_error');
  res.status(500).json({ error: 'internal_error', message: err.message });
}
