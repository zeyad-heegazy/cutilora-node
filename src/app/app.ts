import cors from 'cors';
import express from 'express';
import path from 'node:path';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { authRouter } from '../modules/auth/routes/auth.routes.js';
import { platformAuthRouter } from '../modules/platform/auth/routes/platform-auth.routes.js';
import { platformTenantRouter } from '../modules/platform/tenants/routes/platform-tenant.routes.js';
import { platformGeoRouter } from '../modules/platform/geo/routes/geo-admin.routes.js';
import { monitoringRouter } from '../modules/platform/monitoring/routes/monitoring.routes.js';
import { tenantRouter } from '../modules/tenancy/routes/tenancy.routes.js';
import { clinicFinanceRouter } from '../modules/clinics/finance/routes/clinic-finance.routes.js';
import { errorHandler } from '../shared/middleware/error-handler.js';
import { requestLogger } from '../shared/middleware/request-logger.middleware.js';
export const app = express();

app.disable('x-powered-by');

app.use(helmet());

app.use(cors({ origin: '*' }));

app.use(express.json({ limit: '5mb' }));

app.use(
  '/uploads',
  express.static(path.resolve(process.cwd(), 'public', 'uploads'), {
    fallthrough: false,
    maxAge: '7d',
    immutable: true,
  }),
);

app.use(express.urlencoded({ extended: true }));

app.use(requestLogger);

app.get(`${env.API_PREFIX}/health`, (_req, res) =>
  res.status(200).json({ success: true, data: { status: 'ok' } }),
);

app.use(`${env.API_PREFIX}/auth`, authRouter);
app.use(`${env.API_PREFIX}/auth/platform`, platformAuthRouter);
app.use(`${env.API_PREFIX}/platform/monitoring`, monitoringRouter);
app.use(`${env.API_PREFIX}/platform/tenants`, platformTenantRouter);
app.use(`${env.API_PREFIX}/platform/geo`, platformGeoRouter);
app.use(`${env.API_PREFIX}/tenant`, tenantRouter);
app.use(`${env.API_PREFIX}/clinic/finance`, clinicFinanceRouter);

app.use((_req, res) =>
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
    },
  }),
);

app.use(errorHandler);
