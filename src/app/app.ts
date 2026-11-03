import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { platformClinicsRouter, clinicContextRouter } from '../modules/clinics/clinics.routes.js';
import { ZodError } from 'zod';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: env.corsOrigins,
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(`${env.API_PREFIX}/auth`, authRouter);
app.use(`${env.API_PREFIX}/platform/clinics`, platformClinicsRouter);
app.use(`${env.API_PREFIX}/clinic`, clinicContextRouter);

app.get(`${env.API_PREFIX}/health`, (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: 'ok' },
  });
});

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    },
  });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.flatten() } });
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) return res.status(409).json({ success: false, error: { code: 'DUPLICATE_RESOURCE', message: 'A resource with these unique values already exists.' } });
  if (error instanceof Error && error.name === 'CastError') return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid resource identifier.' } });
  console.error(error);
  return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
});
