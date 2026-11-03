import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.flatten() } });
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) return res.status(409).json({ success: false, error: { code: 'DUPLICATE_RESOURCE', message: 'A resource with these unique values already exists.' } });
  if (error instanceof Error && error.name === 'CastError') return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid resource identifier.' } });
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' && 'code' in error) {
    const known = error as { status: number; code: string; message: string };
    return res.status(known.status).json({ success: false, error: { code: known.code, message: known.message } });
  }
  console.error(error);
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};