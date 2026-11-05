import { beforeEach, describe, expect, it, vi } from 'vitest';

const financeMocks = vi.hoisted(() => ({
  findOne: vi.fn(),
  findOneAndUpdate: vi.fn(),
  create: vi.fn(),
  aggregate: vi.fn(),
  find: vi.fn(),
  countDocuments: vi.fn(),
  exists: vi.fn(),
  updateOne: vi.fn(),
}));
vi.mock('../../src/modules/tenancy/models/clinic-finance-entry.model.js', () => ({ ClinicFinanceEntry: financeMocks }));
vi.mock('../../src/modules/tenancy/models/clinic.model.js', () => ({ Clinic: { findOne: vi.fn() } }));
vi.mock('../../src/modules/tenancy/models/branch.model.js', () => ({ Branch: { findOne: vi.fn() } }));

import { clinicFinanceService } from '../../src/modules/tenancy/services/clinic-finance.service.js';

const tenantId = '64b000000000000000000001';
const userId = '64b000000000000000000002';
const clinicId = '64b000000000000000000003';
const invoiceId = '64b000000000000000000004';
const paymentId = '64b000000000000000000005';
const invoice = { _id: invoiceId, tenantId, clinicId, branchId: null, type: 'invoice', status: 'issued', amount: 100, currency: 'EGP', settledAmount: 0 };

describe('clinic finance source records', () => {
  beforeEach(() => vi.resetAllMocks());

  it('reserves invoice balance atomically before recording a payment', async () => {
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(invoice) });
    financeMocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...invoice, settledAmount: 60 }) });
    financeMocks.create.mockResolvedValue({ _id: paymentId, type: 'payment', amount: 60 });

    const result = await clinicFinanceService.recordPayment(
      { tenantId, userId, scope: 'tenant' },
      { invoiceId, amount: 60, currency: 'EGP' },
    );

    expect(financeMocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: invoiceId, tenantId, $expr: expect.any(Object) }),
      { $inc: { settledAmount: 60 } },
      { new: true },
    );
    expect(result).toMatchObject({ type: 'payment', amount: 60 });
  });

  it('rejects a payment when the atomic balance reservation fails', async () => {
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(invoice) });
    financeMocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    await expect(clinicFinanceService.recordPayment(
      { tenantId, userId, scope: 'tenant' },
      { invoiceId, amount: 120, currency: 'EGP' },
    )).rejects.toMatchObject({ code: 'PAYMENT_EXCEEDS_BALANCE', status: 409 });
    expect(financeMocks.create).not.toHaveBeenCalled();
  });

  it('prevents clinic-scoped members from recording payments against another clinic', async () => {
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(invoice) });

    await expect(clinicFinanceService.recordPayment(
      { tenantId, userId, scope: 'clinic', clinicId: '64b000000000000000000099' },
      { invoiceId, amount: 20, currency: 'EGP' },
    )).rejects.toMatchObject({ code: 'CLINIC_ACCESS_DENIED', status: 403 });
    expect(financeMocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(financeMocks.create).not.toHaveBeenCalled();
  });

  it('prevents branch-scoped members from recording payments against unassigned branches', async () => {
    const branchInvoice = { ...invoice, branchId: '64b000000000000000000006' };
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(branchInvoice) });

    await expect(clinicFinanceService.recordPayment(
      { tenantId, userId, scope: 'branch', clinicId, branchId: '64b000000000000000000007' },
      { invoiceId, amount: 20, currency: 'EGP' },
    )).rejects.toMatchObject({ code: 'BRANCH_ACCESS_DENIED', status: 403 });
    expect(financeMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not allow a payment currency different from the invoice currency', async () => {
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(invoice) });

    await expect(clinicFinanceService.recordPayment(
      { tenantId, userId, scope: 'tenant' },
      { invoiceId, amount: 20, currency: 'SAR' },
    )).rejects.toMatchObject({ code: 'CURRENCY_MISMATCH', status: 409 });
    expect(financeMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('does not allow refunds beyond the payment amount', async () => {
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({
      _id: paymentId, tenantId, clinicId, branchId: null, type: 'payment', status: 'posted', amount: 30, currency: 'EGP',
    }) });
    financeMocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    await expect(clinicFinanceService.recordRefund(
      { tenantId, userId, scope: 'tenant' },
      { paymentId, amount: 40 },
    )).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_PAYMENT', status: 409 });
    expect(financeMocks.create).not.toHaveBeenCalled();
  });
});
