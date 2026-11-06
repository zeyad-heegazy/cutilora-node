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
vi.mock('../../src/modules/clinics/finance/models/clinic-finance-entry.model.js', () => ({ ClinicFinanceEntry: financeMocks }));
vi.mock('../../src/modules/tenancy/models/clinic.model.js', () => ({ Clinic: { findOne: vi.fn() } }));
vi.mock('../../src/modules/tenancy/models/branch.model.js', () => ({ Branch: { findOne: vi.fn() } }));
vi.mock('../../src/modules/tenancy/models/tenant-audit-event.model.js', () => ({ TenantAuditEvent: { create: vi.fn().mockResolvedValue({}) } }));

import { clinicFinanceService } from '../../src/modules/clinics/finance/services/clinic-finance.service.js';

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
  it('cannot read an invoice owned by a different tenant', async () => {
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    await expect(clinicFinanceService.recordPayment(
      { tenantId, userId, scope: 'tenant' },
      { invoiceId, amount: 20, currency: 'EGP' },
    )).rejects.toMatchObject({ code: 'INVOICE_NOT_FOUND', status: 404 });

    expect(financeMocks.findOne).toHaveBeenCalledWith({
      _id: invoiceId, tenantId, type: 'invoice', status: 'issued',
    });
    expect(financeMocks.findOneAndUpdate).not.toHaveBeenCalled();
    expect(financeMocks.create).not.toHaveBeenCalled();
  });

  it('voids an unpaid invoice with an immutable reason and tenant audit event', async () => {
    const unpaid = { ...invoice, settledAmount: 0 };
    const voided = { ...unpaid, status: 'void', voidReason: 'Duplicate invoice' };
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(unpaid) });
    financeMocks.findOneAndUpdate.mockReturnValue({ lean: vi.fn().mockResolvedValue(voided) });

    const result = await clinicFinanceService.voidEntry(
      { tenantId, userId, scope: 'tenant' },
      { entryId: invoiceId, reason: 'Duplicate invoice' },
    );

    expect(financeMocks.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: invoiceId, tenantId, status: { $in: ['draft', 'issued'] }, settledAmount: { $lte: 0 } }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'void', voidReason: 'Duplicate invoice', voidedBy: userId }) }),
      { new: true },
    );
    expect(result).toMatchObject({ status: 'void', voidReason: 'Duplicate invoice' });
  });

  it('does not void settled invoices or posted payments', async () => {
    financeMocks.findOne.mockReturnValue({ lean: vi.fn().mockResolvedValue({ ...invoice, settledAmount: 20 }) });
    await expect(clinicFinanceService.voidEntry(
      { tenantId, userId, scope: 'tenant' },
      { entryId: invoiceId, reason: 'Incorrect' },
    )).rejects.toMatchObject({ code: 'FINANCE_ENTRY_VOID_CONFLICT', status: 409 });
    expect(financeMocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('reconciles tenant summary from clinic source records without exposing patient details', async () => {
    financeMocks.aggregate
      .mockResolvedValueOnce([
        { _id: { type: 'invoice', currency: 'EGP' }, total: 1000, count: 2 },
        { _id: { type: 'payment', currency: 'EGP' }, total: 700, count: 2 },
        { _id: { type: 'refund', currency: 'EGP' }, total: 50, count: 1 },
        { _id: { type: 'expense', currency: 'EGP' }, total: 200, count: 1 },
        { _id: { type: 'invoice', currency: 'SAR' }, total: 300, count: 1 },
      ])
      .mockResolvedValueOnce([{ _id: 'EGP', outstanding: 350, invoiceCount: 1 }])
      .mockResolvedValueOnce([]);
    const result = await clinicFinanceService.overview(tenantId, { from: new Date('2026-01-01T00:00:00.000Z'), to: new Date('2026-01-31T23:59:59.999Z') });
    expect(financeMocks.aggregate).toHaveBeenCalledTimes(3);
    for (const [pipeline] of financeMocks.aggregate.mock.calls) {
      expect(pipeline[0].$match.tenantId).toBeDefined();
      expect(String(pipeline[0].$match.tenantId)).toBe(tenantId);
    }
    const egp = result.currencies.find((item: any) => item.currency === 'EGP') as any;
    expect(egp).toMatchObject({ invoiced: 1000, collected: 700, refunded: 50, expenses: 200, operatingResult: 750, netCash: 450 });
    expect(result.currencies.find((item: any) => item.currency === 'SAR')).toMatchObject({ invoiced: 300 });
    expect(result.outstanding).toEqual([{ currency: 'EGP', amount: 350, invoiceCount: 1 }]);
    expect(JSON.stringify(result)).not.toContain('patientId');
  });

});
