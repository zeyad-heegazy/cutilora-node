import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import type { Express } from 'express';

process.env.NODE_ENV = 'test';
process.env.API_PREFIX = '/api/v1';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/cutilora_e2e_test';
process.env.MONGODB_DB_NAME = 'cutilora_e2e_test';
process.env.JWT_SECRET = 'e2e-test-secret-that-is-at-least-thirty-two-characters';
process.env.INTEGRATION_ENCRYPTION_KEY = 'e2e-test-integration-key-that-is-at-least-thirty-two';

let app: Express;
let platformToken = '';
let ownerToken = '';
let tenantId = '';
let clinicId = '';
let invoiceId = '';
let paymentId = '';
let approverToken = '';
let approverUserId = '';
const platformEmail = 'e2e-platform-admin@cutilora.test';
const ownerEmail = 'e2e-tenant-owner@cutilora.test';
const approverEmail = 'e2e-tenant-approver@cutilora.test';
const password = 'E2E-Strong-Password-2026!';

const platform = () => ({
  get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${platformToken}`),
  post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${platformToken}`),
  patch: (path: string) => request(app).patch(path).set('Authorization', `Bearer ${platformToken}`),
  put: (path: string) => request(app).put(path).set('Authorization', `Bearer ${platformToken}`),
});
const tenant = () => ({
  get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${ownerToken}`).set('X-Tenant-Id', tenantId),
  post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${ownerToken}`).set('X-Tenant-Id', tenantId),
  patch: (path: string) => request(app).patch(path).set('Authorization', `Bearer ${ownerToken}`).set('X-Tenant-Id', tenantId),
  put: (path: string) => request(app).put(path).set('Authorization', `Bearer ${ownerToken}`).set('X-Tenant-Id', tenantId),
});

