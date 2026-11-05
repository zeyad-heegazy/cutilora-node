import { describe, expect, it } from 'vitest';
import { createInvoiceSchema, recordPaymentSchema, refundPaymentSchema, reportQuerySchema, summaryQuerySchema } from '../../src/modules/clinic-finance/clinic-finance.validation.js';

describe('clinic finance request validation', () => {
  it('requires customer snapshots and bounded integer invoice lines', () => {
    const valid = createInvoiceSchema.safeParse({
      customer: { displayName: 'Patient' },
      lines: [{ description: 'Treatment', quantity: 1, unitPriceMinor: 12500 }],
    });
    expect(valid.success).toBe(true);
    expect(createInvoiceSchema.safeParse({
      customer: { displayName: 'Patient' },
      lines: [{ description: 'Treatment', quantity: 1.5, unitPriceMinor: 12500 }],
    }).success).toBe(false);
  });

  it('requires an idempotency key and integer amount for collections', () => {
    expect(recordPaymentSchema.safeParse({ amountMinor: 100, method: 'cash' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ idempotencyKey: 'payment-123', amountMinor: 100.5, method: 'cash' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ idempotencyKey: 'payment-123', amountMinor: 100, method: 'cash' }).success).toBe(true);
  });

  it('requires refund method, reason and idempotency key', () => {
    expect(refundPaymentSchema.safeParse({ idempotencyKey: 'refund-123', amountMinor: 50, reason: 'Correction' }).success).toBe(false);
    expect(refundPaymentSchema.safeParse({ idempotencyKey: 'refund-123', amountMinor: 50, reason: 'Correction', method: 'cash' }).success).toBe(true);
  });

  it('limits financial reports to a maximum 366-day range', () => {
    expect(reportQuerySchema.safeParse({ from: '2025-01-01', to: '2026-12-31' }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(true);
  });

  it('rejects inverted report date ranges', () => {
    expect(summaryQuerySchema.safeParse({ from: '2026-11-10', to: '2026-11-01' }).success).toBe(false);
    expect(summaryQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-10' }).success).toBe(true);
  });
});
