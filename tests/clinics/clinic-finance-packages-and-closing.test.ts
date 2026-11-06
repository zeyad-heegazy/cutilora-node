import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entry: { findOne: vi.fn(), create: vi.fn(), findOneAndUpdate: vi.fn(), aggregate: vi.fn(), updateOne: vi.fn() },
  clinic: { findOne: vi.fn() },
  branch: { findOne: vi.fn() },
  package: { create: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn() },
  packageEvent: { create: vi.fn(), findOne: vi.fn(), find: vi.fn() },
  dailyClose: { create: vi.fn(), findOne: vi.fn(), findOneAndUpdate: vi.fn(), find: vi.fn() },
  audit: { create: vi.fn() },
}));

vi.mock('../../src/modules/clinics/finance/models/clinic-finance-entry.model.js', () => ({ ClinicFinanceEntry: mocks.entry }));
vi.mock('../../src/modules/clinics/finance/models/clinic-finance-package.model.js', () => ({ ClinicFinancePackage: mocks.package }));
vi.mock('../../src/modules/clinics/finance/models/clinic-finance-package-event.model.js', () => ({ ClinicFinancePackageEvent: mocks.packageEvent }));
vi.mock('../../src/modules/clinics/finance/models/clinic-finance-daily-close.model.js', () => ({ ClinicFinanceDailyClose: mocks.dailyClose }));
vi.mock('../../src/modules/tenancy/models/clinic.model.js', () => ({ Clinic: mocks.clinic }));
vi.mock('../../src/modules/tenancy/models/branch.model.js', () => ({ Branch: mocks.branch }));
vi.mock('../../src/modules/tenancy/models/tenant-audit-event.model.js', () => ({ TenantAuditEvent: mocks.audit }));

import { clinicFinanceService } from '../../src/modules/clinics/finance/services/clinic-finance.service.js';

const tenantId = '64b000000000000000000001';
const userId = '64b000000000000000000002';
const clinicId = '64b000000000000000000003';
const invoiceId = '64b000000000000000000004';
const paymentId = '64b000000000000000000005';
const packageId = '64b000000000000000000006';
const actor = { tenantId, userId, scope: 'tenant' };

const query = (value: any) => ({ lean: vi.fn().mockResolvedValue(value) });

describe('clinic prepaid packages and daily cash close', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.audit.create.mockResolvedValue({});
  });

  it('creates a package only from a fully settled invoice and linked posted payment', async () => {
    mocks.entry.findOne
      .mockReturnValueOnce(query({ _id: invoiceId, tenantId, clinicId, branchId: null, type: 'invoice', status: 'issued', amount: 500, settledAmount: 500, patientId: '64b000000000000000000007', currency: 'EGP' }))
      .mockReturnValueOnce(query({ _id: paymentId, tenantId, clinicId, branchId: null, type: 'payment', status: 'posted', invoiceId, amount: 500, currency: 'EGP' }));
    mocks.package.create.mockResolvedValue({ _id: packageId, sessionsPurchased: 5, sessionsRemaining: 5, status: 'active' });
    mocks.packageEvent.create.mockResolvedValue({ _id: '64b000000000000000000008', eventType: 'sold' });

    const result = await clinicFinanceService.createPackage(actor, {
      invoiceId, paymentId, name: 'Laser 5 sessions', saleAmount: 500, sessionsPurchased: 5,
    });

    expect(mocks.package.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, clinicId, invoiceId, paymentId, sessionsPurchased: 5, sessionsRemaining: 5, status: 'active',
    }));
    expect(mocks.packageEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, packageId, eventType: 'sold', sessionsDelta: 5, amount: 500, currency: 'EGP',
    }));
    expect(result).toMatchObject({ _id: packageId, status: 'active' });
  });

  it('rejects package creation when the source invoice is not fully settled', async () => {
    mocks.entry.findOne.mockReturnValueOnce(query({
      _id: invoiceId, tenantId, clinicId, branchId: null, type: 'invoice', status: 'issued',
      amount: 500, settledAmount: 300, patientId: '64b000000000000000000007', currency: 'EGP',
    }));

    await expect(clinicFinanceService.createPackage(actor, {
      invoiceId, paymentId, name: 'Laser 5 sessions', saleAmount: 500, sessionsPurchased: 5,
    })).rejects.toMatchObject({ status: 409, code: 'PACKAGE_NOT_PAID' });
    expect(mocks.package.create).not.toHaveBeenCalled();
  });

  it('decrements package sessions atomically and records an idempotent redemption event', async () => {
    const packageRecord = {
      _id: packageId, tenantId, clinicId, branchId: null, status: 'active',
      sessionsPurchased: 5, sessionsRemaining: 5, expiresAt: null,
    };
    mocks.packageEvent.findOne.mockReturnValue(query(null));
    mocks.package.findOne.mockReturnValueOnce(query(packageRecord)).mockReturnValueOnce(query({ ...packageRecord, sessionsRemaining: 3 }));
    mocks.package.findOneAndUpdate.mockReturnValue(query({ ...packageRecord, sessionsRemaining: 3 }));
    mocks.packageEvent.create.mockResolvedValue({ _id: '64b000000000000000000009', packageId, eventType: 'redeemed', sessionsDelta: -2 });

    const result = await clinicFinanceService.redeemPackage(actor, {
      packageId, sessions: 2, idempotencyKey: 'redeem-0001',
    });

    expect(mocks.package.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: packageId, tenantId, status: 'active', sessionsRemaining: { $gte: 2 } }),
      { $inc: { sessionsRemaining: -2 }, $set: { updatedBy: userId } },
      { new: true },
    );
    expect(mocks.packageEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, packageId, eventType: 'redeemed', sessionsDelta: -2, idempotencyKey: 'redeem-0001',
    }));
    expect(result.event).toMatchObject({ eventType: 'redeemed', sessionsDelta: -2 });
  });

  it('prevents the closer from approving their own daily cash close', async () => {
    mocks.dailyClose.findOne.mockReturnValue(query({
      _id: packageId, tenantId, clinicId, branchId: null, status: 'closed', closedBy: userId,
    }));

    await expect(clinicFinanceService.approveDailyClose(actor, packageId))
      .rejects.toMatchObject({ status: 403, code: 'DAILY_CLOSE_SEPARATION_REQUIRED' });
    expect(mocks.dailyClose.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