beforeAll(async () => {
  ({ app } = await import('../../src/app/app.js'));
  await mongoose.connect(process.env.MONGODB_URI!, { dbName: process.env.MONGODB_DB_NAME });
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe('database-backed backend workflows', () => {
  it('bootstraps and authenticates a platform administrator', async () => {
    const bootstrap = await request(app).post('/api/v1/auth/platform/dev/bootstrap-admin').send({
      name: 'Cutilora E2E Admin',
      email: platformEmail,
      password,
    });
    expect(bootstrap.status).toBe(201);

    const login = await request(app).post('/api/v1/auth/platform/login').send({
      email: platformEmail,
      password,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.access_token).toBeTruthy();
    platformToken = login.body.data.access_token;

    const me = await platform().get('/api/v1/auth/platform/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(platformEmail);
  });

  it('provisions a tenant, owner, subscription and initial clinic', async () => {
    const response = await platform().post('/api/v1/platform/tenants').send({
      name: 'E2E Aesthetic Group',
      businessType: 'clinic_group',
      preferences: { currency: 'EGP', timezone: 'Africa/Cairo', locale: 'en' },
      owner: { name: 'E2E Tenant Owner', email: ownerEmail, password },
      initialClinic: {
        name: 'E2E Downtown Clinic',
        clinicType: 'aesthetic',
        timezone: 'Africa/Cairo',
        bookingSettings: { allowOnlineBooking: true },
      },
    });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    tenantId = String(response.body.data.tenant?.id ?? response.body.data.tenant?._id ?? response.body.data.id ?? response.body.data._id);
    expect(tenantId).toMatch(/^[a-f\d]{24}$/i);
    expect(response.body.data).toBeTruthy();

    const subscription = await platform().put(`/api/v1/platform/tenants/${tenantId}/subscription`).send({
      plan: {
        code: 'e2e-starter',
        name: 'E2E Starter',
        amount: 500,
        currency: 'EGP',
        limits: { maxClinics: 5, maxBranches: 10, maxUsers: 20, maxStorageBytes: 10485760 },
        features: ['integrations', 'webhooks'],
      },
      billingCycle: 'monthly',
      status: 'active',
    });
    expect(subscription.status).toBe(200);

    const subscriptionPayment = await platform().post(`/api/v1/platform/tenants/${tenantId}/subscription/payments`).send({
      amount: 500,
      currency: 'EGP',
      status: 'paid',
      method: 'bank_transfer',
      provider: 'manual',
      providerReference: 'E2E-SUB-PAY-001',
      invoiceNumber: 'E2E-SUB-INV-001',
    });
    expect(subscriptionPayment.status).toBe(201);

    const ownerLogin = await request(app).post('/api/v1/auth/login').send({
      email: ownerEmail,
      password,
    });
    expect(ownerLogin.status).toBe(200);
    ownerToken = ownerLogin.body.data.access_token;
    expect(ownerToken).toBeTruthy();

    const context = await tenant().get('/api/v1/tenant/context');
    expect(context.status).toBe(200);
    expect(context.body.data).toBeTruthy();

    const clinics = await tenant().get('/api/v1/tenant/clinics');
    expect(clinics.status).toBe(200);
    const clinic = clinics.body.data.find((item: any) => item.name === 'E2E Downtown Clinic');
    expect(clinic).toBeTruthy();
    clinicId = String(clinic.id ?? clinic._id);
    expect(clinicId).toMatch(/^[a-f\d]{24}$/i);

    const { User } = await import('../../src/modules/auth/models/user.model.js');
    const { TenantMembership } = await import('../../src/modules/tenancy/models/tenant-membership.model.js');
    const { hashPassword } = await import('../../src/modules/auth/services/auth.security.js');
    const approver = await User.create({
      name: 'E2E Finance Approver',
      email: approverEmail,
      passwordHash: await hashPassword(password),
    });
    approverUserId = String(approver._id);
    await TenantMembership.create({
      userId: approver._id,
      tenantId,
      scope: 'tenant',
      role: 'tenant_owner',
      status: 'active',
    });
    const approverLogin = await request(app).post('/api/v1/auth/login').send({
      email: approverEmail,
      password,
    });
    expect(approverLogin.status).toBe(200);
    approverToken = approverLogin.body.data.access_token;
  });

  it('creates, lists and accepts a clinic-scoped staff invitation', async () => {
    const invitedEmail = 'e2e-clinic-staff@cutilora.test';
    const created = await tenant().post('/api/v1/tenant/invitations').send({
      email: invitedEmail,
      channels: ['email'],
      role: 'staff',
      scope: 'clinic',
      clinicId,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.invitation.email).toBe(invitedEmail);
    expect(created.body.data.invitationToken).toBeTruthy();

    const listed = await tenant().get('/api/v1/tenant/invitations');
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((item: any) => item.email === invitedEmail)).toBe(true);

    const accepted = await request(app).post('/api/v1/auth/invitations/accept').send({
      token: created.body.data.invitationToken,
      name: 'E2E Clinic Staff',
      password,
    });
    expect(accepted.status).toBe(200);

    const login = await request(app).post('/api/v1/auth/login').send({
      email: invitedEmail,
      password,
    });
    expect(login.status).toBe(200);
    const context = await request(app).get('/api/v1/tenant/context')
      .set('Authorization', `Bearer ${login.body.data.access_token}`)
      .set('X-Tenant-Id', tenantId)
      .set('X-Clinic-Id', clinicId);
    expect(context.status).toBe(200);
    expect(context.body.data.access.scope).toBe('clinic');
  });

  it('creates, updates, lists and archives a custom tenant role', async () => {
    const created = await tenant().post('/api/v1/tenant/roles').send({
      name: 'E2E Front Desk',
      description: 'E2E limited front desk permissions',
      scope: 'clinic',
      permissions: ['clinic.settings.read', 'branch.read'],
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const roleId = String(created.body.data._id ?? created.body.data.id);
    expect(roleId).toMatch(/^[a-f\\d]{24}$/i);

    const listed = await tenant().get('/api/v1/tenant/roles?scope=clinic');
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((item: any) => String(item._id ?? item.id) === roleId)).toBe(true);

    const details = await tenant().get(`/api/v1/tenant/roles/${roleId}`);
    expect(details.status).toBe(200);

    const updated = await tenant().patch(`/api/v1/tenant/roles/${roleId}`).send({
      name: 'E2E Front Desk Updated',
      description: 'Updated E2E role',
      permissions: ['clinic.settings.read'],
      version: details.body.data.version,
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.data.name).toBe('E2E Front Desk Updated');

    const archived = await tenant().post(`/api/v1/tenant/roles/${roleId}/archive`);
    expect(archived.status).toBe(200);
  });

  it('creates, versions and archives a tenant catalog template', async () => {
    const created = await tenant().post('/api/v1/tenant/catalog-templates').send({
      name: 'E2E Laser Treatment',
      key: 'e2e-laser-treatment',
      type: 'service_treatment',
      description: 'E2E service catalog template',
      content: { durationMinutes: 30, category: 'laser', active: true },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const templateId = String(created.body.data._id ?? created.body.data.id);
    const version = Number(created.body.data.version ?? 1);

    const updated = await tenant().patch(`/api/v1/tenant/catalog-templates/${templateId}`).send({
      expectedVersion: version,
      description: 'Updated E2E service template',
      content: { durationMinutes: 45, category: 'laser', active: true },
    });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.data.description).toBe('Updated E2E service template');

    const listed = await tenant().get('/api/v1/tenant/catalog-templates?type=service_treatment');
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((item: any) => String(item._id ?? item.id) === templateId)).toBe(true);

    const archived = await tenant().post(`/api/v1/tenant/catalog-templates/${templateId}/archive`).send({
      expectedVersion: updated.body.data.version,
    });
    expect(archived.status, JSON.stringify(archived.body)).toBe(200);
    expect(archived.body.data.status).toBe('archived');
  });

  it('updates organization profile, preferences and billing profile', async () => {
    const profile = await tenant().patch('/api/v1/tenant/profile').send({
      displayName: 'E2E Aesthetic Group Updated',
      description: 'Database-backed E2E organization',
    });
    expect(profile.status).toBe(200);

    const preferences = await tenant().patch('/api/v1/tenant/preferences').send({ preferences: {
      locale: 'ar',
      currency: 'EGP',
      timezone: 'Africa/Cairo',
    } });
    expect(preferences.status).toBe(200);

    const billing = await tenant().patch('/api/v1/tenant/billing-profile').send({
      legalName: 'E2E Aesthetic Group LLC',
      email: 'BILLING@CUTILORA.TEST',
      countryCode: 'EG',
    });
    expect(billing.status).toBe(200);

    const saved = await tenant().get('/api/v1/tenant/billing-profile');
    expect(saved.status).toBe(200);
    expect(JSON.stringify(saved.body).toLowerCase()).toContain('billing@cutilora.test');
  });

  it('runs clinic finance invoice, payment, idempotency, refund and expense workflows', async () => {
    const invoice = await tenant().post('/api/v1/clinic/finance/invoices').send({
      clinicId,
      currency: 'EGP',
      invoiceNumber: 'E2E-INV-0001',
      description: 'E2E dermatology treatment',
      lineItems: [{ description: 'Laser treatment', quantity: 2, unitPrice: 500 }],
    });
    expect(invoice.status).toBe(201);
    invoiceId = String(invoice.body.data._id ?? invoice.body.data.id);
    expect(invoice.body.data.amount).toBe(1000);

    const paymentPayload = {
      invoiceId,
      amount: 600,
      currency: 'EGP',
      method: 'cash',
      idempotencyKey: 'e2e-payment-key-0001',
    };
    const payment = await tenant().post('/api/v1/clinic/finance/payments').send(paymentPayload);
    expect(payment.status).toBe(201);
    paymentId = String(payment.body.data._id ?? payment.body.data.id);

    const replay = await tenant().post('/api/v1/clinic/finance/payments').send(paymentPayload);
    expect(replay.status).toBe(201);
    expect(String(replay.body.data._id ?? replay.body.data.id)).toBe(paymentId);

    const refund = await tenant().post('/api/v1/clinic/finance/refunds').send({
      paymentId,
      amount: 100,
      method: 'cash',
    });
    expect(refund.status).toBe(201);

    const expense = await tenant().post('/api/v1/clinic/finance/expenses').send({
      clinicId,
      amount: 75,
      currency: 'EGP',
      category: 'supplies',
      description: 'E2E clinic supplies',
    });
    expect(expense.status).toBe(201);

    const entries = await tenant().get('/api/v1/tenant/finance/summary');
    expect(entries.status).toBe(200);
    expect(entries.body.data).toBeTruthy();
  });

  it('runs service-package sale, redemption, event history and refund workflows', async () => {
    const invoice = await tenant().post('/api/v1/clinic/finance/invoices').send({
      clinicId,
      currency: 'EGP',
      invoiceNumber: 'E2E-PKG-INV-0001',
      patientId: new mongoose.Types.ObjectId().toString(),
      lineItems: [{ description: 'Package sale', quantity: 1, unitPrice: 900 }],
    });
    expect(invoice.status).toBe(201);

    const payment = await tenant().post('/api/v1/clinic/finance/payments').send({
      invoiceId: String(invoice.body.data._id ?? invoice.body.data.id),
      amount: 900,
      currency: 'EGP',
      method: 'card',
      idempotencyKey: 'e2e-package-payment-0001',
    });
    expect(payment.status).toBe(201);

    const created = await tenant().post('/api/v1/clinic/finance/packages').send({
      invoiceId: String(invoice.body.data._id ?? invoice.body.data.id),
      paymentId: String(payment.body.data._id ?? payment.body.data.id),
      name: 'E2E 3-session package',
      saleAmount: 900,
      sessionsPurchased: 3,
    });
    expect(created.status).toBe(201);
    const packageId = String(created.body.data._id ?? created.body.data.id);

    const redeemed = await tenant().post(`/api/v1/clinic/finance/packages/${packageId}/redeem`).send({
      sessions: 1,
      idempotencyKey: 'e2e-package-redeem-0001',
    });
    expect([200, 201]).toContain(redeemed.status);

    const events = await tenant().get(`/api/v1/clinic/finance/packages/${packageId}/events`);
    expect(events.status).toBe(200);
    expect(events.body.data.length).toBeGreaterThan(0);

    const refundInvoice = await tenant().post('/api/v1/clinic/finance/invoices').send({
      clinicId,
      patientId: new mongoose.Types.ObjectId().toString(),
      currency: 'EGP',
      invoiceNumber: 'E2E-PKG-REFUND-INV-0001',
      lineItems: [{ description: 'Refundable package sale', quantity: 1, unitPrice: 400 }],
    });
    expect(refundInvoice.status).toBe(201);
    const refundPayment = await tenant().post('/api/v1/clinic/finance/payments').send({
      invoiceId: String(refundInvoice.body.data._id ?? refundInvoice.body.data.id),
      amount: 400,
      currency: 'EGP',
      method: 'cash',
      idempotencyKey: 'e2e-package-refund-payment-0001',
    });
    expect(refundPayment.status).toBe(201);
    const refundablePackage = await tenant().post('/api/v1/clinic/finance/packages').send({
      invoiceId: String(refundInvoice.body.data._id ?? refundInvoice.body.data.id),
      paymentId: String(refundPayment.body.data._id ?? refundPayment.body.data.id),
      name: 'E2E refundable package',
      saleAmount: 400,
      sessionsPurchased: 2,
    });
    expect(refundablePackage.status).toBe(201);
    const refunded = await tenant().post(`/api/v1/clinic/finance/packages/${refundablePackage.body.data._id ?? refundablePackage.body.data.id}/refund`).send({
      reason: 'E2E unused package refund',
      method: 'cash',
    });
    expect([200, 201]).toContain(refunded.status);
  });

  it('runs daily cash-close open, close and approval workflow', async () => {
    const opened = await tenant().post('/api/v1/clinic/finance/daily-closes').send({
      clinicId,
      businessDate: '2026-11-06',
      timezone: 'Africa/Cairo',
      currency: 'EGP',
      periodStartAt: '2026-11-06T00:00:00.000Z',
      periodEndAt: '2026-11-06T23:59:59.000Z',
      openingCash: 100,
    });
    expect(opened.status).toBe(201);
    const closeId = String(opened.body.data._id ?? opened.body.data.id);

    const closed = await tenant().post(`/api/v1/clinic/finance/daily-closes/${closeId}/close`).send({
      countedCash: 100,
    });
    expect(closed.status).toBe(200);

    const selfApproval = await tenant().post(`/api/v1/clinic/finance/daily-closes/${closeId}/approve`);
    expect(selfApproval.status).toBe(403);
    expect(selfApproval.body.error.code).toBe('DAILY_CLOSE_SEPARATION_REQUIRED');

    const approved = await request(app)
      .post(`/api/v1/clinic/finance/daily-closes/${closeId}/approve`)
      .set('Authorization', `Bearer ${approverToken}`)
      .set('X-Tenant-Id', tenantId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.data.status).toBe('approved');
    expect(String(approved.body.data.approvedBy)).toBe(approverUserId);
  });

  it('enforces tenant isolation and rejects malformed tenant context', async () => {
    const malformed = await request(app)
      .get('/api/v1/tenant/context')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', 'not-an-object-id');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('INVALID_TENANT_ID');

    const foreign = await request(app)
      .get('/api/v1/tenant/context')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Tenant-Id', new mongoose.Types.ObjectId().toString());
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('revokes the platform session token on logout', async () => {
    const logout = await platform().post('/api/v1/auth/platform/logout');
    expect(logout.status).toBe(200);
    const rejected = await request(app)
      .get('/api/v1/auth/platform/me')
      .set('Authorization', `Bearer ${platformToken}`);
    expect(rejected.status).toBe(401);
  });
});
