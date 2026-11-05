import { describe, expect, it } from 'vitest';
import { calculateInvoiceLines, calculateInvoiceSettlement, getReceivableAgingBucket } from '../../src/modules/clinic-finance/clinic-finance.service.js';

describe('clinic invoice calculations', () => {
  it('calculates discounts and tax using integer minor currency units', () => {
    const result = calculateInvoiceLines([
      { description: 'Treatment', quantity: 2, unitPriceMinor: 10001, discountBps: 1000, taxBps: 1400 },
    ]);
    expect(result.lines[0]).toMatchObject({
      subtotalMinor: 20002,
      discountMinor: 2000,
      taxMinor: 2520,
      totalMinor: 20522,
    });
    expect(result.totals).toEqual({ subtotalMinor: 20002, discountMinor: 2000, taxMinor: 2520, totalMinor: 20522 });
  });

  it('rejects line totals outside safe integer precision', () => {
    expect(() => calculateInvoiceLines([
      { description: 'Overflow', quantity: 10000, unitPriceMinor: Number.MAX_SAFE_INTEGER, discountBps: 0, taxBps: 0 },
    ])).toThrow();
  });

  it('supports zero-price lines without introducing floating-point amounts', () => {
    const result = calculateInvoiceLines([
      { description: 'Included service', quantity: 1, unitPriceMinor: 0, discountBps: 0, taxBps: 0 },
    ]);
    expect(result.totals.totalMinor).toBe(0);
  });

  it('uses exact basis-point arithmetic for large valid minor-unit values', () => {
    const result = calculateInvoiceLines([
      { description: 'High value', quantity: 1, unitPriceMinor: 9000000000000000, discountBps: 3333, taxBps: 1750 },
    ]);
    expect(result.lines[0].discountMinor).toBe(2999700000000000);
    expect(result.lines[0].taxMinor).toBe(1050052500000000);
    expect(Number.isSafeInteger(result.lines[0].totalMinor)).toBe(true);
  });
});

describe('receivable aging buckets', () => {
  it.each([
    [-1, 'current'],
    [0, 'current'],
    [1, 'days1To30'],
    [30, 'days1To30'],
    [31, 'days31To60'],
    [60, 'days31To60'],
    [61, 'days61To90'],
    [90, 'days61To90'],
    [91, 'over90Days'],
  ])('classifies %i overdue days', (days, bucket) => {
    expect(getReceivableAgingBucket(days)).toBe(bucket);
  });
});

describe('invoice credit note settlement', () => {
  it('reduces the outstanding receivable without changing recorded collections', () => {
    expect(calculateInvoiceSettlement(10000, 2500, 0, 0)).toEqual({
      balanceDueMinor: 7500, creditBalanceMinor: 0, status: 'partially_credited',
    });
  });

  it('tracks a customer credit when a paid invoice receives a credit note', () => {
    expect(calculateInvoiceSettlement(10000, 2000, 10000, 0)).toEqual({
      balanceDueMinor: 0, creditBalanceMinor: 2000, status: 'paid',
    });
  });

  it('supports fully crediting an unpaid invoice', () => {
    expect(calculateInvoiceSettlement(10000, 10000, 0, 0)).toEqual({
      balanceDueMinor: 0, creditBalanceMinor: 0, status: 'credited',
    });
  });

  it('recalculates the receivable after a refund on a credited invoice', () => {
    expect(calculateInvoiceSettlement(10000, 2000, 5000, 4000)).toEqual({
      balanceDueMinor: 7000, creditBalanceMinor: 0, status: 'partially_paid',
    });
  });
});
