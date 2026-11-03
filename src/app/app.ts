import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from '../config/env.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: env.corsOrigins,
  credentials: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

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
