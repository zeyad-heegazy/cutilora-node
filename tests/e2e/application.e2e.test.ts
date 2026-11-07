import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// The app validates configuration during module initialization. These values are
// intentionally test-only; no database connection is opened by importing app.ts.
process.env.NODE_ENV = 'test';
process.env.API_PREFIX = '/api/v1';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/cutilora_e2e_test';
process.env.JWT_SECRET = 'e2e-test-secret-that-is-at-least-thirty-two-characters';
process.env.INTEGRATION_ENCRYPTION_KEY = 'e2e-test-integration-key-that-is-at-least-thirty-two';

let app: Express;

beforeAll(async () => {
  ({ app } = await import('../../src/app/app.js'));
});

describe('application HTTP smoke tests', () => {
  it('serves the health endpoint with the standard success envelope', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: { status: 'ok' } });
    expect(response.headers).not.toHaveProperty('x-powered-by');
  });

  it.each([
    ['/api/v1/auth/me', 'UNAUTHENTICATED'],
    ['/api/v1/auth/platform/me', 'UNAUTHENTICATED'],
    ['/api/v1/platform/tenants', 'UNAUTHENTICATED'],
    ['/api/v1/platform/geo/countries', 'UNAUTHENTICATED'],
    ['/api/v1/platform/monitoring/logs', 'UNAUTHENTICATED'],
    ['/api/v1/tenant/context', 'UNAUTHENTICATED'],
    ['/api/v1/clinic/finance/packages', 'UNAUTHENTICATED'],
  ])('protects mounted route %s before reaching its data layer', async (path, code) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code },
    });
  });

  it('returns the standard not-found response for unknown routes', async () => {
    const response = await request(app).get('/api/v1/this-route-does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});
